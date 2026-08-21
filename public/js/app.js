/**
 * Chronos Planner - Application Entry Point & Orchestrator
 */

import { Utils } from './utils.js';
import { api } from './api.js';
import { auth } from './auth.js';
import { syncQueue } from './syncQueue.js';
import { DatePickerComponent } from './components/datePicker.js';
import { TaskListComponent } from './components/taskList.js';
import { ScheduleViewComponent } from './components/scheduleView.js';
import { TaskModalComponent } from './components/taskModal.js';
import { SlotModalComponent } from './components/slotModal.js';
import { SettingsModalComponent } from './components/settingsModal.js';
import { AuthScreenComponent } from './components/authScreen.js';

class ChronosApp {
  constructor() {
    this.currentDate = Utils.formatDate();
    this.currentPlan = null;
    
    this.initTheme();
    this.initComponents();
    this.bindGlobalEvents();
    this.bindSyncQueueEvents();
    this.bindHeaderEvents();
    this.bindQuickAddEvents();
    this.bindNotesEvents();
    
    // Check Auth State Gate
    if (!auth.isLoggedIn()) {
      this.authScreen.show();
    } else {
      this.authScreen.hide();
    }

    // Initial load
    this.loadDate(this.currentDate);
    this.checkInitialConnection();
  }

  // ------------------------------------------------------------------------
  // Theme & Initialization
  // ------------------------------------------------------------------------

  initTheme() {
    const savedTheme = localStorage.getItem('chronos_theme') || 'orange';
    const savedMode = localStorage.getItem('chronos_mode') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    document.documentElement.setAttribute('data-mode', savedMode);
  }

  initComponents() {
    // 1. Date Picker
    const dateContainer = document.getElementById('dateNavBar');
    this.datePicker = new DatePickerComponent(dateContainer, this.currentDate);
    this.datePicker.addEventListener('date:change', (e) => {
      this.loadDate(e.detail.date);
    });

    // 2. Modals
    this.taskModal = new TaskModalComponent();
    this.slotModal = new SlotModalComponent({
      onSaved: (plan) => this.renderDailyPlan(plan)
    });
    this.settingsModal = new SettingsModalComponent({
      onConnectionTested: (result) => this.updatePingStatus(result),
      onThemeChanged: (theme) => this.initTheme(),
      onSettingsSaved: (data) => this.handleSettingsSaved(data)
    });

    // 3. Task List
    const taskContainer = document.getElementById('taskListContainer');
    this.taskList = new TaskListComponent(taskContainer, {
      currentDate: this.currentDate,
      onEditTask: (task) => {
        this.taskModal.open(this.currentDate, task, (plan) => this.renderDailyPlan(plan));
      }
    });
    this.taskList.addEventListener('task:summaryChanged', (e) => {
      if (e.detail && e.detail.plan) {
        this.renderDailyPlan(e.detail.plan);
      }
    });

    // 4. Schedule View
    const scheduleContainer = document.getElementById('scheduleContainer');
    this.scheduleView = new ScheduleViewComponent(scheduleContainer, {
      currentDate: this.currentDate,
      onEditSlot: (slot, item) => {
        this.slotModal.open(this.currentDate, slot, item);
      }
    });

    // 5. Auth Screen Gate
    this.authScreen = new AuthScreenComponent();
  }

  // ------------------------------------------------------------------------
  // Data Loading & Caching Orchestration
  // ------------------------------------------------------------------------

  handleSettingsSaved(data) {
    console.log('⚙️ [Chronos] Settings updated. Invalidating stale cache and fetching all endpoints...');
    syncQueue.clearAllCachedPlans();
    this.refreshAllData({ forceServer: true });
    this.checkInitialConnection();
  }

  async loadDate(date) {
    this.currentDate = date;
    this.datePicker.setDate(date, false);
    this.taskList.setDate(date);
    this.scheduleView.setDate(date);

    // 1. Immediate local render (0ms response)
    let plan = syncQueue.getCachedPlan(date);
    if (!plan) {
      plan = syncQueue.createDefaultPlan(date);
      syncQueue.setCachedPlan(date, plan);
    }
    this.renderDailyPlan(plan);

    // 2. Fetch fresh data from backend
    if (api.hasToken()) {
      this.refreshAllData({ forceServer: true, targetDate: date });
    }
  }

