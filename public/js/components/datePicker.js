/**
 * Chronos Planner - Date Navigation & Strip Component
 */

import { Utils } from '../utils.js';

export class DatePickerComponent {
  constructor(containerElement, initialDate = Utils.formatDate(), onDateChange = null) {
    this.container = containerElement;
    this.currentDate = initialDate;
    this.onDateChange = onDateChange;
    this.listeners = {};
    this.render();
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
    if (event && event.type === 'date:change' && this.onDateChange && event.detail) {
      this.onDateChange(event.detail.date);
    }
    if (!this.listeners[event.type]) return true;
    this.listeners[event.type].forEach(cb => {
      try { cb(event); } catch (e) { console.error(e); }
    });
    return true;
  }

  setDate(newDate, emit = true) {
    if (this.currentDate === newDate) return;
    this.currentDate = newDate;
    this.render();
    if (emit) {
      this.dispatchEvent(new CustomEvent('date:change', { detail: { date: this.currentDate } }));
    }
  }

  getDate() {
    return this.currentDate;
  }

  render() {
    if (!this.container) return;

    const friendlyDate = Utils.getFriendlyDate(this.currentDate);
    const relativeLabel = Utils.getRelativeLabel(this.currentDate);
    const surroundingDates = Utils.getSurroundingDates(this.currentDate);

    this.container.innerHTML = `
      <div class="date-controls-left">
        <button class="btn-nav-date" id="btnPrevDay" title="Previous Day (Hotkey: [)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>

        <button class="btn-nav-date" id="btnToday" title="Jump to Today (Hotkey: T)">
          Today
        </button>

        <button class="btn-nav-date" id="btnNextDay" title="Next Day (Hotkey: ])">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>

        <div class="current-date-badge">
          <div class="current-date-title">
            <span>${friendlyDate}</span>
            ${relativeLabel ? `<span class="today-chip">${relativeLabel}</span>` : ''}
          </div>
          <span class="current-date-sub">Traverse past or upcoming daily schedules</span>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 0.75rem;">
        <div class="date-strip">
          ${surroundingDates.map(item => `
            <div class="date-strip-item ${item.dateStr === this.currentDate ? 'active' : ''}" 
                 data-date="${item.dateStr}" 
                 title="${item.dateStr}">
              <span class="day-name">${item.dayName}</span>
              <span class="day-num">${item.dayNum}</span>
            </div>
          `).join('')}
        </div>

        <input type="date" id="datePickerInput" value="${this.currentDate}" 
               style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); color: var(--text-main); padding: 0.45rem 0.6rem; border-radius: 0.6rem; font-family: inherit; font-size: 0.85rem; outline: none; cursor: pointer;" 
               title="Pick Specific Date"/>
      </div>
    `;

    this.attachEventListeners();
  }

  attachEventListeners() {
    const prevBtn = this.container.querySelector('#btnPrevDay');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const prev = Utils.offsetDays(this.currentDate, -1);
        this.setDate(prev);
      });
    }

    const todayBtn = this.container.querySelector('#btnToday');
    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        this.setDate(Utils.formatDate());
      });
    }

    const nextBtn = this.container.querySelector('#btnNextDay');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const next = Utils.offsetDays(this.currentDate, 1);
        this.setDate(next);
      });
    }

    const stripItems = this.container.querySelectorAll('.date-strip-item');
    stripItems.forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        if (date) this.setDate(date);
      });
    });

    const dateInput = this.container.querySelector('#datePickerInput');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        if (e.target.value) {
          this.setDate(e.target.value);
        }
      });
    }
  }
}
