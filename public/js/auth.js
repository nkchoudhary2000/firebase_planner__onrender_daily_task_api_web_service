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
    this.unsubscribeSnapshot = null;
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
            
            // Start real-time multi-device Firestore token sync
            this.startFirestoreRealtimeSync(user.uid, user.email);
          } else {
            this.stopFirestoreRealtimeSync();
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
   * Start real-time multi-device Firestore listener for token & settings
   * Permanently syncs from Firestore database collection (Spark plan)
   * @param {string|null} uid
   * @param {string|null} email
   */
  startFirestoreRealtimeSync(uid = null, email = null) {
    if (!this.db) return;
    this.stopFirestoreRealtimeSync();

    const collectionName = ENV.FIRESTORE_COLLECTION || 'daily_task_planner_users';
    const userEmail = email || (this.currentUser ? this.currentUser.email : null);
    const sanitizedEmail = userEmail ? userEmail.toLowerCase().replace(/[^a-z0-9]/g, '_') : null;
    const docId = uid || (sanitizedEmail ? `email_${sanitizedEmail}` : null);

    if (!docId) return;

    try {
      const docRef = this.db.collection(collectionName).doc(docId);
      
      this.unsubscribeSnapshot = docRef.onSnapshot(async (docSnap) => {
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          let tokenUpdated = false;

          if (data.chronos_api_token && data.chronos_api_token.trim()) {
            const currentToken = api.getToken();
            if (currentToken !== data.chronos_api_token.trim()) {
              api.setToken(data.chronos_api_token.trim());
              tokenUpdated = true;
              console.log(`☁️ [Firestore Database Cloud Sync] Active permanent token received from "${collectionName}/${docId}"`);
            }
          } else {
            // Firestore doc exists but has no token; if this device has an in-memory token, upload it now
            const localToken = api.getToken();
            if (localToken && localToken.trim()) {
              console.log(`☁️ [Firestore Sync] Auto-migrating active token to "${collectionName}/${docId}"...`);
              await this.saveTokenToFirestore(localToken);
            }
          }

          if (data.chronos_base_url && data.chronos_base_url.trim()) {
            api.setBaseUrl(data.chronos_base_url.trim());
          }

          if (tokenUpdated) {
            this.dispatchEvent(new CustomEvent('token:syncedFromFirestore', {
              detail: { token: data.chronos_api_token, baseUrl: data.chronos_base_url, source: 'firestore_realtime' }
            }));
            Utils.toast('☁️ Permanent API Token synchronized from Firestore Cloud Database', 'success', 3000);
          }
        } else {
          // Document does not exist by primary ID yet; check if stored under email or fallback collection
          let restored = false;

          if (sanitizedEmail && docId !== `email_${sanitizedEmail}`) {
            const emailDoc = await this.db.collection(collectionName).doc(`email_${sanitizedEmail}`).get().catch(() => null);
            if (emailDoc && emailDoc.exists && emailDoc.data() && emailDoc.data().chronos_api_token) {
              const emailToken = emailDoc.data().chronos_api_token;
              const emailBaseUrl = emailDoc.data().chronos_base_url;
              api.setToken(emailToken);
              if (emailBaseUrl) api.setBaseUrl(emailBaseUrl);
              console.log(`☁️ [Firestore Sync] Restored permanent token by email (${userEmail})`);
              await this.saveTokenToFirestore(emailToken, emailBaseUrl);
              this.dispatchEvent(new CustomEvent('token:syncedFromFirestore', {
                detail: { token: emailToken, baseUrl: emailBaseUrl, source: 'firestore_email_restore' }
              }));
              restored = true;
            }
          }

          if (!restored && uid) {
            const fallbackSnap = await this.db.collection('users').doc(uid).get().catch(() => null);
            if (fallbackSnap && fallbackSnap.exists && fallbackSnap.data() && fallbackSnap.data().chronos_api_token) {
              const fallbackToken = fallbackSnap.data().chronos_api_token;
              api.setToken(fallbackToken);
              console.log(`☁️ [Firestore Sync] Restored token from fallback users/${uid}`);
              await this.saveTokenToFirestore(fallbackToken);
              this.dispatchEvent(new CustomEvent('token:syncedFromFirestore', {
                detail: { token: fallbackToken, source: 'firestore_fallback' }
              }));
              restored = true;
            }
          }

          // If this session has a token, auto-save to Firestore so all sessions and future logins receive it
          if (!restored) {
            const localToken = api.getToken();
            if (localToken && localToken.trim()) {
              console.log(`☁️ [Firestore Sync] First-time setup: Uploading active token to "${collectionName}/${docId}"...`);
              await this.saveTokenToFirestore(localToken);
            }
          }
        }
      }, (err) => {
        if (err.code === 'permission-denied' || (err.message && err.message.includes('permission'))) {
          this.firestorePermissionError = true;
          console.warn(`⚠️ [Firestore Rules Notice] ${collectionName} requires read/write permission in Firebase Console.\nUpdate your Firebase Console -> Firestore Database -> Rules tab with:\n\nmatch /daily_task_planner_users/{userId} { allow read, write: if true; }`);
        } else {
          console.warn(`⚠️ [Firestore Listener Notice] ${collectionName}:`, err.message);
        }
      });
    } catch (e) {
      console.warn('⚠️ [Firestore Setup Error]:', e.message);
    }
  }

  stopFirestoreRealtimeSync() {
    if (this.unsubscribeSnapshot) {
      this.unsubscribeSnapshot();
      this.unsubscribeSnapshot = null;
    }
  }

  /**
   * Save / update Chronos API token permanently in Firestore database collection
   * @param {string} token 
   * @param {string|null} [baseUrl=null]
   * @returns {Promise<boolean>}
   */
  async saveTokenToFirestore(token, baseUrl = null) {
    // 1. Update in-memory API client
    api.setToken(token);
    if (baseUrl) api.setBaseUrl(baseUrl);

    const collectionName = ENV.FIRESTORE_COLLECTION || 'daily_task_planner_users';
    const user = this.currentUser;

    // 2. Persist permanently to Firestore database collection (Spark Plan)
    if (this.db) {
      try {
        const payload = {
          chronos_api_token: token ? token.trim() : '',
          chronos_base_url: baseUrl ? baseUrl.trim() : api.getBaseUrl(),
          email: user && user.email ? user.email : '',
          displayName: user && user.displayName ? user.displayName : '',
          updated_at: (typeof window !== 'undefined' && window.firebase && window.firebase.firestore)
            ? window.firebase.firestore.FieldValue.serverTimestamp()
            : new Date()
        };

        // Write to primary document (UID)
        if (user && user.uid && !user.uid.startsWith('guest_')) {
          await this.db.collection(collectionName).doc(user.uid).set(payload, { merge: true });
        }

        // Dual-index document by email so token is 100% permanently recoverable even after clearing browser cookies & site data
        if (user && user.email) {
          const sanitizedEmail = user.email.toLowerCase().replace(/[^a-z0-9]/g, '_');
          await this.db.collection(collectionName).doc(`email_${sanitizedEmail}`).set(payload, { merge: true });
        }

        // Write to fallback 'users' collection for extra resilience
        if (user && user.uid && !user.uid.startsWith('guest_')) {
          this.db.collection('users').doc(user.uid).set(payload, { merge: true }).catch(() => {});
        }

        console.log(`☁️ [Firestore Cloud Database] Token permanently stored in "${collectionName}"`);
        Utils.toast(`Token saved permanently in Firestore Database (Cloud) ✓`, 'success');
        return true;
      } catch (err) {
        console.error(`❌ [Firestore] Error saving token to "${collectionName}":`, err);
        Utils.toast(`Firestore write notice: ${err.message}`, 'info');
        return false;
      }
    } else {
      console.log('ℹ️ Firestore DB not initialized yet.');
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
        
        // Start real-time multi-device token sync
        this.startFirestoreRealtimeSync(user.uid, user.email);
        
        return this.currentUser;
      } catch (err) {
        console.warn('Google Auth notice:', err.code || err.message);
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          // User closed the popup window, clean silent exit
          return null;
        }
        if (err.code === 'auth/popup-blocked') {
          Utils.toast('Popup blocked by browser. Please allow popups or try again.', 'info');
          try {
            const provider = new window.firebase.auth.GoogleAuthProvider();
            await this.authInstance.signInWithRedirect(provider);
            return null;
          } catch (e) {}
        }
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

        // Start real-time multi-device token sync
        this.startFirestoreRealtimeSync(user.uid, user.email);

        return this.currentUser;
      } catch (err) {
        // Fallback for local account simulation if Firebase auth email/password is not enabled in Firebase console
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/user-not-found' || err.code === 'auth/api-key-not-valid') {
          const localUser = this.loginLocalAccount(email, email.split('@')[0]);
          this.startFirestoreRealtimeSync(null, email);
          return localUser;
        }
        Utils.toast(`Sign In: ${err.message}`, 'error');
        throw err;
      }
    } else {
      const localUser = this.loginLocalAccount(email, email.split('@')[0]);
      this.startFirestoreRealtimeSync(null, email);
      return localUser;
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
        }
        this.startFirestoreRealtimeSync(user.uid, user.email);

        return this.currentUser;
      } catch (err) {
        if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/api-key-not-valid') {
          const localUser = this.loginLocalAccount(email, name || email.split('@')[0]);
          if (apiToken) {
            await this.saveTokenToFirestore(apiToken);
          }
          this.startFirestoreRealtimeSync(null, email);
          return localUser;
        }
        Utils.toast(`Sign Up: ${err.message}`, 'error');
        throw err;
      }
    } else {
      const localUser = this.loginLocalAccount(email, name || email.split('@')[0]);
      if (apiToken) {
        await this.saveTokenToFirestore(apiToken);
      }
      this.startFirestoreRealtimeSync(null, email);
      return localUser;
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
    this.stopFirestoreRealtimeSync();
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
    this.stopFirestoreRealtimeSync();
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
