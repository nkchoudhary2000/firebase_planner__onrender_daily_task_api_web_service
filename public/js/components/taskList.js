/**
 * Chronos Planner - Task List Component
 */

import { Utils } from '../utils.js';
import { syncQueue } from '../syncQueue.js';

export class TaskListComponent {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.currentDate = options.currentDate || Utils.formatDate();
    this.tasks = [];
    this.filter = 'all'; // 'all', 'active', 'completed', 'high'
    this.selectedTag = null;
    this.onEditTask = options.onEditTask || (() => {});
    this.onSummaryChanged = options.onSummaryChanged || (() => {});
    this.listeners = {};
    
    this.syncStatuses = new Map(); // taskId -> 'syncing' | 'synced' | 'error'

    this.bindEvents();
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
    if (event && event.type === 'task:summaryChanged' && this.onSummaryChanged && event.detail) {
      this.onSummaryChanged(event.detail.plan);
    }
    if (!this.listeners[event.type]) return true;
    this.listeners[event.type].forEach(cb => {
      try { cb(event); } catch (e) { console.error(e); }
    });
    return true;
  }

  bindEvents() {
    // Listen to syncQueue item status changes
    syncQueue.addEventListener('item:status', (e) => {
      const { targetId, status } = e.detail;
      if (targetId) {
        this.syncStatuses.set(targetId, status);
        this.updateItemSyncUI(targetId, status);
      }
    });

    // Listen to real ID replacement from backend
    syncQueue.addEventListener('task:idReplaced', (e) => {
      const { oldId, newId, task, date } = e.detail;
      if (date === this.currentDate) {
        this.replaceTaskId(oldId, newId, task);
      }
    });

    // Listen to duplicate event
    syncQueue.addEventListener('task:duplicated', (e) => {
      const { task, date } = e.detail;
      if (date === this.currentDate) {
        const plan = syncQueue.getCachedPlan(date);
        if (plan) {
          this.render(plan.tasks, date);
        }
      }
    });
  }

  setDate(date) {
    this.currentDate = date;
  }

  setFilter(filter) {
    this.filter = filter;
    this.renderTasksOnly();
  }

  setTagFilter(tag) {
    this.selectedTag = this.selectedTag === tag ? null : tag;
    this.renderTasksOnly();
  }

  render(tasks = [], date = this.currentDate) {
    this.tasks = tasks || [];
    this.currentDate = date;
    this.renderTasksOnly();
  }

  getFilteredTasks() {
    let list = [...this.tasks];

    if (this.filter === 'active') {
      list = list.filter(t => !t.completed && t.status !== 'Completed');
    } else if (this.filter === 'completed') {
      list = list.filter(t => t.completed || t.status === 'Completed');
    } else if (this.filter === 'high') {
      list = list.filter(t => t.priority === 'High');
    }

    if (this.selectedTag) {
      list = list.filter(t => Array.isArray(t.tags) && t.tags.includes(this.selectedTag));
    }

    return list;
  }

  renderTasksOnly() {
    if (!this.container) return;

    const filtered = this.getFilteredTasks();

    if (filtered.length === 0) {
      this.container.innerHTML = `
        <div class="empty-state-box">
          <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="9" y1="13" x2="15" y2="13"></line>
            <line x1="9" y1="17" x2="12" y2="17"></line>
          </svg>
          <h3 class="empty-state-title">No tasks found</h3>
          <p class="empty-state-text">
            ${this.filter !== 'all' || this.selectedTag 
              ? 'No tasks match the active filters. Try clearing your filters.' 
              : 'Add your first task for today using the input bar above!'}
          </p>
        </div>
      `;
      return;
    }

    this.container.innerHTML = filtered.map(task => this.renderTaskCard(task)).join('');
    this.attachCardEventListeners();
  }

  renderTaskCard(task) {
    const isCompleted = !!(task.completed || task.status === 'Completed' || task.done);
    const priority = task.priority || 'Medium';
    const priorityClass = priority.toLowerCase();
    const tags = Array.isArray(task.tags) ? task.tags : [];
    const syncStatus = this.syncStatuses.get(String(task.id));
    const titleText = task.text || task.title || task.name || task.task || task.description || 'Untitled Task';

    return `
      <div class="task-card ${isCompleted ? 'completed' : ''}" 
           id="task_${task.id}" 
           data-task-id="${task.id}" 
           data-priority="${priority}"
           draggable="true">
        
        <label class="task-checkbox-container" title="Mark as ${isCompleted ? 'Pending' : 'Completed'}">
          <input type="checkbox" class="task-checkbox" data-action="toggle" ${isCompleted ? 'checked' : ''} />
        </label>

        <div class="task-body">
          <div class="task-header-row">
            <span class="task-title" data-action="edit" title="Click to edit task">${Utils.escapeHtml(titleText)}</span>
            
            <div class="task-actions">
              ${syncStatus === 'syncing' ? `
                <span class="inline-sync-badge" title="Syncing with Render in background...">
                  <span class="sync-spinner"></span> Syncing
                </span>
              ` : ''}
              <button class="btn-task-action" data-action="edit" title="Edit Task">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
              <button class="btn-task-action" data-action="duplicate" title="Duplicate Task">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
              <button class="btn-task-action delete" data-action="delete" title="Delete Task">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>

          <div class="task-badges">
            <span class="badge badge-priority ${priorityClass}">
              ${priority === 'High' ? '🔴 High' : priority === 'Medium' ? '🟡 Medium' : '🔵 Low'}
            </span>

            ${tags.map(t => `<span class="badge badge-tag" data-tag="${Utils.escapeHtml(t)}">#${Utils.escapeHtml(t)}</span>`).join('')}

            ${task.is_default ? `<span class="badge badge-recur" title="Recurs Daily">🔁 Daily</span>` : ''}

            ${task.is_spillover ? `
              <span class="badge badge-spillover" title="Spilled over from previous day">
                ⚠️ Rollover ${task.spillover_count > 1 ? `(${task.spillover_count}d)` : ''}
              </span>
            ` : ''}
          </div>

          ${task.note ? `
            <div class="task-note-snippet">
              ${Utils.escapeHtml(task.note)}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  attachCardEventListeners() {
    const cards = this.container.querySelectorAll('.task-card');

    cards.forEach(card => {
      const taskId = card.getAttribute('data-task-id');
      const task = this.tasks.find(t => String(t.id || t.task_id) === String(taskId));
      if (!task) return;

      // Checkbox Toggle
      const checkbox = card.querySelector('input.task-checkbox');
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          e.stopPropagation();
          this.handleToggleTask(taskId);
        });
      }

      // Action Buttons
      const editButtons = card.querySelectorAll('[data-action="edit"]');
      editButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.onEditTask(task);
        });
      });

      const dupBtn = card.querySelector('[data-action="duplicate"]');
      if (dupBtn) {
        dupBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDuplicateTask(taskId);
        });
      }

      const delBtn = card.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDeleteTask(taskId);
        });
      }

      // Tag Click Filter
      const tagBadges = card.querySelectorAll('.badge-tag');
      tagBadges.forEach(badge => {
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          const tag = badge.getAttribute('data-tag');
          this.setTagFilter(tag);
        });
      });

      // Drag and Drop
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', taskId);
        card.style.opacity = '0.5';
      });

      card.addEventListener('dragend', () => {
        card.style.opacity = '1';
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.style.borderTop = '2px solid var(--color-primary)';
      });

      card.addEventListener('dragleave', () => {
        card.style.borderTop = '';
      });

      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.style.borderTop = '';
        const draggedId = e.dataTransfer.getData('text/plain');
        if (draggedId && draggedId !== taskId) {
          this.handleReorder(draggedId, taskId);
        }
      });
    });
  }

  handleToggleTask(taskId) {
    const result = syncQueue.optimisticToggleTask(this.currentDate, taskId);
    if (result) {
      const card = this.container.querySelector(`#task_${taskId}`);
      if (card) {
        const isCompleted = result.task.completed;
        card.classList.toggle('completed', isCompleted);
        const cb = card.querySelector('input.task-checkbox');
        if (cb) cb.checked = isCompleted;
      }
      this.dispatchEvent(new CustomEvent('task:summaryChanged', { detail: { plan: result.plan } }));
    }
  }

  handleDuplicateTask(taskId) {
    const result = syncQueue.optimisticDuplicateTask(this.currentDate, taskId);
    if (result) {
      this.tasks = result.plan.tasks;
      this.renderTasksOnly();
      Utils.toast('Task duplicated', 'success');
      this.dispatchEvent(new CustomEvent('task:summaryChanged', { detail: { plan: result.plan } }));
    }
  }

  handleDeleteTask(taskId) {
    const result = syncQueue.optimisticDeleteTask(this.currentDate, taskId);
    if (result) {
      this.tasks = result.plan.tasks;
      const card = this.container.querySelector(`#task_${taskId}`);
      if (card) {
        card.style.transition = 'all 0.2s ease';
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => this.renderTasksOnly(), 200);
      }
      Utils.toast('Task deleted', 'info');
      this.dispatchEvent(new CustomEvent('task:summaryChanged', { detail: { plan: result.plan } }));
    }
  }

  handleReorder(draggedId, targetId) {
    const fromIndex = this.tasks.findIndex(t => t.id === draggedId);
    const toIndex = this.tasks.findIndex(t => t.id === targetId);
    if (fromIndex === -1 || toIndex === -1) return;

    const [moved] = this.tasks.splice(fromIndex, 1);
    this.tasks.splice(toIndex, 0, moved);

    const taskIds = this.tasks.map(t => t.id);
    const plan = syncQueue.optimisticReorderTasks(this.currentDate, taskIds);
    this.renderTasksOnly();
  }

  updateItemSyncUI(taskId, status) {
    const card = this.container.querySelector(`#task_${taskId}`);
    if (!card) return;

    const actionsContainer = card.querySelector('.task-actions');
    if (!actionsContainer) return;

    const existingBadge = actionsContainer.querySelector('.inline-sync-badge');

    if (status === 'syncing') {
      if (!existingBadge) {
        const badge = document.createElement('span');
        badge.className = 'inline-sync-badge';
        badge.title = 'Syncing with Render in background...';
        badge.innerHTML = `<span class="sync-spinner"></span> Syncing`;
        actionsContainer.insertBefore(badge, actionsContainer.firstChild);
      }
    } else {
      if (existingBadge) {
        existingBadge.remove();
      }
    }
  }

  replaceTaskId(oldId, newId, fullTaskData) {
    const taskIndex = this.tasks.findIndex(t => t.id === oldId);
    if (taskIndex !== -1) {
      this.tasks[taskIndex] = { ...this.tasks[taskIndex], ...fullTaskData, id: newId };
      const card = this.container.querySelector(`#task_${oldId}`);
      if (card) {
        card.id = `task_${newId}`;
        card.setAttribute('data-task-id', newId);
      }
    }
  }
}
