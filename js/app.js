import { CONFIG } from '../config.js';
import { AuthService } from './auth.js';
import { DataService } from './data.js';
import { StorageService } from './storage.js';
import { QuizSession } from './quiz.js';
import { UIService } from './ui.js';
import { CloudSyncService } from './cloudSync.js';

let activeSession = null;

// Initialize app on DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

/**
 * Main application bootstrap
 */
async function initApp() {
  // Register start session callback for the quiz topics switcher bar
  UIService.onStartSession = startQuizSession;

  // Initialize and apply visual theme
  const theme = StorageService.getTheme();
  applyTheme(theme);

  // Initialize Cloud Sync status listener
  CloudSyncService.onStatusChange((status) => {
    UIService.updateCloudSyncStatus(status);
  });

  // Setup Cloud Sync modal triggers
  const openCloudSync = () => {
    const userEmail = AuthService.getAuthenticatedUser();
    UIService.openCloudSyncModal(
      userEmail,
      async (newConfig) => {
        return await CloudSyncService.setConfig(newConfig, StorageService);
      },
      () => {
        CloudSyncService.clearConfig();
        UIService.showToast('Switched to local profile mode', 'success');
      }
    );
  };

  const cloudSyncBtn = document.getElementById('cloud-sync-btn');
  if (cloudSyncBtn) cloudSyncBtn.addEventListener('click', openCloudSync);

  const sidebarSyncBtn = document.getElementById('sidebar-sync-btn');
  if (sidebarSyncBtn) sidebarSyncBtn.addEventListener('click', openCloudSync);

  // Auto-save active quiz session before tab close / refresh
  const handleUnloadSave = () => {
    if (activeSession) {
      activeSession.saveProgress();
    }
  };
  window.addEventListener('beforeunload', handleUnloadSave);
  window.addEventListener('pagehide', handleUnloadSave);

  // Connect callback so that if cloud pulls newer data on startup, dashboard redraws
  CloudSyncService.onRemoteUpdateCallback = () => {
    if (AuthService.isAuthenticated()) {
      showDashboard();
    }
  };

  // Check and initialize Cloud Sync if credentials exist
  const cloudConfig = CloudSyncService.getConfig(CONFIG.CLOUD_SYNC);
  if (cloudConfig) {
    CloudSyncService.init(cloudConfig, StorageService);
  }

  // Setup theme toggle listener
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      applyTheme(newTheme);
      StorageService.saveTheme(newTheme);
    });
  }

  // Setup password modal bindings
  const openPwdBtn = document.getElementById('open-password-btn');
  const closePwdBtn = document.getElementById('close-password-btn');
  const pwdModal = document.getElementById('password-modal');
  const pwdForm = document.getElementById('password-form');
  const pwdError = document.getElementById('pwd-error');

  if (openPwdBtn && closePwdBtn && pwdModal) {
    openPwdBtn.addEventListener('click', () => {
      pwdModal.classList.remove('hidden');
      pwdForm.reset();
      pwdError.classList.add('hidden');
    });

    closePwdBtn.addEventListener('click', () => {
      pwdModal.classList.add('hidden');
    });

    // Close when clicking overlay backdrop
    pwdModal.addEventListener('click', (e) => {
      if (e.target === pwdModal) {
        pwdModal.classList.add('hidden');
      }
    });
  }

  if (pwdForm) {
    pwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      pwdError.classList.add('hidden');

      const email = AuthService.getAuthenticatedUser();
      const currentPwd = document.getElementById('pwd-current').value;
      const newPwd = document.getElementById('pwd-new').value;
      const confirmPwd = document.getElementById('pwd-confirm').value;

      if (!email) {
        pwdError.textContent = "You must be logged in.";
        pwdError.classList.remove('hidden');
        return;
      }

      if (newPwd !== confirmPwd) {
        pwdError.textContent = "New passwords do not match.";
        pwdError.classList.remove('hidden');
        return;
      }

      const submitBtn = pwdForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Updating...";

      try {
        const result = await AuthService.changePassword(email, currentPwd, newPwd, CONFIG.USERS);
        if (result.success) {
          UIService.showToast(result.message, "success");
          pwdModal.classList.add('hidden');
          pwdForm.reset();
        } else {
          pwdError.textContent = result.message;
          pwdError.classList.remove('hidden');
        }
      } catch (err) {
        console.error(err);
        pwdError.textContent = "Failed to update password.";
        pwdError.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Update Password";
      }
    });
  }

  // Bind logout listener
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      AuthService.logout();
      UIService.showView(UIService.VIEWS.LOGIN);
      setupLoginListeners();
    });
  }

  // Bind global reset listener
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm("This will erase all progress, analytics, and bookmarks. This action CANNOT be undone. Proceed?")) {
        StorageService.resetAllData();
        UIService.showToast("All application data reset successfully.", "success");
        showDashboard();
      }
    });
  }

  // Bind tab links
  document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      if (tabId) {
        UIService.switchTab(tabId);
      }
    });
  });

  // Bind quiz topics selector horizontal scroll buttons
  const prevTopicsBtn = document.getElementById('quiz-topics-prev-btn');
  const nextTopicsBtn = document.getElementById('quiz-topics-next-btn');
  const topicsScrollWrapper = document.getElementById('quiz-topics-bar');
  if (prevTopicsBtn && nextTopicsBtn && topicsScrollWrapper) {
    prevTopicsBtn.addEventListener('click', () => {
      topicsScrollWrapper.scrollBy({ left: -240, behavior: 'smooth' });
    });
    nextTopicsBtn.addEventListener('click', () => {
      topicsScrollWrapper.scrollBy({ left: 240, behavior: 'smooth' });
    });
  }

  // Bind bookmarks search filter input
  const searchInput = document.getElementById('bookmarks-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      UIService.renderBookmarksTab(val);
    });
  }

  // Global keyboard shortcuts for live quiz focus view
  document.addEventListener('keydown', (e) => {
    // Only capture keys if a quiz session is active and quiz view is visible
    if (!activeSession) return;
    const quizView = document.getElementById('quiz-view');
    if (!quizView || quizView.classList.contains('hidden')) return;

    // Ignore keypresses inside input/textarea elements
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    const key = e.key.toLowerCase();
    const alphabet = ['a', 'b', 'c', 'd', 'e'];

    // 1. Select options A-E or 1-5 keys
    if (alphabet.includes(key)) {
      const idx = key.charCodeAt(0) - 97;
      const options = document.querySelectorAll('.quiz-option-item');
      if (options[idx] && !options[idx].classList.contains('disabled')) {
        options[idx].click();
      }
    } else if (['1', '2', '3', '4', '5'].includes(key)) {
      const idx = parseInt(key, 10) - 1;
      const options = document.querySelectorAll('.quiz-option-item');
      if (options[idx] && !options[idx].classList.contains('disabled')) {
        options[idx].click();
      }
    }
    // 2. Submit or Next with Enter key
    else if (e.key === 'Enter') {
      e.preventDefault();
      const submitBtn = document.getElementById('quiz-submit-btn');
      const nextBtn = document.getElementById('quiz-next-btn');
      
      if (activeSession.mode === 'study') {
        if (!activeSession.isSubmitted) {
          if (submitBtn && !submitBtn.disabled) {
            submitBtn.click();
          }
        } else {
          if (nextBtn && !nextBtn.classList.contains('hidden') && !nextBtn.disabled) {
            nextBtn.click();
          }
        }
      } else {
        // Exam mode
        if (nextBtn && !nextBtn.disabled) {
          nextBtn.click();
        }
      }
    }
    // 3. Toggle flag/bookmark with F or B keys
    else if (key === 'f' || key === 'b') {
      e.preventDefault();
      const bookmarkBtn = document.getElementById('quiz-bookmark-btn');
      if (bookmarkBtn) {
        bookmarkBtn.click();
      }
    }
    // 4. Quit/Exit with Escape
    else if (e.key === 'Escape') {
      e.preventDefault();
      const finishBtn = document.getElementById('quiz-finish-btn');
      if (finishBtn) {
        finishBtn.click();
      }
    }
  });

  // Handle Authentication Gate
  if (AuthService.isAuthenticated()) {
    showDashboard();
  } else {
    UIService.showView(UIService.VIEWS.LOGIN);
    setupLoginListeners();
  }
}

