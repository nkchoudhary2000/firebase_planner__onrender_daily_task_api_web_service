/**
 * Chronos Planner - Dedicated Auth & Onboarding Gate Screen
 * Prompts user to Sign in with Google, Login, Sign up, or enter as Guest.
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { Utils } from '../utils.js';

export class AuthScreenComponent {
  constructor(options = {}) {
    this.container = null;
    this.activeTab = 'signin'; // 'signin' | 'signup'
    this.onAuthenticated = options.onAuthenticated || (() => {});
    this.listeners = {};

    this.createDOM();
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
    if (!this.listeners[event.type]) return true;
    this.listeners[event.type].forEach(cb => {
      try { cb(event); } catch (e) { console.error(e); }
    });
    return true;
  }

  createDOM() {
    let el = document.getElementById('authScreenOverlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'authScreenOverlay';
      el.className = 'auth-screen-overlay';
      document.body.appendChild(el);
    }
    this.container = el;

    this.render();
  }

  render() {
    this.container.innerHTML = `
      <div class="auth-card">
        
        <!-- Brand Header -->
        <div class="auth-header">
          <img src="assets/icon.svg" alt="Chronos Logo" class="auth-logo" />
          <h2 class="auth-title">Chronos Daily Planner</h2>
          <p class="auth-subtitle">Plan your day, sync with Render API, and track your habits in real time.</p>
        </div>

        <!-- 1. Primary Google Sign-In Button -->
        <button id="btnAuthGoogle" class="btn-google-sign-in" type="button">
          <svg class="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span>Continue with Google</span>
        </button>

        <div class="auth-divider">
          <span>OR</span>
        </div>

        <!-- 2. Tabs for Sign In vs Sign Up -->
        <div class="auth-tab-row">
          <button type="button" class="auth-tab ${this.activeTab === 'signin' ? 'active' : ''}" id="tabAuthSignIn">
            Sign In
          </button>
          <button type="button" class="auth-tab ${this.activeTab === 'signup' ? 'active' : ''}" id="tabAuthSignUp">
            Create Account
          </button>
        </div>

        <!-- 3. Form Content -->
        <form id="authLocalForm" class="auth-form">
          ${this.activeTab === 'signup' ? `
            <div class="form-group">
              <label class="form-label" for="authInputName">Full Name</label>
              <input type="text" id="authInputName" class="form-input" placeholder="e.g. Niraj Kumar" required />
            </div>
          ` : ''}

          <div class="form-group">
            <label class="form-label" for="authInputEmail">Email Address</label>
            <input type="email" id="authInputEmail" class="form-input" placeholder="name@domain.com" required />
          </div>

          <div class="form-group">
            <label class="form-label" for="authInputPassword">Password</label>
            <input type="password" id="authInputPassword" class="form-input" placeholder="••••••••" required />
          </div>

          ${this.activeTab === 'signup' ? `
            <div class="form-group">
              <label class="form-label" for="authInputApiToken">Chronos API Token (Optional)</label>
              <input type="password" id="authInputApiToken" class="form-input" placeholder="cp_9a8b7c6d5e4f..." />
              <span style="font-size: 0.7rem; color: var(--text-muted);">You can also configure this later in settings.</span>
            </div>
          ` : ''}

          <button type="submit" class="btn-primary" style="width: 100%; justify-content: center; padding: 0.75rem; font-size: 0.95rem; margin-top: 0.5rem;">
            ${this.activeTab === 'signin' ? 'Sign In to Planner' : 'Create My Account'}
          </button>
        </form>

        <!-- 4. Guest / Demo Mode Button -->
        <div style="text-align: center; margin-top: 1rem; border-top: 1px solid var(--border-subtle); padding-top: 1rem;">
          <button type="button" id="btnAuthGuest" class="btn-secondary" style="width: 100%; justify-content: center; font-size: 0.82rem;">
            ⚡ Quick Demo / Explore as Guest
          </button>
        </div>

      </div>
    `;

    this.attachFormListeners();
  }

  bindEvents() {
    auth.addEventListener('auth:stateChanged', (e) => {
      const { isLoggedIn } = e.detail;
      if (isLoggedIn) {
        this.hide();
      } else {
        this.show();
      }
    });
  }

  attachFormListeners() {
    const btnGoogle = this.container.querySelector('#btnAuthGoogle');
    const tabSignIn = this.container.querySelector('#tabAuthSignIn');
    const tabSignUp = this.container.querySelector('#tabAuthSignUp');
    const btnGuest = this.container.querySelector('#btnAuthGuest');
    const form = this.container.querySelector('#authLocalForm');

    if (btnGoogle) {
      btnGoogle.addEventListener('click', async () => {
        try {
          btnGoogle.disabled = true;
          await auth.signInWithGoogle();
        } catch (e) {
          btnGoogle.disabled = false;
        }
      });
    }

    if (tabSignIn) {
      tabSignIn.addEventListener('click', () => {
        this.activeTab = 'signin';
        this.render();
      });
    }

    if (tabSignUp) {
      tabSignUp.addEventListener('click', () => {
        this.activeTab = 'signup';
        this.render();
      });
    }

    if (btnGuest) {
      btnGuest.addEventListener('click', () => {
        auth.signInAsGuest();
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = this.container.querySelector('#authInputEmail').value.trim();
        const password = this.container.querySelector('#authInputPassword').value;

        if (this.activeTab === 'signin') {
          try {
            await auth.signInWithEmail(email, password);
          } catch (err) {
            console.error('Sign-in error:', err);
          }
        } else {
          const nameInput = this.container.querySelector('#authInputName');
          const tokenInput = this.container.querySelector('#authInputApiToken');
          const name = nameInput ? nameInput.value.trim() : '';
          const token = tokenInput ? tokenInput.value.trim() : '';
          try {
            await auth.signUpWithEmail(name, email, password, token);
          } catch (err) {
            console.error('Sign-up error:', err);
          }
        }
      });
    }
  }

  show() {
    if (this.container) {
      this.container.classList.add('visible');
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.remove('visible');
    }
  }
}
