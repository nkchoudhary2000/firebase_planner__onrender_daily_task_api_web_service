/**
 * Chronos Planner - Hourly Schedule & Activity Timeline Component
 */

import { Utils } from '../utils.js';

export class ScheduleViewComponent extends EventTarget {
  constructor(containerElement, options = {}) {
    super();
    this.container = containerElement;
    this.currentDate = options.currentDate || Utils.formatDate();
    this.scheduleData = {};
    this.onEditSlot = options.onEditSlot || (() => {});

    this.defaultSlots = [
      "05:00 - 06:00 AM",
      "06:00 - 07:00 AM",
      "07:00 - 08:00 AM",
      "08:00 - 09:00 AM",
      "09:00 - 10:00 AM",
      "10:00 - 11:00 AM",
      "11:00 - 12:00 PM",
      "12:00 - 01:00 PM",
      "01:00 - 02:00 PM",
      "02:00 - 03:00 PM",
      "03:00 - 04:00 PM",
      "04:00 - 05:00 PM",
      "05:00 - 06:00 PM",
      "06:00 - 07:00 PM",
      "07:00 - 08:00 PM",
      "08:00 - 09:00 PM",
      "09:00 - 10:00 PM",
      "10:00 - 11:00 PM",
      "11:00 - 12:00 AM",
      "12:00 - 01:00 AM",
      "01:00 - 02:00 AM",
      "02:00 - 03:00 AM",
      "03:00 - 04:00 AM",
      "04:00 - 05:00 AM"
    ];
  }

  setDate(date) {
    this.currentDate = date;
  }

  /**
   * Find matching slot data with fuzzy time format support
   * @param {string} standardSlot 
   * @returns {{item: object|null, matchedKey: string|null}}
   */
  findSlotData(standardSlot) {
    if (this.scheduleData[standardSlot]) {
      return { item: this.scheduleData[standardSlot], matchedKey: standardSlot };
    }

    // Try normalized match (remove leading zeros, spaces, case differences)
    const norm = (s) => s.toLowerCase().replace(/\s+/g, '').replace(/^0/, '');
    const targetNorm = norm(standardSlot);

    for (const [key, val] of Object.entries(this.scheduleData)) {
      if (norm(key) === targetNorm || norm(key).includes(targetNorm) || targetNorm.includes(norm(key))) {
        return { item: val, matchedKey: key };
      }
    }

    return { item: null, matchedKey: null };
  }

  render(schedule = {}, date = this.currentDate) {
    this.scheduleData = schedule || {};
    this.currentDate = date;
    if (!this.container) return;

    const matchedKeys = new Set();
    const standardSlotRenderList = this.defaultSlots.map(slot => {
      const { item, matchedKey } = this.findSlotData(slot);
      if (matchedKey) matchedKeys.add(matchedKey);
      return { slotKey: slot, item: item || {} };
    });

    // Extract any custom event slots that didn't match the 24 standard hours
    const customEventSlots = Object.entries(this.scheduleData)
      .filter(([key]) => !matchedKeys.has(key))
      .map(([key, val]) => ({ slotKey: key, item: val || {} }));

    const filledStandardCount = standardSlotRenderList.filter(s => s.item.activity && s.item.activity.trim()).length;
    const filledCustomCount = customEventSlots.filter(s => s.item.activity && s.item.activity.trim()).length;
    const totalFilled = filledStandardCount + filledCustomCount;

    this.container.innerHTML = `
      <div class="schedule-header-status" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; padding: 0 0.25rem;">
        <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-primary);">
          ${totalFilled > 0 ? `✨ ${totalFilled} Active Event${totalFilled > 1 ? 's' : ''}` : '🕒 24-Hour Daily Timeline'}
        </span>
        <span style="font-size: 0.7rem; color: var(--text-muted);">
          ${totalFilled > 0 ? 'Click slot to edit' : 'Click any slot to schedule'}
        </span>
      </div>

      ${customEventSlots.length > 0 ? `
        <div class="custom-events-section" style="margin-bottom: 1rem; padding: 0.6rem; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 0.6rem;">
          <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em;">
            📌 Custom Activities & Events (${customEventSlots.length})
          </div>
          <div class="schedule-timeline">
            ${customEventSlots.map(s => this.renderSlotItem(s.slotKey, s.item, true)).join('')}
          </div>
        </div>
      ` : ''}

      <div class="schedule-timeline">
        ${standardSlotRenderList.map(s => this.renderSlotItem(s.slotKey, s.item, false)).join('')}
      </div>
    `;

    this.attachEventListeners();
  }

  renderSlotItem(slotKey, item = {}, isCustom = false) {
    const hasActivity = !!(item.activity && item.activity.trim());
    const mood = item.mood || '⏱️';
    const isDefault = !!item.is_default;

    return `
      <div class="schedule-slot-item ${hasActivity ? 'filled' : ''} ${isCustom ? 'custom-slot' : ''}" 
           data-slot="${Utils.escapeHtml(slotKey)}"
           style="${hasActivity ? 'border-left: 3px solid var(--color-primary); background: var(--bg-surface-elevated);' : ''}">
        <span class="slot-time" style="font-weight: 600;">${Utils.escapeHtml(slotKey)}</span>
        <span class="slot-mood">${mood}</span>
        <span class="slot-activity" title="${Utils.escapeHtml(item.activity || 'Click to add plan')}">
          ${hasActivity 
            ? `<strong style="color: var(--text-primary); font-size: 0.85rem;">${Utils.escapeHtml(item.activity)}</strong>` 
            : '<span style="color: var(--text-muted); opacity: 0.6;">+ Add schedule...</span>'}
        </span>
        ${isDefault ? '<span class="badge badge-recur" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;" title="Recurs Daily">🔁</span>' : ''}
        ${isCustom ? '<span class="badge badge-tag" style="font-size: 0.6rem; padding: 0.1rem 0.3rem;">Event</span>' : ''}
      </div>
    `;
  }

  attachEventListeners() {
    const slotElements = this.container.querySelectorAll('.schedule-slot-item');
    slotElements.forEach(el => {
      el.addEventListener('click', () => {
        const slotKey = el.getAttribute('data-slot');
        const { item } = this.findSlotData(slotKey);
        const slotItem = item || { activity: '', mood: '😄', is_default: false };
        this.onEditSlot(slotKey, slotItem);
      });
    });
  }
}