  /**
   * Diagnostic API Fetcher & Synchronizer
   * Queries /api/daily for target date, updates cache, and renders DOM
   */
  async refreshAllData({ forceServer = true, targetDate = this.currentDate } = {}) {
    const hasToken = api.hasToken();
    const token = api.getToken();
    const baseUrl = api.getBaseUrl();

    console.group(`🚀 [Chronos Planner] API Sync & Diagnostic (${new Date().toLocaleTimeString()})`);
    console.log('🔑 API Token Status:', hasToken ? `Present (${token.substring(0, 8)}...)` : '❌ Missing / Unlinked');
    console.log('🌐 Target API Base URL:', baseUrl || 'https://chronos-planner-app.onrender.com');
    console.log('📅 Target Date:', targetDate);

    if (!hasToken) {
      console.warn('⚠️ No Chronos API token linked yet. Open Settings (⚙️) to link your API token.');
      this.updatePingStatus({ valid: false, unlinked: true });
      console.groupEnd();
      return;
    }

    try {
      console.log(`📡 Calling GET /api/daily?date=${encodeURIComponent(targetDate)}...`);
      const startTime = performance.now();
      const rawServerResponse = await api.getDailyPlan(targetDate);
      const latencyMs = Math.round(performance.now() - startTime);
      console.log(`📥 [Response: /api/daily?date=${targetDate} Raw Body]:`, rawServerResponse);

      const normalizedPlan = Utils.normalizeDailyPlan(rawServerResponse, targetDate);
      console.log(`✨ [Chronos] Normalized Plan Schema:`, normalizedPlan);
      console.log(`📝 [Chronos] Tasks (${normalizedPlan.tasks.length} items):`, normalizedPlan.tasks);
      console.log(`⏰ [Chronos] Schedule (${Object.keys(normalizedPlan.schedule).length} slots):`, normalizedPlan.schedule);
      console.log(`📝 [Chronos] Daily Notes:`, normalizedPlan.notes || '(Empty)');

      syncQueue.setCachedPlan(targetDate, normalizedPlan);

      if (this.currentDate === targetDate) {
        this.renderDailyPlan(normalizedPlan);
      }

      this.updatePingStatus({ valid: true, latencyMs, info: rawServerResponse });

      Utils.toast(
        `Synced: ${normalizedPlan.tasks.length} task${normalizedPlan.tasks.length === 1 ? '' : 's'}, ${Object.keys(normalizedPlan.schedule).length} schedule slot${Object.keys(normalizedPlan.schedule).length === 1 ? '' : 's'}`,
        'success'
      );
    } catch (err) {
      console.error(`❌ [Endpoint: /api/daily?date=${targetDate} Failed]:`, err);
      this.updatePingStatus({ valid: false, error: err.message });
      if (err.status === 401 || (err.message && err.message.toLowerCase().includes('token'))) {
        Utils.toast(`Invalid API Token: Please log in to Chronos Planner on Render and copy your active API token in Settings (⚙️)`, 'error', 6000);
      } else {
        Utils.toast(`Sync failed: ${err.message}`, 'error', 4500);
      }
    }

    console.groupEnd();
  }

  renderDailyPlan(plan) {
    this.currentPlan = plan;
    this.renderMetrics(plan.summary || {});
    this.taskList.render(plan.tasks || [], plan.date || this.currentDate);
    this.scheduleView.render(plan.schedule || {}, plan.date || this.currentDate);
    this.renderNotes(plan.notes || '');
    this.updateFilterCounts(plan.tasks || []);
  }

  renderMetrics(summary = {}) {
    const total = summary.total_tasks || 0;
    const completed = summary.completed_tasks || 0;
    const pending = summary.pending_tasks || 0;
    const pct = summary.completion_pct || 0;

    const totalEl = document.getElementById('metricTotalTasks');
    const completedEl = document.getElementById('metricCompletedTasks');
    const pendingEl = document.getElementById('metricPendingTasks');
    const pctEl = document.getElementById('metricCompletionPct');
    const progressRing = document.getElementById('progressRingVal');

    if (totalEl) totalEl.textContent = total;
    if (completedEl) completedEl.textContent = completed;
    if (pendingEl) pendingEl.textContent = pending;
    if (pctEl) pctEl.textContent = `${pct}%`;

    if (progressRing) {
      const circumference = 2 * Math.PI * 18; // r=18
      progressRing.style.strokeDasharray = `${circumference}`;
      const offset = circumference - (pct / 100) * circumference;
      progressRing.style.strokeDashoffset = `${offset}`;
    }
  }

  renderNotes(notesText) {
    const textarea = document.getElementById('dailyNotesInput');
    if (textarea && textarea !== document.activeElement) {
      textarea.value = notesText || '';
    }
  }

  updateFilterCounts(tasks = []) {
    const allCount = tasks.length;
    const activeCount = tasks.filter(t => !t.completed && t.status !== 'Completed').length;
    const completedCount = tasks.filter(t => t.completed || t.status === 'Completed').length;
    const highCount = tasks.filter(t => t.priority === 'High').length;

    const countAll = document.getElementById('filterCountAll');
    const countActive = document.getElementById('filterCountActive');
    const countCompleted = document.getElementById('filterCountCompleted');
    const countHigh = document.getElementById('filterCountHigh');

    if (countAll) countAll.textContent = allCount;
    if (countActive) countActive.textContent = activeCount;
    if (countCompleted) countCompleted.textContent = completedCount;
    if (countHigh) countHigh.textContent = highCount;
  }

