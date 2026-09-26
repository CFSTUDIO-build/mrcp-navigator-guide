import { AuthService } from './auth.js';
import { CloudSyncService } from './cloudSync.js';

/**
 * StorageService - Robust user-profile-scoped storage service.
 * Persists cumulative progress, active quiz state, analytics, bookmarks,
 * and seamlessly synchronizes with CloudSyncService (Firebase / Cloud).
 */
export class StorageService {
  /**
   * Returns authenticated user's email or fallback to 'guest'.
   * @returns {string}
   */
  static getCurrentUserEmail() {
    return AuthService.getAuthenticatedUser() || 'guest';
  }

  /**
   * Generates a safe storage key prefix scoped to the active user profile.
   * @returns {string}
   */
  static getUserPrefix() {
    const email = this.getCurrentUserEmail();
    const safeId = email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `MRCP_USER::${safeId}::`;
  }

  /**
   * One-time automatic migration of any legacy un-scoped data
   * into the active user's scoped profile.
   */
  static migrateLegacyDataIfNeeded() {
    const prefix = this.getUserPrefix();
    if (localStorage.getItem(prefix + 'INITIALIZED')) return;

    try {
      // 1. Migrate bookmarks
      const legacyBookmarks = localStorage.getItem("MRCP_NAVIGATOR_BOOKMARKS");
      if (legacyBookmarks && !localStorage.getItem(prefix + "BOOKMARKS")) {
        localStorage.setItem(prefix + "BOOKMARKS", legacyBookmarks);
      }

      // 2. Migrate history
      const legacyHistory = localStorage.getItem("MRCP_NAVIGATOR_HISTORY");
      if (legacyHistory && !localStorage.getItem(prefix + "HISTORY")) {
        localStorage.setItem(prefix + "HISTORY", legacyHistory);
      }

      // 3. Migrate activity
      const legacyActivity = localStorage.getItem("MRCP_NAVIGATOR_ACTIVITY");
      if (legacyActivity && !localStorage.getItem(prefix + "ACTIVITY")) {
        localStorage.setItem(prefix + "ACTIVITY", legacyActivity);
      }

      // 4. Migrate subject states
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("MRCP_NAVIGATOR_STATE::")) {
          const subject = key.replace("MRCP_NAVIGATOR_STATE::", "");
          const data = localStorage.getItem(key);
          if (data && !localStorage.getItem(prefix + "STATE::" + subject)) {
            localStorage.setItem(prefix + "STATE::" + subject, data);
          }
        }
      }