/**
 * Changes UI theme class on the document root
 * @param {string} theme 'dark' | 'light'
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    if (theme === 'light') {
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      `;
    } else {
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m0 13.5V21m8.947-8.947h-2.25M5.105 12h-2.25m16.505-6.364-1.591 1.591M6.776 17.224l-1.591 1.591m12.828 0-1.591-1.591M6.776 6.776 5.185 5.185m12.802 12.802a9 9 0 1 1-12.802-12.802Z" />
        </svg>
      `;
    }
  }
}

/**
 * Binds events for the login page elements
 */
function setupLoginListeners() {
  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const errorBanner = document.getElementById('login-error');

  // Clear states
  errorBanner.classList.add('hidden');
  emailInput.value = '';
  if (passwordInput) passwordInput.value = '';

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput ? passwordInput.value : '';
    
    if (!email || !password) return;

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerHTML = '<span class="spinner"></span> Logging in...';
    errorBanner.classList.add('hidden');

    try {
      const success = await AuthService.login(email, password, CONFIG.USERS);
      if (success) {
        UIService.showToast("Logged in successfully!", "success");
        StorageService.migrateLegacyDataIfNeeded();
        const cfg = CloudSyncService.getConfig(CONFIG.CLOUD_SYNC);
        if (cfg) {
          await CloudSyncService.init(cfg, StorageService);
        }
        showDashboard();
      } else {
        errorBanner.textContent = "Access denied. Invalid email or password.";
        errorBanner.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      errorBanner.textContent = "An error occurred during authentication. Please try again.";
      errorBanner.classList.remove('hidden');
    } finally {
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.innerHTML = 'Login';
    }
  };

  form.onsubmit = handleLogin;
}

/**
 * Loads metadata index and draws the dashboard
 */