  // ------------------------------------------------------------------------
  // Event Bindings
  // ------------------------------------------------------------------------

  bindHeaderEvents() {
    const pingPill = document.getElementById('headerPingPill');
    if (pingPill) {
      pingPill.addEventListener('click', () => {
        this.settingsModal.open();
      });
    }

    const btnSettings = document.getElementById('btnOpenSettings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.settingsModal.open();
      });
    }

    const btnThemeToggle = document.getElementById('btnToggleThemePalette');
    if (btnThemeToggle) {
      btnThemeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'orange';
        const next = current === 'orange' ? 'emerald' : 'orange';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('chronos_theme', next);
        Utils.toast(`Switched theme to ${next === 'orange' ? 'Solar Orange 🔥' : 'Cyber Emerald 🌿'}`, 'info');
      });
    }

    const btnNewTaskHeader = document.getElementById('btnHeaderNewTask');
    if (btnNewTaskHeader) {
      btnNewTaskHeader.addEventListener('click', () => {
        this.taskModal.open(this.currentDate, null, (plan) => this.renderDailyPlan(plan));
      });
    }

    // Google Auth Button in Header
    const userBadge = document.getElementById('headerUserBadge');
    if (userBadge) {
      userBadge.addEventListener('click', () => {
        if (!auth.isLoggedIn()) {
          this.authScreen.show();
        } else {
          this.settingsModal.open();
        }
      });
    }

    auth.addEventListener('auth:stateChanged', (e) => {
      this.updateHeaderAuthUI(e.detail.user);
      if (e.detail.isLoggedIn) {
        this.authScreen.hide();
      } else {
        this.authScreen.show();
      }
    });
  }

  updateHeaderAuthUI(user) {
    const avatar = document.getElementById('headerUserAvatar');
    const name = document.getElementById('headerUserName');
    if (!avatar || !name) return;

    if (user) {
      avatar.src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName)}`;
      name.textContent = user.displayName ? user.displayName.split(' ')[0] : 'User';
    } else {
      avatar.src = 'https://api.dicebear.com/7.x/initials/svg?seed=Guest';
      name.textContent = 'Sign In';
    }
  }

  bindQuickAddEvents() {
    const quickInput = document.getElementById('quickTaskInput');
    const quickPriority = document.getElementById('quickPrioritySelect');
    const quickBtn = document.getElementById('btnQuickAddTask');

    const handleAdd = () => {
      const text = quickInput.value.trim();
      if (!text) return;

      const priority = quickPriority.value || 'Medium';
      const result = syncQueue.optimisticAddTask(this.currentDate, {
        text,
        priority,
        status: 'To Do',
        tags: []
      });

      quickInput.value = '';
      if (result) {
        this.renderDailyPlan(result.plan);
      }
      Utils.toast('Task added', 'success');
    };

    if (quickBtn) {
      quickBtn.addEventListener('click', handleAdd);
    }

    if (quickInput) {
      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      });
    }

    // Filter Tabs
    const tabs = document.querySelectorAll('.filter-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const filter = tab.getAttribute('data-filter');
        this.taskList.setFilter(filter);
      });
    });
  }

  bindNotesEvents() {
    const textarea = document.getElementById('dailyNotesInput');
    const statusEl = document.getElementById('notesSaveStatus');
    if (!textarea) return;

    const debouncedSave = Utils.debounce((notes) => {
      const plan = syncQueue.optimisticUpdateNotes(this.currentDate, notes);
      if (statusEl) {
        statusEl.textContent = 'Saved in background ✓';
        setTimeout(() => {
          if (statusEl.textContent.includes('Saved')) statusEl.textContent = 'Auto-saves on typing';
        }, 2500);
      }
    }, 600);

    textarea.addEventListener('input', (e) => {
      if (statusEl) statusEl.textContent = 'Saving...';
      debouncedSave(e.target.value);
    });
  }

  // ------------------------------------------------------------------------
  // Non-Blocking Background Sync Status Floating Pill & Drawer
  // ------------------------------------------------------------------------

  bindSyncQueueEvents() {
    const pill = document.getElementById('floatingSyncPill');
    const pillText = document.getElementById('floatingSyncText');
    const drawerOverlay = document.getElementById('syncDrawerOverlay');
    const drawerBody = document.getElementById('syncDrawerBody');
    const btnCloseDrawer = document.getElementById('btnCloseSyncDrawer');
    const btnRetryFailed = document.getElementById('btnRetrySyncQueue');
    const btnClearQueue = document.getElementById('btnClearSyncQueue');

    syncQueue.addEventListener('queue:change', (e) => {
      const { pendingCount, items, isProcessing, activeDuration } = e.detail;

      if (pendingCount > 0) {
        pill.classList.remove('hidden');
        pill.classList.add('syncing');
        
        let label = `🔄 Syncing ${pendingCount} change${pendingCount > 1 ? 's' : ''}`;
        if (activeDuration > 5) {
          label += ` (${activeDuration}s) • Waking up Render...`;
        }
        pillText.textContent = label;
      } else {
        pill.classList.remove('syncing');
        pillText.textContent = `✓ All changes synced`;
        setTimeout(() => {
          if (syncQueue.queue.length === 0) {
            pill.classList.add('hidden');
          }
        }, 3000);
      }

      // Update drawer body if open
      if (drawerBody && drawerOverlay.classList.contains('active')) {
        this.renderSyncDrawer(items, drawerBody);
      }
    });

    if (pill) {
      pill.addEventListener('click', () => {
        drawerOverlay.classList.add('active');
        const drawer = document.getElementById('syncDrawer');
        if (drawer) drawer.classList.add('active');
        this.renderSyncDrawer(syncQueue.queue, drawerBody);
      });
    }

    const closeDrawer = () => {
      drawerOverlay.classList.remove('active');
      const drawer = document.getElementById('syncDrawer');
      if (drawer) drawer.classList.remove('active');
    };

    if (btnCloseDrawer) btnCloseDrawer.addEventListener('click', closeDrawer);
    if (drawerOverlay) {
      drawerOverlay.addEventListener('click', (e) => {
        if (e.target === drawerOverlay) closeDrawer();
      });
    }

    if (btnRetryFailed) {
      btnRetryFailed.addEventListener('click', () => {
        syncQueue.retryFailed();
        this.renderSyncDrawer(syncQueue.queue, drawerBody);
      });
    }

    if (btnClearQueue) {
      btnClearQueue.addEventListener('click', () => {
        syncQueue.clearQueue();
        this.renderSyncDrawer(syncQueue.queue, drawerBody);
        closeDrawer();
      });
    }
  }

  renderSyncDrawer(items, container) {
    if (!container) return;

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <p style="margin-top: 0.5rem; font-weight: 600;">Queue is empty</p>
          <p style="font-size: 0.75rem;">All actions have been synced to the Render API.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const isProcessing = item.status === 'processing';
      const isFailed = item.status === 'failed';
      const isPending = item.status === 'pending';

      return `
        <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 0.6rem; padding: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; font-size: 0.82rem;">${item.type} (${item.date})</div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              ${item.error ? `<span style="color: #ef4444;">${Utils.escapeHtml(item.error)}</span>` : `Status: ${item.status}`}
            </div>
          </div>
          <div>
            ${isProcessing ? '<span class="sync-spinner"></span>' : ''}
            ${isFailed ? '<span style="color: #ef4444; font-weight: 700; font-size: 0.75rem;">Failed</span>' : ''}
            ${isPending ? '<span style="color: #f59e0b; font-size: 0.75rem;">Queued</span>' : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // ------------------------------------------------------------------------
  // Ping & Connection Verification
  // ------------------------------------------------------------------------

  async checkInitialConnection() {
    if (!api.hasToken()) {
      this.updatePingStatus({ valid: false, unlinked: true });
      return;
    }

    this.updatePingStatus({ valid: false, connecting: true });
    const result = await api.pingConnection();
    this.updatePingStatus(result);
  }

  updatePingStatus(result) {
    const pill = document.getElementById('headerPingPill');
    const text = document.getElementById('headerPingText');
    if (!pill || !text) return;

    pill.className = 'ping-pill';

    if (result.unlinked) {
      pill.classList.add('unlinked');
      text.textContent = 'Link API Token';
      return;
    }

    if (result.connecting) {
      pill.classList.add('connecting');
      text.textContent = 'Connecting...';
      return;
    }

    if (result.valid) {
      pill.classList.add('connected');
      text.textContent = `Connected (${result.latencyMs}ms)`;
    } else {
      pill.classList.add('offline');
      text.textContent = 'Auth Error / Offline';
    }
  }

  bindGlobalEvents() {
    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Avoid hotkeys when typing in input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        this.taskModal.open(this.currentDate, null, (plan) => this.renderDailyPlan(plan));
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.loadDate(Utils.formatDate());
      } else if (e.key === '[') {
        e.preventDefault();
        this.loadDate(Utils.offsetDays(this.currentDate, -1));
      } else if (e.key === ']') {
        e.preventDefault();
        this.loadDate(Utils.offsetDays(this.currentDate, 1));
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        this.settingsModal.open();
      }
    });
  }
}

// Bootstrap on DOM Ready or immediately if document is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chronosApp = new ChronosApp();
  });
} else {
  window.chronosApp = new ChronosApp();
}
