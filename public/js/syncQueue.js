/**
 * Chronos Planner - Non-Blocking Asynchronous Sync Queue & Cache Manager
 * Ensures zero UI freezes even if Render APIs take 60s to wake up.
 */

import { api } from './api.js';
import { Utils } from './utils.js';

class SyncQueueManager {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.activeTaskStartTime = null;
    this.timerInterval = null;
    this.maxRetries = 3;
    this.listeners = {};

    // Load un-synced queue from storage if any
    this.loadPersistedQueue();
  }

  addEventListener(type, callback) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }

  removeEventListener(type, callback) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
  }

  dispatchEvent(event) {
    if (!this.listeners[event.type]) return true;
    this.listeners[event.type].forEach(cb => {
      try { cb(event); } catch (e) { console.error(e); }
    });
    return true;
  }

  // ------------------------------------------------------------------------
  // Local Cache Methods
  // ------------------------------------------------------------------------

  getCacheKey(date) {
    return `chronos_plan_${date}`;
  }

  getCachedPlan(date) {
    try {
      const data = localStorage.getItem(this.getCacheKey(date));
      return data ? Utils.normalizeDailyPlan(JSON.parse(data), date) : null;
    } catch (e) {
      console.error('Error reading cache:', e);
      return null;
    }
  }

  setCachedPlan(date, plan) {
    try {
      const normalized = Utils.normalizeDailyPlan(plan, date);
      localStorage.setItem(this.getCacheKey(date), JSON.stringify(normalized));
      return normalized;
    } catch (e) {
      console.error('Error writing cache:', e);
    }
  }

  /**
   * Clear all date-based cached plans from local storage
   */
  clearAllCachedPlans() {
    try {
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('chronos_plan_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (e) {
      console.error('Error clearing plan cache:', e);
    }
  }

  /**
   * Get clean skeleton plan for empty state (no fake placeholders)
   */
  createDefaultPlan(date) {
    return {
      success: true,
      date: date,
      is_today: Utils.isToday(date),
      summary: {
        total_tasks: 0,
        completed_tasks: 0,
        pending_tasks: 0,
        completion_pct: 0
      },
      tasks: [],
      schedule: {},
      notes: '',
      sleep_log: null,
      cascaded_items: null
    };
  }

  /**
   * Recalculate summary metrics from tasks array
   */
  recomputeSummary(plan) {
    if (!plan) return plan;
    const tasks = plan.tasks || [];
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed || t.status === 'Completed').length;
    const pending = total - completed;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    plan.summary = {
      total_tasks: total,
      completed_tasks: completed,
      pending_tasks: pending,
      completion_pct: pct
    };
    return plan;
  }

  // ------------------------------------------------------------------------
  // Queue Management
  // ------------------------------------------------------------------------

  loadPersistedQueue() {
    try {
      const raw = localStorage.getItem('chronos_pending_queue');
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch (e) {
      this.queue = [];
    }
  }

  persistQueue() {
    try {
      localStorage.setItem('chronos_pending_queue', JSON.stringify(this.queue));
    } catch (e) {
      console.error('Failed to persist queue:', e);
    }
    this.notifyQueueChange();
  }

  notifyQueueChange() {
    this.dispatchEvent(new CustomEvent('queue:change', {
      detail: {
        pendingCount: this.queue.filter(q => q.status === 'pending' || q.status === 'processing').length,
        items: this.queue,
        isProcessing: this.isProcessing,
        activeDuration: this.getActiveDuration()
      }
    }));
  }

  getActiveDuration() {
    if (!this.activeTaskStartTime) return 0;
    return Math.round((Date.now() - this.activeTaskStartTime) / 1000);
  }

  enqueue(action) {
    const queueItem = {
      id: Utils.generateTempId(),
      type: action.type,
      date: action.date,
      targetId: action.targetId || null,
      payload: action.payload,
      retryCount: 0,
      status: 'pending',
      createdAt: Date.now(),
      error: null
    };

    this.queue.push(queueItem);
    this.persistQueue();

    // Signal inline item that sync is pending
    if (queueItem.targetId) {
      this.dispatchItemStatus(queueItem.targetId, 'syncing');
    }

    this.processNext();
    return queueItem;
  }

  dispatchItemStatus(targetId, status, error = null) {
    this.dispatchEvent(new CustomEvent('item:status', {
      detail: { targetId, status, error }
    }));
  }

  async processNext() {
    if (this.isProcessing) return;

    const nextItem = this.queue.find(q => q.status === 'pending');
    if (!nextItem) {
      this.isProcessing = false;
      this.activeTaskStartTime = null;
      if (this.timerInterval) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
      }
      this.notifyQueueChange();
      return;
    }

    this.isProcessing = true;
    nextItem.status = 'processing';
    this.activeTaskStartTime = Date.now();

    // Start timer interval to tick seconds for cold start feedback
    if (!this.timerInterval) {
      this.timerInterval = setInterval(() => {
        this.notifyQueueChange();
      }, 1000);
    }

    this.notifyQueueChange();

    try {
      await this.executeAction(nextItem);
      nextItem.status = 'completed';
      
      if (nextItem.targetId) {
        this.dispatchItemStatus(nextItem.targetId, 'synced');
      }

      // Remove completed from queue after brief delay
      this.queue = this.queue.filter(q => q.id !== nextItem.id);
    } catch (err) {
      console.warn(`Sync queue task failed (${nextItem.type}):`, err);
      nextItem.retryCount += 1;
      nextItem.error = err.message;

      if (nextItem.retryCount < this.maxRetries) {
        nextItem.status = 'pending'; // will retry
      } else {
        nextItem.status = 'failed';
        if (nextItem.targetId) {
          this.dispatchItemStatus(nextItem.targetId, 'error', err.message);
        }
        Utils.toast(`Sync delayed: ${err.message}`, 'error', 4000);
      }
    } finally {
      this.persistQueue();
      this.isProcessing = false;
      // Continue next item in queue without blocking
      setTimeout(() => this.processNext(), 100);
    }
  }

  async executeAction(item) {
    switch (item.type) {
      case 'TASK_ADD': {
        const result = await api.addTask(item.payload);
        if (result && result.task && item.targetId) {
          // If the task had a temp ID, update in local cache to real ID
          this.updateTaskIdInCache(item.date, item.targetId, result.task.id, result.task);
          this.dispatchEvent(new CustomEvent('task:idReplaced', {
            detail: { oldId: item.targetId, newId: result.task.id, task: result.task, date: item.date }
          }));
        }
        break;
      }
      case 'TASK_TOGGLE':
        await api.toggleTask(item.date, item.targetId);
        break;
      case 'TASK_EDIT':
        await api.editTask(item.payload);
        break;
      case 'TASK_DELETE':
        await api.deleteTask(item.date, item.targetId);
        break;
      case 'TASK_DUPLICATE': {
        const dupResult = await api.duplicateTask(item.date, item.targetId);
        if (dupResult && dupResult.task) {
          this.dispatchEvent(new CustomEvent('task:duplicated', {
            detail: { task: dupResult.task, date: item.date }
          }));
        }
        break;
      }
      case 'TASK_REORDER':
        await api.reorderTasks(item.date, item.payload.task_ids);
        break;
      case 'SCHEDULE_UPDATE':
        await api.updateScheduleSlot(item.payload);
        break;
      case 'NOTES_UPDATE':
        await api.updateDailyNotes(item.date, item.payload.notes);
        break;
      default:
        console.warn('Unknown action type:', item.type);
    }
  }

  updateTaskIdInCache(date, oldId, newId, fullTaskData) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return;
    const taskIndex = plan.tasks.findIndex(t => t.id === oldId);
    if (taskIndex !== -1) {
      plan.tasks[taskIndex] = { ...plan.tasks[taskIndex], ...fullTaskData, id: newId };
      this.setCachedPlan(date, plan);
    }
  }

  // ------------------------------------------------------------------------
  // High-Level Optimistic Mutation Helpers
  // ------------------------------------------------------------------------

  /**
   * Optimistically add a new task and queue backend call
   */
  optimisticAddTask(date, taskInput) {
    const tempId = Utils.generateTempId();
    const newTask = {
      id: tempId,
      text: taskInput.text,
      priority: taskInput.priority || 'Medium',
      tags: taskInput.tags || [],
      status: taskInput.status || 'To Do',
      completed: taskInput.status === 'Completed',
      note: taskInput.note || '',
      is_default: !!taskInput.is_default,
      is_spillover: false,
      spillover_count: 0,
      original_date: date,
      _optimistic: true
    };

    const plan = this.getCachedPlan(date) || this.createDefaultPlan(date);
    plan.tasks.unshift(newTask);
    this.recomputeSummary(plan);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_ADD',
      date,
      targetId: tempId,
      payload: {
        date,
        text: newTask.text,
        priority: newTask.priority,
        tags: newTask.tags,
        status: newTask.status,
        note: newTask.note,
        is_default: newTask.is_default
      }
    });

    return { plan, newTask };
  }

  /**
   * Optimistically toggle a task
   */
  optimisticToggleTask(date, taskId) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return null;

    const task = plan.tasks.find(t => t.id === taskId);
    if (!task) return null;

    task.completed = !task.completed;
    task.status = task.completed ? 'Completed' : 'To Do';
    this.recomputeSummary(plan);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_TOGGLE',
      date,
      targetId: taskId,
      payload: { date, task_id: taskId }
    });

    return { plan, task };
  }

  /**
   * Optimistically edit a task
   */
  optimisticEditTask(date, taskId, updates) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return null;

    const taskIndex = plan.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return null;

    const task = { ...plan.tasks[taskIndex], ...updates };
    if (updates.status) {
      task.completed = updates.status === 'Completed';
    }
    plan.tasks[taskIndex] = task;
    this.recomputeSummary(plan);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_EDIT',
      date,
      targetId: taskId,
      payload: {
        date,
        task_id: taskId,
        ...updates
      }
    });

    return { plan, task };
  }

  /**
   * Optimistically delete a task
   */
  optimisticDeleteTask(date, taskId) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return null;

    const deletedTask = plan.tasks.find(t => t.id === taskId);
    plan.tasks = plan.tasks.filter(t => t.id !== taskId);
    this.recomputeSummary(plan);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_DELETE',
      date,
      targetId: taskId,
      payload: { date, task_id: taskId }
    });

    return { plan, deletedTask };
  }

  /**
   * Optimistically duplicate a task
   */
  optimisticDuplicateTask(date, taskId) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return null;

    const original = plan.tasks.find(t => t.id === taskId);
    if (!original) return null;

    const tempId = Utils.generateTempId();
    const clonedTask = {
      ...original,
      id: tempId,
      _optimistic: true
    };

    const origIndex = plan.tasks.findIndex(t => t.id === taskId);
    plan.tasks.splice(origIndex + 1, 0, clonedTask);
    this.recomputeSummary(plan);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_DUPLICATE',
      date,
      targetId: taskId,
      payload: { date, task_id: taskId }
    });

    return { plan, clonedTask };
  }

  /**
   * Optimistically update a schedule slot
   */
  optimisticUpdateSchedule(date, slot, activity, mood, is_default = false) {
    const plan = this.getCachedPlan(date) || this.createDefaultPlan(date);
    if (!plan.schedule) plan.schedule = {};

    plan.schedule[slot] = {
      activity: activity || '',
      mood: mood || '😄',
      is_default: !!is_default
    };
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'SCHEDULE_UPDATE',
      date,
      targetId: `slot_${slot}`,
      payload: {
        date,
        slot,
        activity,
        mood,
        is_default
      }
    });

    return plan;
  }

  /**
   * Optimistically update daily notes
   */
  optimisticUpdateNotes(date, notes) {
    const plan = this.getCachedPlan(date) || this.createDefaultPlan(date);
    plan.notes = notes;
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'NOTES_UPDATE',
      date,
      targetId: 'daily_notes',
      payload: { date, notes }
    });

    return plan;
  }

  /**
   * Reorder tasks in local cache and queue
   */
  optimisticReorderTasks(date, taskIds) {
    const plan = this.getCachedPlan(date);
    if (!plan || !plan.tasks) return null;

    const taskMap = new Map(plan.tasks.map(t => [t.id, t]));
    plan.tasks = taskIds.map(id => taskMap.get(id)).filter(Boolean);
    this.setCachedPlan(date, plan);

    this.enqueue({
      type: 'TASK_REORDER',
      date,
      targetId: 'tasks_reorder',
      payload: { date, task_ids: taskIds }
    });

    return plan;
  }

  /**
   * Force retry all failed actions
   */
  retryFailed() {
    let count = 0;
    this.queue.forEach(item => {
      if (item.status === 'failed') {
        item.status = 'pending';
        item.retryCount = 0;
        item.error = null;
        count++;
      }
    });
    if (count > 0) {
      this.persistQueue();
      this.processNext();
      Utils.toast(`Retrying ${count} queued task(s)...`, 'info');
    }
  }

  /**
   * Clear all items in queue
   */
  clearQueue() {
    this.queue = [];
    this.persistQueue();
    this.processNext();
  }
}

export const syncQueue = new SyncQueueManager();
