/**
 * Chronos Planner - Hourly Schedule Slot Edit Modal
 */

import { Utils } from '../utils.js';
import { syncQueue } from '../syncQueue.js';

export class SlotModalComponent extends EventTarget {
  constructor(options = {}) {
    super();
    this.modalEl = null;
    this.currentDate = Utils.formatDate();
    this.currentSlot = '';
    this.onSaved = options.onSaved || (() => {});

    this.moods = ['😄', '🤩', '😊', '😐', '😓', '😤', '😴', '🌧️', '💻', '🏋️', '📚', '☕'];
    this.selectedMood = '😄';

    this.createModalDOM();
  }

  createModalDOM() {
    let el = document.getElementById('slotModalOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'slotModalOverlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
    }
    this.modalEl = el;

    this.modalEl.innerHTML = `
      <div class="modal-content" style="max-width: 480px;">
        <div class="modal-header">
          <h3 class="modal-title" id="slotModalTitle">Edit Schedule Slot</h3>
          <button class="btn-icon" id="btnSlotModalClose" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <form id="slotModalForm" class="modal-body">
          <div class="form-group">
            <label class="form-label" id="slotTimeLabel">Time Slot</label>
            <input type="text" id="slotTimeDisplay" class="form-input" readonly style="opacity: 0.8;" />
          </div>

          <div class="form-group">
            <label class="form-label" for="slotActivityInput">Activity / Focus *</label>
            <input type="text" id="slotActivityInput" class="form-input" placeholder="e.g. Deep Work Sprint, Team Standup" required />
          </div>

          <div class="form-group">
            <label class="form-label">Mood / Energy</label>
            <div id="slotMoodContainer" style="display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.2rem;">
              ${this.moods.map(m => `
                <button type="button" class="btn-icon mood-btn" data-mood="${m}" style="font-size: 1.15rem; width: 38px; height: 38px;">
                  ${m}
                </button>
              `).join('')}
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.5rem; margin-top: 0.25rem;">
            <input type="checkbox" id="slotIsDefaultCheckbox" style="width: 16px; height: 16px; accent-color: var(--color-primary); cursor: pointer;" />
            <label for="slotIsDefaultCheckbox" style="font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
              Auto-repeat this time slot daily
            </label>
          </div>
        </form>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="btnSlotModalCancel">Cancel</button>
          <button type="submit" form="slotModalForm" class="btn-primary" id="btnSlotModalSubmit">Save Slot</button>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const closeBtn = this.modalEl.querySelector('#btnSlotModalClose');
    const cancelBtn = this.modalEl.querySelector('#btnSlotModalCancel');
    const form = this.modalEl.querySelector('#slotModalForm');
    const moodBtns = this.modalEl.querySelectorAll('.mood-btn');

    const hide = () => this.close();
    closeBtn.addEventListener('click', hide);
    cancelBtn.addEventListener('click', hide);
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) hide();
    });

    moodBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        moodBtns.forEach(b => b.style.borderColor = 'var(--border-subtle)');
        btn.style.borderColor = 'var(--color-primary)';
        this.selectedMood = btn.getAttribute('data-mood');
      });
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });
  }

  open(date, slot, item = {}) {
    this.currentDate = date;
    this.currentSlot = slot;
    this.selectedMood = item.mood || '😄';

    const slotTimeDisplay = this.modalEl.querySelector('#slotTimeDisplay');
    const activityInput = this.modalEl.querySelector('#slotActivityInput');
    const isDefaultCb = this.modalEl.querySelector('#slotIsDefaultCheckbox');
    const moodBtns = this.modalEl.querySelectorAll('.mood-btn');

    slotTimeDisplay.value = slot;
    activityInput.value = item.activity || '';
    isDefaultCb.checked = !!item.is_default;

    moodBtns.forEach(btn => {
      if (btn.getAttribute('data-mood') === this.selectedMood) {
        btn.style.borderColor = 'var(--color-primary)';
      } else {
        btn.style.borderColor = 'var(--border-subtle)';
      }
    });

    this.modalEl.classList.add('active');
    setTimeout(() => activityInput.focus(), 50);
  }

  close() {
    this.modalEl.classList.remove('active');
  }

  handleSubmit() {
    const activityInput = this.modalEl.querySelector('#slotActivityInput');
    const isDefaultCb = this.modalEl.querySelector('#slotIsDefaultCheckbox');

    const activity = activityInput.value.trim();
    const is_default = isDefaultCb.checked;

    const plan = syncQueue.optimisticUpdateSchedule(
      this.currentDate,
      this.currentSlot,
      activity,
      this.selectedMood,
      is_default
    );

    Utils.toast('Schedule updated', 'success');
    if (this.onSaved) this.onSaved(plan);
    this.close();
  }
}
