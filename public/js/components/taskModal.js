/**
 * Chronos Planner - Add & Edit Task Modal Component
 */

import { Utils } from '../utils.js';
import { syncQueue } from '../syncQueue.js';

export class TaskModalComponent extends EventTarget {
  constructor() {
    super();
    this.modalEl = null;
    this.currentDate = Utils.formatDate();
    this.editingTask = null;
    this.onSaved = () => {};

    this.createModalDOM();
  }

  createModalDOM() {
    let el = document.getElementById('taskModalOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'taskModalOverlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
    }
    this.modalEl = el;

    this.modalEl.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title" id="taskModalTitle">New Task</h3>
          <button class="btn-icon" id="btnTaskModalClose" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <form id="taskModalForm" class="modal-body">
          <div class="form-group">
            <label class="form-label" for="taskTextInput">Task Title *</label>
            <input type="text" id="taskTextInput" class="form-input" placeholder="e.g. Implement OAuth webhook handler" required autofocus />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-group">
              <label class="form-label" for="taskPrioritySelect">Priority</label>
              <select id="taskPrioritySelect" class="form-select">
                <option value="High">🔴 High Priority</option>
                <option value="Medium" selected>🟡 Medium Priority</option>
                <option value="Low">🔵 Low Priority</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="taskStatusSelect">Status</label>
              <select id="taskStatusSelect" class="form-select">
                <option value="To Do" selected>To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Undone">Undone</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="taskTagsInput">Tags (comma separated)</label>
            <input type="text" id="taskTagsInput" class="form-input" placeholder="e.g. Backend, Auth, Review" />
          </div>

          <div class="form-group">
            <label class="form-label" for="taskNoteInput">Notes / Details</label>
            <textarea id="taskNoteInput" class="form-textarea" rows="3" placeholder="Additional instructions, links, or notes..."></textarea>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
            <input type="checkbox" id="taskIsDefaultCheckbox" style="width: 16px; height: 16px; accent-color: var(--color-primary); cursor: pointer;" />
            <label for="taskIsDefaultCheckbox" style="font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
              Auto-repeat this task every day (Recurring)
            </label>
          </div>
        </form>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="btnTaskModalCancel">Cancel</button>
          <button type="submit" form="taskModalForm" class="btn-primary" id="btnTaskModalSubmit">Save Task</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const closeBtn = this.modalEl.querySelector('#btnTaskModalClose');
    const cancelBtn = this.modalEl.querySelector('#btnTaskModalCancel');
    const form = this.modalEl.querySelector('#taskModalForm');

    const hide = () => this.close();

    closeBtn.addEventListener('click', hide);
    cancelBtn.addEventListener('click', hide);
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modalEl.classList.contains('active')) {
        hide();
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  open(date, task = null, onSaved = () => {}) {
    this.currentDate = date;
    this.editingTask = task;
    this.onSaved = onSaved;

    const titleEl = this.modalEl.querySelector('#taskModalTitle');
    const textInput = this.modalEl.querySelector('#taskTextInput');
    const prioritySelect = this.modalEl.querySelector('#taskPrioritySelect');
    const statusSelect = this.modalEl.querySelector('#taskStatusSelect');
    const tagsInput = this.modalEl.querySelector('#taskTagsInput');
    const noteInput = this.modalEl.querySelector('#taskNoteInput');
    const isDefaultCb = this.modalEl.querySelector('#taskIsDefaultCheckbox');

    if (task) {
      titleEl.textContent = 'Edit Task';
      textInput.value = task.text || '';
      prioritySelect.value = task.priority || 'Medium';
      statusSelect.value = task.status || (task.completed ? 'Completed' : 'To Do');
      tagsInput.value = Array.isArray(task.tags) ? task.tags.join(', ') : '';
      noteInput.value = task.note || '';
      isDefaultCb.checked = !!task.is_default;
    } else {
      titleEl.textContent = 'New Task';
      textInput.value = '';
      prioritySelect.value = 'Medium';
      statusSelect.value = 'To Do';
      tagsInput.value = '';
      noteInput.value = '';
      isDefaultCb.checked = false;
    }

    this.modalEl.classList.add('active');
    setTimeout(() => textInput.focus(), 50);
  }

  close() {
    this.modalEl.classList.remove('active');
  }

  handleSubmit() {
    const textInput = this.modalEl.querySelector('#taskTextInput');
    const prioritySelect = this.modalEl.querySelector('#taskPrioritySelect');
    const statusSelect = this.modalEl.querySelector('#taskStatusSelect');
    const tagsInput = this.modalEl.querySelector('#taskTagsInput');
    const noteInput = this.modalEl.querySelector('#taskNoteInput');
    const isDefaultCb = this.modalEl.querySelector('#taskIsDefaultCheckbox');

    const text = textInput.value.trim();
    if (!text) return;

    const priority = prioritySelect.value;
    const status = statusSelect.value;
    const tags = tagsInput.value.split(',').map(t => t.trim()).filter(Boolean);
    const note = noteInput.value.trim();
    const is_default = isDefaultCb.checked;

    if (this.editingTask) {
      // Optimistic Edit
      const result = syncQueue.optimisticEditTask(this.currentDate, this.editingTask.id, {
        text,
        priority,
        status,
        tags,
        note,
        is_default
      });
      Utils.toast('Task updated', 'success');
      if (this.onSaved && result) this.onSaved(result.plan);
    } else {
      // Optimistic Add
      const result = syncQueue.optimisticAddTask(this.currentDate, {
        text,
        priority,
        status,
        tags,
        note,
        is_default
      });
      Utils.toast('Task created', 'success');
      if (this.onSaved && result) this.onSaved(result.plan);
    }

    this.close();
  }
}