      localStorage.setItem(prefix + 'INITIALIZED', 'true');
    } catch (e) {
      console.warn('Migration warning:', e);
    }
  }

  // -------------------------------------------------------------
  // A. ACTIVE QUIZ SESSION STATE (Transient in-progress session)
  // -------------------------------------------------------------

  /**
   * Loads saved active session state for a specific subject.
   * @param {string} subject 
   * @returns {object|null}
   */
  static getSubjectState(subject) {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    const data = localStorage.getItem(prefix + "STATE::" + subject);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Saves active session state for a specific subject.
   * @param {string} subject 
   * @param {object} state 
   */
  static saveSubjectState(subject, state) {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    localStorage.setItem(prefix + "STATE::" + subject, JSON.stringify(state));
  }

  /**
   * Clears saved active session state for a specific subject.
   * Note: This does NOT delete cumulative question progress.
   * @param {string} subject 
   */
  static clearSubjectState(subject) {
    const prefix = this.getUserPrefix();
    localStorage.removeItem(prefix + "STATE::" + subject);
  }

  /**
   * Checks if subject has an active uncompleted session.
   * @param {string} subject 
   * @returns {boolean}
   */
  static hasSavedState(subject) {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    return !!localStorage.getItem(prefix + "STATE::" + subject);
  }

  // -------------------------------------------------------------
  // B. CUMULATIVE SUBJECT & QUESTION PROGRESS (Permanent Records)
  // -------------------------------------------------------------

  /**
   * Loads all subjects' cumulative progress dictionary for current user.
   * @returns {object}
   */
  static getAllSubjectsProgress() {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    const data = localStorage.getItem(prefix + "PROGRESS");
    return data ? JSON.parse(data) : {};
  }

  /**
   * Gets cumulative progress object for a specific subject.
   * @param {string} subject 
   * @returns {object}
   */
  static getSubjectProgress(subject) {
    const all = this.getAllSubjectsProgress();
    return all[subject] || {
      totalCount: 0,
      answeredCount: 0,
      correctCount: 0,
      lastIndex: 0,
      answeredQuestions: {},
      isCompleted: false,
      updatedAt: null
    };
  }

  /**
   * Permanently records an answered question into cumulative profile progress.
   * @param {string} subject 
   * @param {number} qIndex 
   * @param {boolean} isCorrect 
   * @param {number} chosenIndex 
   * @param {string} chosenText 
   * @param {string} correctText 
   * @param {number} totalCount 
   */
  static recordQuestionAnswer(subject, qIndex, isCorrect, chosenIndex, chosenText, correctText, totalCount) {
    const all = this.getAllSubjectsProgress();
    if (!all[subject]) {
      all[subject] = {
        totalCount: totalCount || 0,
        answeredCount: 0,
        correctCount: 0,
        lastIndex: qIndex,
        answeredQuestions: {},
        isCompleted: false,
        updatedAt: null
      };
    }

    const sub = all[subject];
    if (totalCount && (!sub.totalCount || sub.totalCount === 0)) {
      sub.totalCount = totalCount;
    }

    // Save or update question response record
    sub.answeredQuestions[qIndex] = {
      isCorrect: !!isCorrect,
      chosenIndex: chosenIndex,
      chosenText: chosenText || "",
      correctText: correctText || "",
      answeredAt: new Date().toISOString()
    };

    // Recalculate answered and correct counts from dictionary
    const qEntries = Object.values(sub.answeredQuestions);
    sub.answeredCount = qEntries.length;
    sub.correctCount = qEntries.filter(q => q.isCorrect).length;
    sub.lastIndex = qIndex;
    sub.updatedAt = new Date().toISOString();

    if (sub.totalCount > 0 && sub.answeredCount >= sub.totalCount) {
      sub.isCompleted = true;
    }

    const prefix = this.getUserPrefix();
    localStorage.setItem(prefix + "PROGRESS", JSON.stringify(all));

    // Schedule debounced cloud sync
    this.triggerCloudSync();
  }

  /**
   * Returns list of wrong question indices for a subject to enable mistake reviews.
   * @param {string} subject 
   * @returns {number[]}
   */
  static getWrongQuestions(subject) {
    const sub = this.getSubjectProgress(subject);
    const wrong = [];
    Object.entries(sub.answeredQuestions || {}).forEach(([idxStr, item]) => {
      if (!item.isCorrect) {
        wrong.push(parseInt(idxStr, 10));
      }
    });
    return wrong;
  }

  /**
   * Resets all progress data for a single subject upon user confirmation.
   * @param {string} subject 
   */
  static resetSubjectProgress(subject) {
    const all = this.getAllSubjectsProgress();
    if (all[subject]) {
      delete all[subject];
      const prefix = this.getUserPrefix();
      localStorage.setItem(prefix + "PROGRESS", JSON.stringify(all));
    }
    this.clearSubjectState(subject);
    this.triggerCloudSync();
  }

  // -------------------------------------------------------------
  // C. BOOKMARKS / FLAGGED QUESTIONS
  // -------------------------------------------------------------

  /**
   * Loads all bookmarked questions for current user.
   * @returns {object} { subjectName: [qIndexes] }
   */
  static getBookmarks() {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    const data = localStorage.getItem(prefix + "BOOKMARKS");
    return data ? JSON.parse(data) : {};
  }

  /**
   * Checks if a question is bookmarked.
   * @param {string} subject 
   * @param {number} qIndex 
   * @returns {boolean}
   */
  static isBookmarked(subject, qIndex) {
    const b = this.getBookmarks();
    return b[subject] ? b[subject].includes(qIndex) : false;
  }

  /**
   * Toggles bookmark state for a question.
   * @param {string} subject 
   * @param {number} qIndex 
   * @returns {boolean}
   */
  static toggleBookmark(subject, qIndex) {
    const b = this.getBookmarks();
    if (!b[subject]) b[subject] = [];
    
    const idx = b[subject].indexOf(qIndex);
    if (idx >= 0) {
      b[subject].splice(idx, 1);
      if (b[subject].length === 0) {
        delete b[subject];
      }
    } else {
      b[subject].push(qIndex);
    }

    const prefix = this.getUserPrefix();
    localStorage.setItem(prefix + "BOOKMARKS", JSON.stringify(b));
    this.triggerCloudSync();
    return idx < 0;
  }

  // -------------------------------------------------------------
  // D. QUIZ HISTORY & SESSIONS
  // -------------------------------------------------------------

  /**
   * Loads completed quiz session history.
   * @returns {array}
   */
  static getHistory() {
    this.migrateLegacyDataIfNeeded();
    const prefix = this.getUserPrefix();
    const data = localStorage.getItem(prefix + "HISTORY");
    return data ? JSON.parse(data) : [];
  }

  /**
   * Saves a completed session snapshot.
   * @param {string} subject 
   * @param {number} score 
   * @param {number} total 
   * @param {string} mode 
   */
  static saveSessionResult(subject, score, total, mode) {
    const history = this.getHistory();
    history.push({
      subject,
      score,
      total,
      mode,
      date: new Date().toISOString()
    });

    const prefix = this.getUserPrefix();
    localStorage.setItem(prefix + "HISTORY", JSON.stringify(history));
    this.triggerCloudSync();
  }

  // -------------------------------------------------------------
  // E. ANALYTICS & STATS (Seamlessly combines cumulative & history)
  // -------------------------------------------------------------

  /**
   * Computes lifetime stats and analytical metrics.
   * Pulls from both cumulative answered questions and session history
   * so counters are ALWAYS accurate even if a session was never explicitly finished.
   * @returns {object}
   */
  static getAnalytics() {
    const progressMap = this.getAllSubjectsProgress();
    const history = this.getHistory();

    const stats = {
      totalAnswered: 0,
      totalCorrect: 0,
      subjectBreakdown: {},
      weakSubjects: []
    };

    // 1. Gather stats from cumulative question tracker (primary source of truth)
    Object.entries(progressMap).forEach(([subject, subData]) => {
      const answered = subData.answeredCount || 0;
      const correct = subData.correctCount || 0;

      if (answered > 0) {
        stats.totalAnswered += answered;
        stats.totalCorrect += correct;

        stats.subjectBreakdown[subject] = {
          answered,
          correct
        };
      }
    });

    // 2. Complement with any historical sessions (if subject not in progressMap)
    history.forEach(session => {
      if (!stats.subjectBreakdown[session.subject]) {
        stats.totalAnswered += session.total;
        stats.totalCorrect += session.score;
        stats.subjectBreakdown[session.subject] = {
          answered: session.total,
          correct: session.score
        };
      }
    });

    // 3. Calculate subject accuracy breakdown
    const breakdown = Object.entries(stats.subjectBreakdown).map(([sub, data]) => {
      const accuracy = data.answered > 0 ? (data.correct / data.answered) * 100 : 0;
      return { subject: sub, accuracy, answered: data.answered };
    });

    // 4. Identify Weak subjects: accuracy < 70% with at least 5 questions answered
    stats.weakSubjects = breakdown
      .filter(b => b.accuracy < 70 && b.answered >= 5)
      .sort((a, b) => a.accuracy - b.accuracy)
      .map(b => b.subject);

    return stats;
  }

  // -------------------------------------------------------------
  // F. DAILY ACTIVITY & STREAKS
  // -------------------------------------------------------------

  /**
   * Loads activity tracking data (streaks, daily goal counts)
   * @returns {object}
   */
  static getActivity() {
    this.migrateLegacyDataIfNeeded();
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultActivity = {
      streak: 0,
      lastActiveDate: null,
      dailyPracticed: 0,
      dailyTarget: 20,
      todayDate: todayStr
    };

    const prefix = this.getUserPrefix();
    const data = localStorage.getItem(prefix + "ACTIVITY");
    if (!data) return defaultActivity;

    try {
      const parsed = JSON.parse(data);
      // New day rollover
      if (parsed.todayDate !== todayStr) {
        let newStreak = parsed.streak || 0;
        if (parsed.lastActiveDate) {
          const last = new Date(parsed.lastActiveDate);
          const today = new Date(todayStr);
          const diffDays = Math.ceil(Math.abs(today - last) / (1000 * 60 * 60 * 24));
          
          if (diffDays > 1) {
            newStreak = 0; // Streak broken
          }
        } else {
          newStreak = 0;
        }

        parsed.streak = newStreak;
        parsed.dailyPracticed = 0;
        parsed.todayDate = todayStr;
        localStorage.setItem(prefix + "ACTIVITY", JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      return defaultActivity;
    }
  }

  /**
   * Records a question practice in daily metrics.
   */
  static recordQuestionPracticed() {
    const activity = this.getActivity();
    const todayStr = new Date().toISOString().split('T')[0];

    activity.dailyPracticed = (activity.dailyPracticed || 0) + 1;

    if (activity.lastActiveDate !== todayStr) {
      if (activity.lastActiveDate) {
        const last = new Date(activity.lastActiveDate);
        const today = new Date(todayStr);
        const diffDays = Math.ceil(Math.abs(today - last) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          activity.streak = (activity.streak || 0) + 1;
        } else {
          activity.streak = 1;
        }
      } else {
        activity.streak = 1;
      }
      activity.lastActiveDate = todayStr;
    }

    const prefix = this.getUserPrefix();
    localStorage.setItem(prefix + "ACTIVITY", JSON.stringify(activity));
    this.triggerCloudSync();
  }

  // -------------------------------------------------------------
  // G. BACKUP, EXPORT, IMPORT & CLOUD SYNC
  // -------------------------------------------------------------

  /**
   * Triggers a debounced sync to the cloud service.
   */
  static triggerCloudSync() {
    const email = this.getCurrentUserEmail();
    if (email && email !== 'guest') {
      const payload = this.exportProfileData();
      CloudSyncService.scheduleSync(email, payload, 1200);
    }
  }

  /**
   * Exports full profile state as a JSON-serializable object.
   * @returns {object}
   */
  static exportProfileData() {
    return {
      userEmail: this.getCurrentUserEmail(),
      exportedAt: new Date().toISOString(),
      progress: this.getAllSubjectsProgress(),
      bookmarks: this.getBookmarks(),
      history: this.getHistory(),
      activity: this.getActivity(),
      theme: this.getTheme()
    };
  }

  /**
   * Restores user profile state from a JSON string or object.
   * @param {string|object} input 
   * @param {boolean} pushToCloudNow 
   */
  static importProfileData(input, pushToCloudNow = true) {
    const data = typeof input === 'string' ? JSON.parse(input) : input;
    if (!data) throw new Error("Invalid import data.");

    const prefix = this.getUserPrefix();

    if (data.progress) {
      localStorage.setItem(prefix + "PROGRESS", JSON.stringify(data.progress));
    }
    if (data.bookmarks) {
      localStorage.setItem(prefix + "BOOKMARKS", JSON.stringify(data.bookmarks));
    }
    if (data.history) {
      localStorage.setItem(prefix + "HISTORY", JSON.stringify(data.history));
    }
    if (data.activity) {
      localStorage.setItem(prefix + "ACTIVITY", JSON.stringify(data.activity));
    }
    if (data.theme) {
      this.saveTheme(data.theme);
    }

    if (pushToCloudNow) {
      this.triggerCloudSync();
    }

    return true;
  }

  /**
   * Downloads profile data as a formatted JSON file.
   */
  static downloadBackupFile() {
    const data = this.exportProfileData();
    const email = this.getCurrentUserEmail().replace(/[^a-z0-9]/g, '_');
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `mrcp-navigator-backup-${email}-${dateStr}.json`;

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Resets all history, progress, bookmarks for the CURRENT user profile.
   */
  static resetAllData() {
    const prefix = this.getUserPrefix();
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    
    // Also update cloud if connected
    this.triggerCloudSync();
  }

  // -------------------------------------------------------------
  // H. THEME SETTINGS
  // -------------------------------------------------------------

  /**
   * Gets visual theme (dark or light).
   * @returns {string}
   */
  static getTheme() {
    const settings = localStorage.getItem("MRCP_NAVIGATOR_SETTINGS");
    if (settings) {
      try {
        const parsed = JSON.parse(settings);
        if (parsed.theme) return parsed.theme;
      } catch (e) {}
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /**
   * Saves theme setting.
   * @param {string} theme 
   */
  static saveTheme(theme) {
    const settings = localStorage.getItem("MRCP_NAVIGATOR_SETTINGS");
    let parsed = {};
    if (settings) {
      try { parsed = JSON.parse(settings); } catch (e) {}
    }
    parsed.theme = theme;
    localStorage.setItem("MRCP_NAVIGATOR_SETTINGS", JSON.stringify(parsed));
  }
}
