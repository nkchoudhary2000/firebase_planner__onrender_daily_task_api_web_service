/**
 * Chronos Planner - Utility Functions
 */

export const Utils = {
  /**
   * Format a Date object to YYYY-MM-DD string
   * @param {Date} [dateObj=new Date()]
   * @returns {string}
   */
  formatDate(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  /**
   * Parse YYYY-MM-DD into a Date object (in local timezone)
   * @param {string} dateStr 
   * @returns {Date}
   */
  parseDate(dateStr) {
    if (!dateStr) return new Date();
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  },

  /**
   * Get formatted friendly title (e.g. "Friday, Aug 21, 2026")
   * @param {string} dateStr 
   * @returns {string}
   */
  getFriendlyDate(dateStr) {
    const date = this.parseDate(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  },

  /**
   * Check if date string is today
   * @param {string} dateStr 
   * @returns {boolean}
   */
  isToday(dateStr) {
    return dateStr === this.formatDate(new Date());
  },

  /**
   * Check if date is yesterday
   * @param {string} dateStr 
   * @returns {boolean}
   */
  isYesterday(dateStr) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return dateStr === this.formatDate(yesterday);
  },

  /**
   * Check if date is tomorrow
   * @param {string} dateStr 
   * @returns {boolean}
   */
  isTomorrow(dateStr) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return dateStr === this.formatDate(tomorrow);
  },

  /**
   * Get relative label (Today, Yesterday, Tomorrow, or empty)
   * @param {string} dateStr 
   * @returns {string}
   */
  getRelativeLabel(dateStr) {
    if (this.isToday(dateStr)) return 'Today';
    if (this.isYesterday(dateStr)) return 'Yesterday';
    if (this.isTomorrow(dateStr)) return 'Tomorrow';
    return '';
  },

  /**
   * Add / subtract days from a date string
   * @param {string} dateStr 
   * @param {number} days 
   * @returns {string}
   */
  offsetDays(dateStr, days) {
    const date = this.parseDate(dateStr);
    date.setDate(date.getDate() + days);
    return this.formatDate(date);
  },

  /**
   * Generate an array of 7 dates surrounding target date (e.g. -3 to +3)
   * @param {string} centerDateStr 
   * @returns {Array<{dateStr: string, dayName: string, dayNum: string, isToday: boolean}>}
   */
  getSurroundingDates(centerDateStr) {
    const dates = [];
    const center = this.parseDate(centerDateStr);
    for (let i = -3; i <= 3; i++) {
      const d = new Date(center);
      d.setDate(d.getDate() + i);
      const str = this.formatDate(d);
      dates.push({
        dateStr: str,
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate().toString(),
        isToday: this.isToday(str)
      });
    }
    return dates;
  },

  /**
   * Generate unique temporary ID for optimistic task creation
   * @returns {string}
   */
  generateTempId() {
    return 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  },

  /**
   * Debounce helper
   * @param {Function} func 
   * @param {number} wait 
   * @returns {Function}
   */
  debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} str 
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  /**
   * Toast notification dispatcher
   * @param {string} message 
   * @param {'info'|'success'|'error'} [type='info'] 
   * @param {number} [duration=3500] 
   */
  toast(message, type = 'info', duration = 3500) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <span class="toast-icon">${iconSvg}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /**
   * Universal Daily Plan & Tasks Normalizer
   * Accepts any backend response structure and guarantees clean, consistent schema
   * @param {any} raw 
   * @param {string} [targetDate]
   * @returns {object}
   */
  normalizeDailyPlan(raw, targetDate = this.formatDate()) {
    if (!raw) {
      return {
        success: true,
        date: targetDate,
        is_today: this.isToday(targetDate),
        summary: { total_tasks: 0, completed_tasks: 0, pending_tasks: 0, completion_pct: 0 },
        tasks: [],
        schedule: {},
        notes: '',
        sleep_log: null,
        cascaded_items: null
      };
    }

    // Un-nest potential wrappers: { data: ... }, { plan: ... }, { daily_plan: ... }, { result: ... }
    const root = (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) ? raw.data
               : (raw.plan && typeof raw.plan === 'object' && !Array.isArray(raw.plan)) ? raw.plan
               : (raw.daily_plan && typeof raw.daily_plan === 'object' && !Array.isArray(raw.daily_plan)) ? raw.daily_plan
               : (raw.result && typeof raw.result === 'object' && !Array.isArray(raw.result)) ? raw.result
               : raw;

    const date = root.date || targetDate || this.formatDate();

    // 1. Extract and normalize tasks
    let rawTasks = root.tasks || root.taskList || root.todos || root.items || [];
    if (!Array.isArray(rawTasks) && Array.isArray(raw)) {
      rawTasks = raw;
    } else if (!Array.isArray(rawTasks)) {
      rawTasks = [];
    }

    const normalizedTasks = rawTasks.map((t, idx) => {
      if (!t) return null;
      // If task is a plain string
      if (typeof t === 'string') {
        return {
          id: `task_${Date.now()}_${idx}`,
          text: t,
          priority: 'Medium',
          tags: [],
          status: 'To Do',
          completed: false,
          note: '',
          is_default: false,
          is_spillover: false,
          spillover_count: 0,
          original_date: date
        };
      }

      const id = String(t.id || t.task_id || t._id || t.uid || `task_${Date.now()}_${idx}`);
      const text = String(t.text || t.title || t.name || t.task || t.description || t.content || 'Untitled Task').trim();

      const isCompleted = Boolean(
        t.completed === true || 
        t.done === true || 
        t.is_completed === true || 
        String(t.status || '').toLowerCase() === 'completed' || 
        String(t.status || '').toLowerCase() === 'done'
      );

      let status = t.status || (isCompleted ? 'Completed' : 'To Do');
      if (isCompleted && status !== 'Completed') status = 'Completed';

      let priority = 'Medium';
      const rawPriority = String(t.priority || (t.is_high_priority ? 'High' : (t.is_low_priority ? 'Low' : ''))).toLowerCase();
      if (rawPriority.includes('high')) priority = 'High';
      else if (rawPriority.includes('low')) priority = 'Low';
      else priority = 'Medium';

      let tags = [];
      if (Array.isArray(t.tags)) {
        tags = t.tags.map(tag => String(tag).trim()).filter(Boolean);
      } else if (typeof t.tags === 'string' && t.tags.trim()) {
        tags = t.tags.split(',').map(tag => tag.trim()).filter(Boolean);
      }

      const note = String(t.note || t.notes || (t.description && t.description !== text ? t.description : '') || '').trim();
      const is_default = Boolean(t.is_default || t.is_recurring || t.recurring || t.is_routine);
      const is_spillover = Boolean(t.is_spillover || t.spillover || (Number(t.spillover_count || 0) > 0));
      const spillover_count = Number(t.spillover_count || 0);
      const original_date = t.original_date || t.date || date;

      return {
        id,
        text,
        priority,
        tags,
        status,
        completed: isCompleted,
        note,
        is_default,
        is_spillover,
        spillover_count,
        original_date
      };
    }).filter(Boolean);

    // 2. Extract and normalize schedule / hourly events
    let rawSchedule = root.schedule || root.hourly_schedule || root.timeline || root.activities || root.slots || root.events || {};
    const normalizedSchedule = {};

    if (Array.isArray(rawSchedule)) {
      rawSchedule.forEach((slotItem, idx) => {
        if (!slotItem) return;
        if (typeof slotItem === 'string') {
          normalizedSchedule[`Slot ${idx + 1}`] = {
            activity: slotItem,
            mood: '⏱️',
            is_default: false
          };
          return;
        }
        const slotKey = slotItem.slot || slotItem.time || slotItem.hour || slotItem.time_slot || slotItem.title || `Slot ${idx + 1}`;
        const activity = slotItem.activity || slotItem.title || slotItem.event || slotItem.name || slotItem.description || slotItem.text || '';
        const mood = slotItem.mood || slotItem.emoji || slotItem.status || '⏱️';
        const is_default = Boolean(slotItem.is_default || slotItem.recurring || slotItem.is_routine);
        normalizedSchedule[String(slotKey).trim()] = { activity, mood, is_default };
      });
    } else if (typeof rawSchedule === 'object' && rawSchedule !== null) {
      Object.entries(rawSchedule).forEach(([slotKey, val]) => {
        if (typeof val === 'string') {
          normalizedSchedule[slotKey.trim()] = {
            activity: val,
            mood: '⏱️',
            is_default: false
          };
        } else if (typeof val === 'object' && val !== null) {
          normalizedSchedule[slotKey.trim()] = {
            activity: val.activity || val.title || val.event || val.name || val.description || val.text || '',
            mood: val.mood || val.emoji || val.status || '⏱️',
            is_default: Boolean(val.is_default || val.recurring || val.is_routine)
          };
        }
      });
    }

    // 3. Extract notes
    const notes = String(root.notes || root.daily_notes || root.reflection || root.note || '').trim();

    // 4. Calculate summary metrics
    const total = normalizedTasks.length;
    const completed = normalizedTasks.filter(t => t.completed).length;
    const pending = total - completed;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      success: true,
      date,
      is_today: this.isToday(date),
      summary: {
        total_tasks: total,
        completed_tasks: completed,
        pending_tasks: pending,
        completion_pct: pct
      },
      tasks: normalizedTasks,
      schedule: normalizedSchedule,
      notes,
      sleep_log: root.sleep_log || null,
      cascaded_items: root.cascaded_items || null,
      _raw: raw
    };
  }
};
