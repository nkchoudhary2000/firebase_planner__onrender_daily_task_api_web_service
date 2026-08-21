/**
 * Chronos Planner - Settings & Link Planner Modal Component
 */

import { Utils } from '../utils.js';
import { api } from '../api.js';
import { auth } from '../auth.js';

export class SettingsModalComponent extends EventTarget {
  constructor(options = {}) {
    super();
    this.modalEl = null;
    this.onConnectionTested = options.onConnectionTested || (() => {});
    this.onThemeChanged = options.onThemeChanged || (() => {});
    this.onSettingsSaved = options.onSettingsSaved || (() => {});

    this.createModalDOM();
  }

  createModalDOM() {
    let el = document.getElementById('settingsModalOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'settingsModalOverlay';
      el.className = 'modal-overlay';
      document.body.appendChild(el);
    }
    this.modalEl = el;

    this.modalEl.innerHTML = `
      <div class="modal-content" style="max-width: 600px;">
        <div class="modal-header">
          <h3 class="modal-title" style="display: flex; align-items: center; gap: 0.5rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            Planner Settings & API Connection
          </h3>
          <button class="btn-icon" id="btnSettingsModalClose" title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- 1. Google Authentication Section -->
          <div style="background: var(--bg-surface-elevated); padding: 1rem; border-radius: 0.75rem; border: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 0.75rem;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 0.65rem;">
                <img id="settingsUserAvatar" src="https://api.dicebear.com/7.x/initials/svg?seed=Guest" style="width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border-medium);" alt="User Avatar" />
                <div>
                  <div id="settingsUserName" style="font-weight: 700; font-size: 0.9rem;">Not Logged In</div>
                  <div id="settingsUserEmail" style="font-size: 0.75rem; color: var(--text-muted);">Sign in with Google to sync preferences</div>
                </div>
              </div>
              <button id="btnGoogleAuthAction" class="btn-secondary" style="font-size: 0.8rem;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                Sign In with Google
              </button>
            </div>
          </div>

          <!-- 2. Link with Planner App / API Token -->
          <div class="form-group">
            <label class="form-label" for="settingsApiToken">Chronos API Token (cp_...)</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="password" id="settingsApiToken" class="form-input" placeholder="e.g. cp_9a8b7c6d5e4f3a2b1c..." style="flex: 1;" />
              <button type="button" id="btnToggleTokenVisibility" class="btn-secondary" title="Show / Hide Token">
                👁️
              </button>
            </div>
            <div id="settingsFirestoreBadge" style="margin-top: 0.45rem; display: flex; align-items: center; justify-content: space-between; font-size: 0.72rem;">
              <span id="settingsFirestoreText" style="color: #10b981; display: flex; align-items: center; gap: 0.35rem;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
                <span>Stored in Firestore (<code>daily_task_planner_users</code>)</span>
              </span>
              <a href="https://chronos-planner-app.onrender.com/auth/login" target="_blank" rel="noopener noreferrer" style="color: var(--color-primary); font-weight: 600; text-decoration: none;">
                🔑 Get Token ↗
              </a>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="settingsBaseUrl">API Base URL</label>
            <input type="text" id="settingsBaseUrl" class="form-input" placeholder="https://chronos-planner-app.onrender.com" />
            <span style="font-size: 0.72rem; color: var(--text-muted);">
              Default: <code>https://chronos-planner-app.onrender.com</code>
            </span>
          </div>

          <div style="background: var(--bg-input); padding: 0.85rem; border-radius: 0.6rem; border: 1px solid var(--border-subtle); display: flex; align-items: center; justify-content: space-between;">
            <div id="settingsPingStatusText" style="font-size: 0.8rem; display: flex; align-items: center; gap: 0.5rem;">
              <span class="ping-dot" style="background: #9ca3af;"></span>
              <span>Status: Untested</span>
            </div>
            <button type="button" id="btnTestPingConnection" class="btn-secondary" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
              🔄 Ping Server & Test Token
            </button>
          </div>

          <div class="form-group">
            <label class="form-label">Theme Palette</label>
            <div style="display: flex; gap: 0.75rem;">
              <button type="button" id="btnThemeOrange" class="btn-secondary" style="flex: 1; border-color: rgba(255, 107, 0, 0.4); color: #ff8533;">
                🔥 Solar Orange
              </button>
              <button type="button" id="btnThemeEmerald" class="btn-secondary" style="flex: 1; border-color: rgba(16, 185, 129, 0.4); color: #34d399;">
                🌿 Cyber Emerald
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="settingsFirebaseConfigJson">Firebase Config JSON (niraj-portfolio-a7011)</label>
            <textarea id="settingsFirebaseConfigJson" class="form-input" rows="5" style="font-family: monospace; font-size: 0.75rem; resize: vertical;"></textarea>
            <span style="font-size: 0.72rem; color: var(--text-muted);">
              Multi-site hosting target: <code>daily-task-planner-api-niomsolutionx</code>
            </span>
          </div>
        </div>

        <div class="modal-footer">
          <button type="button" class="btn-secondary" id="btnSettingsCancel">Cancel</button>
          <button type="button" class="btn-primary" id="btnSettingsSave">Save Settings</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const closeBtn = this.modalEl.querySelector('#btnSettingsModalClose');
    const cancelBtn = this.modalEl.querySelector('#btnSettingsCancel');
    const saveBtn = this.modalEl.querySelector('#btnSettingsSave');
    const toggleTokenBtn = this.modalEl.querySelector('#btnToggleTokenVisibility');
    const testPingBtn = this.modalEl.querySelector('#btnTestPingConnection');
    const googleAuthBtn = this.modalEl.querySelector('#btnGoogleAuthAction');
    const themeOrangeBtn = this.modalEl.querySelector('#btnThemeOrange');
    const themeEmeraldBtn = this.modalEl.querySelector('#btnThemeEmerald');

    const hide = () => this.close();
    closeBtn.addEventListener('click', hide);
    cancelBtn.addEventListener('click', hide);
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) hide();
    });

    toggleTokenBtn.addEventListener('click', () => {
      const input = this.modalEl.querySelector('#settingsApiToken');
      input.type = input.type === 'password' ? 'text' : 'password';
    });

    googleAuthBtn.addEventListener('click', async () => {
      if (auth.isLoggedIn()) {
        await auth.signOut();
      } else {
        await auth.signInWithGoogle();
      }
      this.updateUserUI();
    });

    testPingBtn.addEventListener('click', async () => {
      await this.runPingTest();
    });

    themeOrangeBtn.addEventListener('click', () => {
      document.documentElement.setAttribute('data-theme', 'orange');
      localStorage.setItem('chronos_theme', 'orange');
      this.onThemeChanged('orange');
      Utils.toast('Theme set to Solar Orange', 'info');
    });

    themeEmeraldBtn.addEventListener('click', () => {
      document.documentElement.setAttribute('data-theme', 'emerald');
      localStorage.setItem('chronos_theme', 'emerald');
      this.onThemeChanged('emerald');
      Utils.toast('Theme set to Cyber Emerald', 'info');
    });

    saveBtn.addEventListener('click', async () => {
      const tokenInput = this.modalEl.querySelector('#settingsApiToken');
      const baseUrlInput = this.modalEl.querySelector('#settingsBaseUrl');
      const fbConfigInput = this.modalEl.querySelector('#settingsFirebaseConfigJson');

      const tokenVal = tokenInput.value.trim();
      const baseUrlVal = baseUrlInput.value.trim();

      // Save directly to Firestore collection
      await auth.saveTokenToFirestore(tokenVal, baseUrlVal);

      try {
        if (fbConfigInput && fbConfigInput.value.trim()) {
          const parsed = JSON.parse(fbConfigInput.value.trim());
          auth.setFirebaseConfig(parsed);
        }
      } catch (e) {
        Utils.toast('Invalid Firebase JSON format', 'error');
        return;
      }

      this.close();

      if (this.onSettingsSaved) {
        this.onSettingsSaved({ token: tokenVal, baseUrl: baseUrlVal });
      }
      this.dispatchEvent(new CustomEvent('settings:saved', {
        detail: { token: tokenVal, baseUrl: baseUrlVal }
      }));
    });

    auth.addEventListener('auth:stateChanged', () => {
      this.updateUserUI();
    });

    auth.addEventListener('token:syncedFromFirestore', (e) => {
      const tokenInput = this.modalEl.querySelector('#settingsApiToken');
      const baseUrlInput = this.modalEl.querySelector('#settingsBaseUrl');
      if (tokenInput && e.detail.token) tokenInput.value = e.detail.token;
      if (baseUrlInput && e.detail.baseUrl) baseUrlInput.value = e.detail.baseUrl;
      this.updateUserUI();
    });
  }

  updateUserUI() {
    const user = auth.getUser();
    const avatar = this.modalEl.querySelector('#settingsUserAvatar');
    const nameEl = this.modalEl.querySelector('#settingsUserName');
    const emailEl = this.modalEl.querySelector('#settingsUserEmail');
    const authBtn = this.modalEl.querySelector('#btnGoogleAuthAction');
    const firestoreText = this.modalEl.querySelector('#settingsFirestoreText');

    if (user) {
      avatar.src = user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName)}`;
      nameEl.textContent = user.displayName || 'Google User';
      emailEl.textContent = user.email || 'Signed in with Google';
      authBtn.innerHTML = `Sign Out`;

      if (firestoreText) {
        if (user.uid && !user.uid.startsWith('guest_') && !user.uid.startsWith('local_')) {
          firestoreText.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>
            <span style="color: #10b981;">Firestore Cloud Collection: <code>daily_task_planner_users/${user.uid.substring(0, 6)}...</code></span>
          `;
        } else {
          firestoreText.innerHTML = `
            <span style="color: var(--text-muted);">Local mode: Sign in with Google to sync token to Firestore collection</span>
          `;
        }
      }
    } else {
      avatar.src = 'https://api.dicebear.com/7.x/initials/svg?seed=Guest';
      nameEl.textContent = 'Not Logged In';
      emailEl.textContent = 'Sign in with Google to sync preferences';
      authBtn.innerHTML = `Sign In with Google`;

      if (firestoreText) {
        firestoreText.innerHTML = `
          <span style="color: var(--text-muted);">Sign in with Google to sync token to Firestore collection</span>
        `;
      }
    }
  }

  async runPingTest() {
    const statusText = this.modalEl.querySelector('#settingsPingStatusText');
    const testPingBtn = this.modalEl.querySelector('#btnTestPingConnection');
    const tokenInput = this.modalEl.querySelector('#settingsApiToken');
    const baseUrlInput = this.modalEl.querySelector('#settingsBaseUrl');

    const inputToken = tokenInput ? tokenInput.value.trim() : null;
    const inputBaseUrl = baseUrlInput ? baseUrlInput.value.trim() : null;

    statusText.innerHTML = `
      <span class="ping-dot" style="background: #f59e0b; animation: pulse-ring 1.2s infinite;"></span>
      <span>Pinging server (checking cold boot)...</span>
    `;
    testPingBtn.disabled = true;

    const result = await api.pingConnection(inputToken || null, inputBaseUrl || null);
    testPingBtn.disabled = false;

    if (result.valid) {
      statusText.innerHTML = `
        <span class="ping-dot" style="background: #10b981;"></span>
        <span style="color: #10b981; font-weight: 600;">Connected (${result.latencyMs}ms) • Token Valid ✓</span>
      `;
      Utils.toast(`Connection successful (${result.latencyMs}ms)`, 'success');
    } else {
      statusText.innerHTML = `
        <span class="ping-dot" style="background: #ef4444;"></span>
        <span style="color: #ef4444; font-weight: 600;">Failed: ${Utils.escapeHtml(result.error)}</span>
      `;
      Utils.toast(`Ping failed: ${result.error}`, 'error');
    }

    if (this.onConnectionTested) {
      this.onConnectionTested(result);
    }
  }

  open() {
    const tokenInput = this.modalEl.querySelector('#settingsApiToken');
    const baseUrlInput = this.modalEl.querySelector('#settingsBaseUrl');
    const fbConfigInput = this.modalEl.querySelector('#settingsFirebaseConfigJson');

    tokenInput.value = api.getToken();
    baseUrlInput.value = localStorage.getItem(api.storageKeyBaseUrl) || '';
    fbConfigInput.value = JSON.stringify(auth.getFirebaseConfig(), null, 2);

    this.updateUserUI();
    this.modalEl.classList.add('active');
  }

  close() {
    this.modalEl.classList.remove('active');
  }
}
