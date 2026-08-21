/**
 * Chronos Planner - Firebase Authentication & Profile Manager
 * Supports: Google Auth, Email/Password Sign-in, Sign-up, and Guest Demo Mode.
 */

import { Utils } from './utils.js';
import { ENV } from './env.js';
import { api } from './api.js';

export class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authInstance = null;
    this.db = null;
    this.storageKeyFirebaseConfig = 'chronos_firebase_config';
    this.storageKeyLocalUser = 'chronos_local_user';
    this.listeners = {};
    
    this.initFirebase();
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

  getFirebaseConfig() {
    try {
      const stored = localStorage.getItem(this.storageKeyFirebaseConfig);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.error('Invalid firebase config in storage:', e);
    }
    return ENV.FIREBASE_CONFIG;
  }

  setFirebaseConfig(configObj) {
    if (configObj) {
      localStorage.setItem(this.storageKeyFirebaseConfig, JSON.stringify(configObj));
      this.initFirebase();
    } else {
      localStorage.removeItem(this.storageKeyFirebaseConfig);
    }
  }

  initFirebase() {
    if (typeof window !== 'undefined' && typeof window.firebase !== 'undefined' && window.firebase.initializeApp) {
      try {
        const config = this.getFirebaseConfig();
        if (!window.firebase.apps || !window.firebase.apps.length) {
          window.firebase.initializeApp(config);
        }
        this.authInstance = window.firebase.auth();

        // Initialize Firestore
        if (window.firebase.firestore) {
          this.db = window.firebase.firestore();
        }

        // Listen to Firebase Auth state
        this.authInstance.onAuthStateChanged(async (user) => {
          if (user) {
            this.currentUser = {
              uid: user.uid,
              displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Planner User'),
              email: user.email || '',
              photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.email || 'User')}`,
              isAnonymous: user.isAnonymous,
              provider: user.providerData && user.providerData[0] ? user.providerData[0].providerId : 'firebase'
            };
            this.persistLocalUser(this.currentUser);
            // Bidirectional token sync with Firestore collection
            await this.syncTokenFromFirestore(user.uid);
          } else {
            // Check if local account or demo is active
            this.currentUser = this.loadLocalUser();
          }
          this.notifyAuthState();
        });
      } catch (e) {
        console.warn('Firebase initialization notice:', e);
        this.currentUser = this.loadLocalUser();
        this.notifyAuthState();
      }
    } else {
      this.currentUser = this.loadLocalUser();
      this.notifyAuthState();
    }
  }

  /**
   * Sync and retrieve Chronos API token from Firestore collection
   * @param {string} uid
   * @returns {Promise<string|null>}
   */
  async syncTokenFromFirestore(uid) {
    if (!uid || !this.db) return null;
    const collectionName = ENV.FIRESTORE_COLLECTION || 'daily_task_planner_users';
    try {
      const docRef = this.db.collection(collectionName).doc(uid);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        const data = docSnap.data();
        let tokenUpdated = false;
        if (data.chronos_api_token) {
          api.setToken(data.chronos_api_token);
          tokenUpdated = true;
          console.log(`☁️ [Firestore] Loaded API token from collection "${collectionName}/${uid}"`);
        }
        if (data.chronos_base_url) {
          api.setBaseUrl(data.chronos_base_url);
        }
        if (tokenUpdated) {
          this.dispatchEvent(new CustomEvent('token:syncedFromFirestore', {
            detail: { token: data.chronos_api_token, baseUrl: data.chronos_base_url, source: 'firestore' }
          }));
          return data.chronos_api_token;
        }
      } else {
        // If Firestore document doesn't exist yet but user has a token in local storage, automatically save to Firestore
        const existingToken = api.getToken();
        if (existingToken) {
          console.log(`☁️ [Firestore] Migrating local token into Firestore collection "${collectionName}/${uid}"...`);
          await this.saveTokenToFirestore(existingToken);
        }
      }
    } catch (err) {
      console.warn(`⚠️ [Firestore] Could not fetch token from collection "${collectionName}":`, err.message);
    }
    return null;
  }

  /**
   * Save / update Chronos API token and configuration in Firestore collection
   * @param {string} token 
   * @param {string|null} [baseUrl=null]
   * @returns {Promise<boolean>}
   */
  async saveTokenToFirestore(token, baseUrl = null) {
    // 1. Update in-memory & local cache
    api.setToken(token);
    if (baseUrl) api.setBaseUrl(baseUrl);

    const collectionName = ENV.FIRESTORE_COLLECTION || 'daily_task_planner_users';
    const user = this.currentUser;

    // 2. Persist to Firestore if user is logged into Firebase
    if (user && user.uid && !user.uid.startsWith('guest_') && !user.uid.startsWith('local_') && this.db) {
      try {
        const payload = {
          chronos_api_token: token ? token.trim() : '',
          chronos_base_url: baseUrl ? baseUrl.trim() : api.getBaseUrl(),
          email: user.email || '',
          displayName: user.displayName || '',
          updated_at: (typeof window !== 'undefined' && window.firebase && window.firebase.firestore)
            ? window.firebase.firestore.FieldValue.serverTimestamp()
            : new Date()
        };

        await this.db.collection(collectionName).doc(user.uid).set(payload, { merge: true });
        console.log(`☁️ [Firestore] Token saved to collection "${collectionName}/${user.uid}"`);
        Utils.toast(`Token saved in Firestore collection (${collectionName}) ✓`, 'success');
        return true;
      } catch (err) {
        console.error(`❌ [Firestore] Error saving token to "${collectionName}":`, err);
        Utils.toast(`Firestore write notice: ${err.message}`, 'info');
        return false;
      }
    } else {
      console.log('ℹ️ Local/Guest session: Token stored in local cache.');
      return false;
    }
  }

  loadLocalUser() {
    try {
      const data = localStorage.getItem(this.storageKeyLocalUser);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  persistLocalUser(user) {
    if (user) {
      localStorage.setItem(this.storageKeyLocalUser, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.storageKeyLocalUser);
    }
  }

  notifyAuthState() {
    this.dispatchEvent(new CustomEvent('auth:stateChanged', {
      detail: { user: this.currentUser, isLoggedIn: !!this.currentUser }
    }));
  }

  /**
   * 1. Google Sign-In (Firebase Popup)
   */
  async signInWithGoogle() {
    if (this.authInstance && window.firebase && window.firebase.auth) {
      try {
        const provider = new window.firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const result = await this.authInstance.signInWithPopup(provider);
        const user = result.user;
        this.currentUser = {
          uid: user.uid,
          displayName: user.displayName || user.email.split('@')[0],
          email: user.email,
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.displayName || user.email)}`,
          isAnonymous: false,
          provider: 'google.com'
        };
        this.persistLocalUser(this.currentUser);
        this.notifyAuthState();
        Utils.toast(`Signed in as ${this.currentUser.displayName}`, 'success');
        
        // Sync token from Firestore collection
        await this.syncTokenFromFirestore(user.uid);
        
        return this.currentUser;
      } catch (err) {
        console.warn('Google Popup error:', err);
        if (err.code === 'auth/api-key-not-valid' || err.code === 'auth/configuration-not-found') {
          return this.promptDemoLogin(err.message);
        }
        Utils.toast(`Google Auth: ${err.message}`, 'error');
        throw err;
      }
    } else {
      return this.promptDemoLogin('Firebase Auth SDK fallback');
    }
  }

  /**
   * 2. Email & Password Sign In
   */
  async signInWithEmail(email, password) {
    if (!email || !password) {
      throw new Error('Please provide email and password');
    }

    if (this.authInstance) {
      try {
        const result = await this.authInstance.signInWithEmailAndPassword(email, password);
        const user = result.user;
        this.currentUser = {
          uid: user.uid,
          displayName: user.displayName || email.split('@')[0],
          email: user.email,
          photoURL: user.photoURL || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(email)}`,
          isAnonymous: false,
          provider: 'password'
        };
        this.persistLocalUser(this.currentUser);
        this.notifyAuthState();
        Utils.toast(`Welcome back, ${this.currentUser.displayName}!`, 'success');

        // Sync token from Firestore
        await this.syncTokenFromFirestore(user.uid);

        return this.currentUser;
      } catch (err) {
        // Fallback for local account simulation if Firebase auth email/password is not enabled in Firebase console
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/user-not-found' || err.code === 'auth/api-key-not-valid') {
          return this.loginLocalAccount(email, email.split('@')[0]);
        }
        Utils.toast(`Sign In: ${err.message}`, 'error');
        throw err;
      }
    } else {
      return this.loginLocalAccount(email, email.split('@')[0]);
    }
  }

  /**
   * 3. Create Account / Sign Up
   */
  async signUpWithEmail(name, email, password, apiToken = '') {
    if (!email || !password) {
      throw new Error('Please provide an email and password');
    }

    if (apiToken) {
      api.setToken(apiToken);
    }

    if (this.authInstance) {
      try {
        const result = await this.authInstance.createUserWithEmailAndPassword(email, password);
        const user = result.user;
        if (name && user.updateProfile) {
          await user.updateProfile({ displayName: name });
        }
        this.currentUser = {
          uid: user.uid,
          displayName: name || email.split('@')[0],
          email: user.email,
          photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || email)}`,
          isAnonymous: false,
          provider: 'password'
        };
        this.persistLocalUser(this.currentUser);
        this.notifyAuthState();
        Utils.toast(`Account created for ${this.currentUser.displayName}`, 'success');

        if (apiToken) {
          await this.saveTokenToFirestore(apiToken);
        } else {
          await this.syncTokenFromFirestore(user.uid);
        }

        return this.currentUser;
      } catch (err) {
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/api-key-not-valid') {
          return this.loginLocalAccount(email, name || email.split('@')[0]);
        }
        Utils.toast(`Sign Up: ${err.message}`, 'error');
        throw err;
      }
    } else {
      return this.loginLocalAccount(email, name || email.split('@')[0]);
    }
  }

  loginLocalAccount(email, name) {
    const localUser = {
      uid: 'local_' + Date.now(),
      displayName: name || email.split('@')[0],
      email: email,
      photoURL: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || email)}`,
      isAnonymous: false,
      provider: 'local'
    };
    this.currentUser = localUser;
    this.persistLocalUser(localUser);
    this.notifyAuthState();
    Utils.toast(`Signed in as ${localUser.displayName}`, 'success');
    return localUser;
  }

  /**
   * 4. Guest Demo Login
   */
  signInAsGuest() {
    const guestUser = {
      uid: 'guest_' + Date.now(),
      displayName: 'Guest Planner',
      email: 'guest.planner@chronos.app',
      photoURL: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&h=128&q=80',
      isAnonymous: true,
      provider: 'guest'
    };
    this.currentUser = guestUser;
    this.persistLocalUser(guestUser);
    this.notifyAuthState();
    Utils.toast('Welcome to Chronos Planner (Guest Mode)', 'info');
    return guestUser;
  }

  promptDemoLogin(reason = '') {
    return this.signInAsGuest();
  }

  /**
   * Sign Out
   */
  async signOut() {
    if (this.authInstance) {
      try {
        await this.authInstance.signOut();
      } catch (e) {
        console.warn('Sign out error:', e);
      }
    }
    this.currentUser = null;
    this.persistLocalUser(null);
    this.notifyAuthState();
    Utils.toast('Signed out', 'info');
  }

  isLoggedIn() {
    return !!this.currentUser;
  }

  getUser() {
    return this.currentUser;
  }
}

export const auth = new AuthManager();
