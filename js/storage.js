/**
 * StorageService - Wraps localStorage to persist quiz state, statistics, bookmarks, and settings.
 */
export class StorageService {
  static KEYS = {
    STATE: "MRCP_NAVIGATOR_STATE::",
    BOOKMARKS: "MRCP_NAVIGATOR_BOOKMARKS",
    HISTORY: "MRCP_NAVIGATOR_HISTORY",
    SETTINGS: "MRCP_NAVIGATOR_SETTINGS"
  };

  /**
   * Loads saved progress state for a specific subject.
   * @param {string} subject 
   * @returns {object|null}
   */
  static getSubjectState(subject) {
    const data = localStorage.getItem(this.KEYS.STATE + subject);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Saves progress state for a specific subject.
   * @param {string} subject 
   * @param {object} state 
   */
  static saveSubjectState(subject, state) {
    localStorage.setItem(this.KEYS.STATE + subject, JSON.stringify(state));
  }

  /**
   * Clears saved progress state for a specific subject.
   * @param {string} subject 
   */
  static clearSubjectState(subject) {
    localStorage.removeItem(this.KEYS.STATE + subject);
  }

  /**
   * Checks if subject has saved progress.
   * @param {string} subject 
   * @returns {boolean}
   */
  static hasSavedState(subject) {
    return !!localStorage.getItem(this.KEYS.STATE + subject);
  }

  /**
   * Loads all bookmarked/flagged questions.
   * @returns {object} { subjectName: [qIndexes] }
   */
  static getBookmarks() {
    const data = localStorage.getItem(this.KEYS.BOOKMARKS);
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
   * Toggles the bookmark state of a question.
   * @param {string} subject 
   * @param {number} qIndex 
   * @returns {boolean} True if bookmarked, false if removed
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
    localStorage.setItem(this.KEYS.BOOKMARKS, JSON.stringify(b));
    return idx < 0;
  }

  /**
   * Loads completed quiz history.
   * @returns {array}
   */
  static getHistory() {
    const data = localStorage.getItem(this.KEYS.HISTORY);
    return data ? JSON.parse(data) : [];
  }

  /**
   * Saves a completed session record.
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
    localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
  }

  /**
   * Computes lifetime stats and analytical parameters (e.g. weak subjects).
   * @returns {object}
   */
  static getAnalytics() {
    const history = this.getHistory();
    const stats = {
      totalAnswered: 0,
      totalCorrect: 0,
      subjectBreakdown: {},
      weakSubjects: []
    };

    history.forEach(session => {
      stats.totalAnswered += session.total;
      stats.totalCorrect += session.score;

      if (!stats.subjectBreakdown[session.subject]) {
        stats.subjectBreakdown[session.subject] = { answered: 0, correct: 0 };
      }
      stats.subjectBreakdown[session.subject].answered += session.total;
      stats.subjectBreakdown[session.subject].correct += session.score;
    });

    const breakdown = Object.entries(stats.subjectBreakdown).map(([sub, data]) => {
      const accuracy = data.answered > 0 ? (data.correct / data.answered) * 100 : 0;
      return { subject: sub, accuracy, answered: data.answered };
    });

    // Weak subjects defined as accuracy < 70% with at least 5 questions answered
    stats.weakSubjects = breakdown
      .filter(b => b.accuracy < 70 && b.answered >= 5)
      .sort((a, b) => a.accuracy - b.accuracy)
      .map(b => b.subject);

    return stats;
  }

  /**
   * Loads activity tracking data (streaks, daily goal counts)
   * @returns {object}
   */
  static getActivity() {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultActivity = {
      streak: 0,
      lastActiveDate: null,
      dailyPracticed: 0,
      dailyTarget: 20,
      todayDate: todayStr
    };

    const data = localStorage.getItem("MRCP_NAVIGATOR_ACTIVITY");
    if (!data) return defaultActivity;

    try {
      const parsed = JSON.parse(data);
      // If it's a new day, reset daily counts and update streaks
      if (parsed.todayDate !== todayStr) {
        let newStreak = parsed.streak;
        if (parsed.lastActiveDate) {
          const last = new Date(parsed.lastActiveDate);
          const today = new Date(todayStr);
          const diffTime = Math.abs(today - last);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          if (diffDays > 1) {
            newStreak = 0; // Streak broken
          }
        } else {
          newStreak = 0;
        }

        parsed.streak = newStreak;
        parsed.dailyPracticed = 0;
        parsed.todayDate = todayStr;
        localStorage.setItem("MRCP_NAVIGATOR_ACTIVITY", JSON.stringify(parsed));
      }
      return parsed;
    } catch (e) {
      return defaultActivity;
    }
  }

  /**
   * Records a question being practiced, updating streak and daily metrics.
   */
  static recordQuestionPracticed() {
    const activity = this.getActivity();
    const todayStr = new Date().toISOString().split('T')[0];

    activity.dailyPracticed += 1;

    // Check streak
    if (activity.lastActiveDate !== todayStr) {
      if (activity.lastActiveDate) {
        const last = new Date(activity.lastActiveDate);
        const today = new Date(todayStr);
        const diffTime = Math.abs(today - last);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 1) {
          activity.streak += 1; // Consecutive day
        } else {
          activity.streak = 1; // Reset to 1 day
        }
      } else {
        activity.streak = 1; // Start streak
      }
      activity.lastActiveDate = todayStr;
    }

    localStorage.setItem("MRCP_NAVIGATOR_ACTIVITY", JSON.stringify(activity));
  }

  /**
   * Resets all history, bookmarks and states, maintaining login session.
   */
  static resetAllData() {
    const historyKeys = Object.keys(localStorage).filter(k => 
      k.startsWith(this.KEYS.STATE) || 
      k === this.KEYS.BOOKMARKS || 
      k === this.KEYS.HISTORY ||
      k === "MRCP_NAVIGATOR_ACTIVITY"
    );
    historyKeys.forEach(k => localStorage.removeItem(k));
  }

  /**
   * Gets visual theme (dark or light).
   * @returns {string}
   */
  static getTheme() {
    const settings = localStorage.getItem(this.KEYS.SETTINGS);
    if (settings) {
      const parsed = JSON.parse(settings);
      if (parsed.theme) return parsed.theme;
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /**
   * Saves theme setting.
   * @param {string} theme 
   */
  static saveTheme(theme) {
    const settings = localStorage.getItem(this.KEYS.SETTINGS);
    const parsed = settings ? JSON.parse(settings) : {};
    parsed.theme = theme;
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(parsed));
  }
}