async function showDashboard() {
  StorageService.migrateLegacyDataIfNeeded();

  // Update header metadata info
  const userEmailEl = document.getElementById('sidebar-user-email');
  if (userEmailEl) {
    userEmailEl.textContent = AuthService.getAuthenticatedUser() || '';
  }

  UIService.showView(UIService.VIEWS.DASHBOARD);
  
  const loadingGrid = document.getElementById('subject-grid');
  loadingGrid.innerHTML = '<div class="loader-container"><div class="spinner"></div><p class="muted">Loading question subjects...</p></div>';

  try {
    const meta = await DataService.loadMetadata();
    const analytics = StorageService.getAnalytics();
    const bookmarks = StorageService.getBookmarks();

    UIService.renderDashboard(
      meta,
      analytics,
      bookmarks,
      startQuizSession,
      clearSubjectProgress
    );
  } catch (e) {
    console.error(e);
    loadingGrid.innerHTML = '<p class="callout incorrect">Failed to load subjects. Check console or reload.</p>';
  }
}

/**
 * Callback to purge saved progress of a subject
 * @param {string} subject 
 */
function clearSubjectProgress(subject) {
  StorageService.clearSubjectState(subject);
  UIService.showToast(`Saved progress for ${subject} cleared.`, "success");
  showDashboard();
}

/**
 * Launches a quiz session, loading from JSON files
 * @param {string} subject 
 * @param {string} mode 
 * @param {number} startIdx 
 * @param {boolean} resume 
 */
async function startQuizSession(subject, mode, startIdx, resume = false) {
  try {
    UIService.showToast(`Loading ${subject} questions...`, "success");
    const questions = await DataService.loadSubject(subject);
    
    // Create new session instance
    activeSession = new QuizSession(subject, questions, mode);

    if (resume) {
      const savedState = StorageService.getSubjectState(subject);
      if (savedState) {
        activeSession.loadState(savedState);
      }
    } else {
      // Offset 1-based index to 0-based
      activeSession.currentIndex = Math.max(0, Math.min(startIdx - 1, questions.length - 1));
      activeSession.saveProgress();
    }

    UIService.showView(UIService.VIEWS.QUIZ);
    setupQuizListeners();
    renderQuizStep();
    
    // Start timer ticking
    const timerDisplay = document.getElementById('quiz-timer');
    activeSession.startTimer((timeStr) => {
      timerDisplay.textContent = timeStr;
    });

  } catch (err) {
    console.error(err);
    UIService.showToast("Failed to start session. Check logs.", "error");
  }
}

/**
 * Binds quiz action buttons (bookmark, submit, next, finish early)
 */
function setupQuizListeners() {
  const bookmarkBtn = document.getElementById('quiz-bookmark-btn');
  const submitBtn = document.getElementById('quiz-submit-btn');
  const nextBtn = document.getElementById('quiz-next-btn');
  const finishBtn = document.getElementById('quiz-finish-btn');

  // Bookmark Toggle
  bookmarkBtn.onclick = () => {
    if (!activeSession) return;
    const added = StorageService.toggleBookmark(activeSession.subject, activeSession.currentIndex);
    UIService.showToast(
      added ? "Question flagged/bookmarked!" : "Flag removed.", 
      "success"
    );
    renderQuizStep(); // Redraw bookmark button state
  };

  // Submit Answer (Study Mode only)
  submitBtn.onclick = () => {
    if (!activeSession || activeSession.selectedOptionIndex === null || activeSession.isSubmitted) return;
    activeSession.submitAnswer();
    renderQuizStep();
  };

  // Next Question
  nextBtn.onclick = () => {
    if (!activeSession) return;
    
    if (activeSession.mode === 'exam') {
      // In Exam Mode, clicking Next submits and advances
      activeSession.submitAnswer();
    }

    const hasNext = activeSession.nextQuestion();
    if (hasNext) {
      renderQuizStep();
    } else {
      finishQuizSession();
    }
  };

  // Finish early
  finishBtn.onclick = () => {
    if (confirm("Are you sure you want to finish this session? Answers for unsubmitted questions will not count.")) {
      finishQuizSession();
    }
  };
}

/**
 * Redraws the quiz view elements based on activeSession status
 */
function renderQuizStep() {
  if (!activeSession) return;
  UIService.renderQuestion(activeSession, (selectedIdx) => {
    activeSession.selectOption(selectedIdx);
    
    // Enable/disable buttons depending on state
    if (activeSession.mode === 'study') {
      document.getElementById('quiz-submit-btn').disabled = false;
    } else {
      // Exam Mode
      document.getElementById('quiz-next-btn').disabled = false;
    }
  });
}

/**
 * Wraps up the quiz session, saves results to history, and transitions to Summary
 */
function finishQuizSession() {
  if (!activeSession) return;

  activeSession.finishSession();
  UIService.showView(UIService.VIEWS.SUMMARY);
  
  UIService.renderSummary(
    activeSession,
    // Restart Session Callback
    () => {
      startQuizSession(activeSession.subject, activeSession.mode, 1, false);
    },
    // Back to Dashboard Callback
    () => {
      activeSession = null;
      showDashboard();
    }
  );
}
