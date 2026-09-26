/**
 * CloudSyncService - Provides real-time and debounced cloud synchronization
 * for user progress, bookmarks, and activity using Firebase Firestore or fallback backup.
 */

export class CloudSyncService {
  static STATES = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    SYNCING: 'syncing',
    ERROR: 'error'
  };

  static currentState = CloudSyncService.STATES.DISCONNECTED;
  static statusMessage = 'Local Storage Mode';
  static lastSyncTime = null;
  static listeners = new Set();
  
  static firestoreDb = null;
  static firebaseApp = null;
  static syncTimer = null;
  static isInitialized = false;
  static onRemoteUpdateCallback = null;

  /**
   * Registers a listener callback for cloud sync status changes.
   * @param {function} callback 
   */
  static onStatusChange(callback) {
    this.listeners.add(callback);
    // Fire immediately with current state
    callback(this.getStatus());
    return () => this.listeners.delete(callback);
  }

  /**
   * Dispatches status updates to all registered listeners.
   */
  static notifyListeners() {
    const status = this.getStatus();
    this.listeners.forEach(cb => {
      try { cb(status); } catch (e) { console.error('CloudSync listener error:', e); }
    });
  }

  /**
   * Returns current sync status snapshot.
   */
  static getStatus(fallbackConfig = null) {
    return {
      state: this.currentState,
      message: this.statusMessage,
      lastSyncTime: this.lastSyncTime,
      isConfigured: this.isConfigured(fallbackConfig)
    };
  }

  /**
   * Updates state and notifies listeners.
   */
  static setState(state, message = '') {
    this.currentState = state;
    this.statusMessage = message;
    this.notifyListeners();
  }

  /**
   * Checks if a cloud configuration exists.
   */
  static isConfigured(fallbackConfig = null) {
    const cfg = this.getConfig(fallbackConfig);
    return !!(cfg && cfg.apiKey && cfg.projectId);
  }

  /**
   * Gets current active cloud configuration.
   */
  static getConfig(fallbackConfig = null) {
    const saved = localStorage.getItem('MRCP_CLOUD_CONFIG');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      } catch (e) {
        console.warn('Failed to parse local cloud config:', e);
      }
    }
    if (fallbackConfig && fallbackConfig.firebase && fallbackConfig.firebase.projectId) {
      return fallbackConfig.firebase;
    }
    return null;
  }

  /**
   * Saves a new cloud configuration and initializes the service.
   * @param {object} config Firebase config object
   * @param {object} storageService StorageService reference
   */
  static async setConfig(config, storageService) {
    if (!config || !config.apiKey || !config.projectId) {
      throw new Error('Invalid Firebase config. apiKey and projectId are required.');
    }
    localStorage.setItem('MRCP_CLOUD_CONFIG', JSON.stringify(config));
    return await this.init(config, storageService, true);
  }

  /**
   * Removes cloud config and resets to local mode.
   */
  static clearConfig() {
    localStorage.removeItem('MRCP_CLOUD_CONFIG');
    this.firestoreDb = null;
    this.firebaseApp = null;
    this.isInitialized = false;
    this.setState(this.STATES.DISCONNECTED, 'Local Storage Mode');
  }

  /**
   * Initializes Firebase Firestore dynamically via standard ESM modules.
   * @param {object} config 
   * @param {object} storageService 
   * @param {boolean} forceReinit 
   */
  static async init(config, storageService, forceReinit = false) {
    if (this.isInitialized && !forceReinit) return true;

    if (!config || !config.apiKey || !config.projectId) {
      this.setState(this.STATES.DISCONNECTED, 'Local Storage Mode');
      return false;
    }

    this.setState(this.STATES.CONNECTING, 'Connecting to Cloud...');

    try {
      // Dynamically load Firebase modules from CDN
      const { initializeApp, getApps, getApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      const existingApps = getApps();
      this.firebaseApp = existingApps.length > 0 ? getApp() : initializeApp(config);
      this.firestoreDb = getFirestore(this.firebaseApp);
      this.isInitialized = true;

      this.setState(this.STATES.CONNECTED, 'Cloud Connected');
      console.log('☁️ Firebase Cloud Sync connected successfully.');

      // Perform initial bidirectional sync if user is authenticated
      if (storageService) {
        await this.syncOnStartup(storageService);
      }

      return true;
    } catch (err) {
      console.error('Failed to initialize Firebase Cloud Sync:', err);
      this.setState(this.STATES.ERROR, `Cloud Sync Error: ${err.message || 'Connection failed'}`);
      return false;
    }
  }

  /**
   * Generates a safe Firestore document key from user email.
   * @param {string} email 
   * @returns {string}
   */
  static getDocId(email) {
    if (!email) return 'guest_user';
    return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  /**
   * Initial synchronization when the app loads or user logs in.
   * Pulls remote profile data and merges with local data (newest wins).
   * @param {object} storageService 
   */
  static async syncOnStartup(storageService) {
    if (!this.firestoreDb) return;

    const userEmail = storageService.getCurrentUserEmail();
    if (!userEmail || userEmail === 'guest') return;

    this.setState(this.STATES.SYNCING, 'Checking for cloud updates...');

    try {
      const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
      const docId = this.getDocId(userEmail);
      const userDocRef = doc(this.firestoreDb, 'mrcp_user_profiles', docId);

      const snapshot = await getDoc(userDocRef);
      if (snapshot.exists()) {
        const remoteData = snapshot.data();
        const localData = storageService.exportProfileData();

        // Compare timestamps to decide merge/overwrite
        const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;
        const localTime = localData.exportedAt ? new Date(localData.exportedAt).getTime() : 0;

        if (remoteTime > localTime) {
          // Cloud has newer data: update local profile
          console.log('☁️ Pulling newer data from cloud...');
          storageService.importProfileData(JSON.stringify(remoteData), false); // false = do not re-upload
          this.lastSyncTime = new Date();
          this.setState(this.STATES.CONNECTED, 'Synced with Cloud');
          if (this.onRemoteUpdateCallback) {
            this.onRemoteUpdateCallback();
          }
        } else {
          // Local has newer or equal data: push to cloud
          console.log('☁️ Pushing local progress to cloud...');
          await this.pushToCloud(userEmail, localData);
        }
      } else {
        // Document does not exist in cloud yet: push local data
        console.log('☁️ Creating initial profile in cloud...');
        const localData = storageService.exportProfileData();
        await this.pushToCloud(userEmail, localData);
      }
    } catch (err) {
      console.warn('Startup sync failed, continuing offline:', err);
      this.setState(this.STATES.CONNECTED, 'Offline/Cached (Will retry)');
    }
  }

  /**
   * Schedules a debounced sync to cloud (e.g. after answering a question).
   * @param {string} userEmail 
   * @param {object} data 
   * @param {number} delayMs 
   */
  static scheduleSync(userEmail, data, delayMs = 1500) {
    if (!this.firestoreDb || !userEmail || userEmail === 'guest') return;

    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }

    this.setState(this.STATES.SYNCING, 'Syncing changes...');

    this.syncTimer = setTimeout(async () => {
      try {
        await this.pushToCloud(userEmail, data);
      } catch (err) {
        console.warn('Scheduled sync failed:', err);
        this.setState(this.STATES.ERROR, 'Sync paused (Check connection)');
      }
    }, delayMs);
  }

  /**
   * Directly uploads user profile data to Firestore.
   * @param {string} userEmail 
   * @param {object} data 
   */
  static async pushToCloud(userEmail, data) {
    if (!this.firestoreDb || !userEmail || userEmail === 'guest') return;

    const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const docId = this.getDocId(userEmail);
    const userDocRef = doc(this.firestoreDb, 'mrcp_user_profiles', docId);

    const payload = {
      ...data,
      userEmail: userEmail,
      updatedAt: new Date().toISOString()
    };

    await setDoc(userDocRef, payload, { merge: true });
    this.lastSyncTime = new Date();
    this.setState(this.STATES.CONNECTED, 'Cloud Synced');
    console.log(`☁️ Progress successfully saved to Cloud for ${userEmail}`);
  }

  /**
   * Manually pulls user profile data from Firestore.
   * @param {string} userEmail 
   * @returns {Promise<object|null>}
   */
  static async pullFromCloud(userEmail) {
    if (!this.firestoreDb || !userEmail || userEmail === 'guest') return null;

    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const docId = this.getDocId(userEmail);
    const userDocRef = doc(this.firestoreDb, 'mrcp_user_profiles', docId);

    const snapshot = await getDoc(userDocRef);
    if (snapshot.exists()) {
      this.lastSyncTime = new Date();
      this.setState(this.STATES.CONNECTED, 'Cloud Synced');
      return snapshot.data();
    }
    return null;
  }
}
