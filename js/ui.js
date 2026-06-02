import { StorageService } from './storage.js';
import { DataService } from './data.js';

/**
 * UIService - Manages view transitions, tabs routing, dynamic rendering, and popup dialogs.
 */
export class UIService {
  // View states
  static VIEWS = {
    LOGIN: 'login-view',
    DASHBOARD: 'dashboard-view', // Represents the main shell container
    QUIZ: 'quiz-view',
    SUMMARY: 'summary-view'
  };

  /**
   * Helper to turn subject names into safe CSS selector IDs.
   */
  static getSafeId(name) {
    return name.replace(/[^a-zA-Z0-9]/g, '-');
  }

  /**
   * Switches active view shells (gating sidebars/navigation bars).
   * @param {string} viewId 
   */
  static showView(viewId) {
    // Determine nav bar visibility (hidden in Login and Live Quiz focus modes)
    const sidebar = document.getElementById('app-sidebar');
    const mobileNav = document.getElementById('mobile-nav');
    const globalHeader = document.getElementById('global-header');
    const mainContent = document.getElementById('app-main-content');

    if (viewId === this.VIEWS.LOGIN || viewId === this.VIEWS.QUIZ) {
      sidebar?.classList.add('hidden');
      mobileNav?.classList.add('hidden');
      globalHeader?.classList.add('hidden');
      mainContent?.classList.add('full-width-centered');
    } else {
      sidebar?.classList.remove('hidden');
      mobileNav?.classList.remove('hidden');
      globalHeader?.classList.remove('hidden');
      mainContent?.classList.remove('full-width-centered');
    }

    // Toggle views
    Object.values(this.VIEWS).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === viewId) {
          el.classList.remove('hidden');
          el.classList.add('enter');
        } else {
          el.classList.add('hidden');
          el.classList.remove('enter');
        }
      }
    });

    // If switching back to dashboard shell, reset active tab state. Otherwise, hide all tabs.
    if (viewId === this.VIEWS.DASHBOARD) {
      const activeLink = document.querySelector('.nav-item.active, .mobile-nav-item.active');
      const targetTab = activeLink ? activeLink.getAttribute('data-tab') : 'dashboard-view';
      this.switchTab(targetTab);
    } else {
      document.querySelectorAll('.tab-sheet').forEach(sheet => {
        sheet.classList.add('hidden');
        sheet.classList.remove('enter');
      });
      // Explicitly hide all other tab sections by ID to prevent any DOM/CSS overlap bugs
      document.getElementById('subjects-view')?.classList.add('hidden');
      document.getElementById('bookmarks-view')?.classList.add('hidden');
      document.getElementById('analytics-view')?.classList.add('hidden');
      document.getElementById('dashboard-view')?.classList.add('hidden');
    }
  }

  /**
   * Switches tabs inside the main dashboard shell navigation
   * @param {string} tabId Target tab ID
   */
  static switchTab(tabId) {
    // 1. Hide all tab sheets
    document.querySelectorAll('.tab-sheet').forEach(sheet => {
      sheet.classList.add('hidden');
    });

    // 2. Show active tab sheet
    const activeSheet = document.getElementById(tabId);
    if (activeSheet) {
      activeSheet.classList.remove('hidden');
      activeSheet.classList.add('enter');
    }

    // 3. Highlight navigation links
    document.querySelectorAll('.nav-item, .mobile-nav-item').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 4. Trigger tab-specific renders
    if (tabId === 'bookmarks-view') {
      this.renderBookmarksTab();
    } else if (tabId === 'analytics-view') {
      this.renderAnalyticsTab();
    } else if (tabId === 'dashboard-view') {
      this.refreshDashboardStats();
    }
  }

  /**
   * Refreshes stats values on the Home Dashboard tab.
   */
  static refreshDashboardStats() {
    const analytics = StorageService.getAnalytics();
    const bookmarks = StorageService.getBookmarks();

    document.getElementById('stats-answered').textContent = analytics.totalAnswered;
    
    const accuracy = analytics.totalAnswered > 0 
      ? Math.round((analytics.totalCorrect / analytics.totalAnswered) * 100) 
      : 0;
    document.getElementById('stats-accuracy').textContent = `${accuracy}%`;

    let totalBookmarksCount = 0;
    Object.values(bookmarks).forEach(arr => totalBookmarksCount += arr.length);
    document.getElementById('stats-flagged').textContent = totalBookmarksCount;

    // Render Weak Areas
    const weakListEl = document.getElementById('weak-subjects-list');
    weakListEl.innerHTML = '';
    if (analytics.weakSubjects.length > 0) {
      analytics.weakSubjects.slice(0, 3).forEach(sub => {
        const item = document.createElement('span');
        item.className = 'weak-badge';
        item.textContent = sub;
        weakListEl.appendChild(item);
      });
    } else {
      const emptyMsg = document.createElement('span');
      emptyMsg.className = 'muted text-sm';
      emptyMsg.textContent = 'No weak subjects detected. Practice more questions!';
      weakListEl.appendChild(emptyMsg);
    }

    // Refresh Daily Goals & Streak
    const activity = StorageService.getActivity();
    
    // 1. Streak count text
    const streakBadge = document.getElementById('streak-count-val');
    if (streakBadge) {
      streakBadge.textContent = `${activity.streak} Day Streak 🔥`;
      if (activity.streak > 0) {
        streakBadge.classList.add('active-streak');
      } else {
        streakBadge.classList.remove('active-streak');
      }
    }

    // 2. Goal progress text
    const goalCountText = document.getElementById('goal-count-text');
    if (goalCountText) {
      goalCountText.textContent = `${activity.dailyPracticed}/${activity.dailyTarget}`;
    }

    // 3. Goal progress ring SVG stroke fill
    const goalFillCircle = document.getElementById('goal-ring-fill');
    if (goalFillCircle) {
      const radius = 34;
      const circumference = 2 * Math.PI * radius; // ~213.63
      const goalPercent = Math.min(100, (activity.dailyPracticed / activity.dailyTarget) * 100);
      const strokeDashoffset = circumference - (goalPercent / 100) * circumference;
      
      goalFillCircle.style.strokeDasharray = circumference;
      goalFillCircle.style.strokeDashoffset = strokeDashoffset;
    }

    // 4. Goal progress details status text
    const goalStatusText = document.getElementById('goal-status-text');
    if (goalStatusText) {
      if (activity.dailyPracticed >= activity.dailyTarget) {
        goalStatusText.innerHTML = `✨ <strong>Goal achieved!</strong> Excellent work today, doctor!`;
      } else {
        const remaining = activity.dailyTarget - activity.dailyPracticed;
        goalStatusText.textContent = `Complete ${remaining} more questions to achieve today's goal.`;
      }
    }
  }

  /**
   * Draws the Subject Grid on Subjects Tab
   */
  static renderDashboard(subjectsMetadata, analytics, bookmarks, onStartSession, onClearProgress) {
    // Sync home counts
    this.refreshDashboardStats();

    // Injects cards
    const grid = document.getElementById('subject-grid');
    grid.innerHTML = '';

    Object.entries(subjectsMetadata).forEach(([name, info]) => {
      const card = document.createElement('div');
      const subClass = this.getSubjectClass(name);
      card.className = `glass subject-card ${subClass}`;

      const hasSaved = StorageService.hasSavedState(name);
      const savedState = hasSaved ? StorageService.getSubjectState(name) : null;
      
      let statusBadge = `<span class="badge-status not-started">○ Not Started</span>`;
      let progressPercent = 0;
      let progressText = 'Not started';
      if (savedState) {
        progressPercent = Math.round((savedState.currentIndex / savedState.total) * 100);
        progressText = `Question ${savedState.currentIndex + 1} of ${savedState.total}`;
        if (savedState.currentIndex + 1 >= savedState.total) {
          statusBadge = `<span class="badge-status completed">✓ Completed</span>`;
        } else {
          statusBadge = `<span class="badge-status in-progress">⚡ In Progress</span>`;
        }
      }

      const humanName = this.formatSubjectName(name);
      const iconMarkup = this.getSubjectIcon(name);

      card.innerHTML = `
        ${iconMarkup}
        <div class="card-header">
          <div class="header-left-wrap">
            <h3 class="subject-title">${humanName}</h3>
            <div class="badges-row mt-1">
              <span class="subject-count">${info.count} Qs</span>
              ${statusBadge}
            </div>
          </div>
        </div>
        
        <div class="progress-container ${hasSaved ? '' : 'hidden'}">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
          </div>
          <div class="progress-labels text-xs">
            <span>${progressText}</span>
            <span>${progressPercent}%</span>
          </div>
        </div>

        <div class="card-actions">
          ${hasSaved ? `
            <button class="btn btn-primary btn-sm resume-btn">Resume</button>
            <button class="btn btn-ghost btn-sm clear-btn">Clear</button>
          ` : `
            <button class="btn btn-primary btn-sm practice-launch-btn">Practice fresh &rarr;</button>
          `}
        </div>
      `;

      // Event registrations
      if (hasSaved) {
        card.querySelector('.resume-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          onStartSession(name, savedState.mode, savedState.currentIndex + 1, true);
        });
        card.querySelector('.clear-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Are you sure you want to clear your saved progress for ${name}?`)) {
            onClearProgress(name);
          }
        });
        
        // Clicking card body allows fresh configuration launcher
        card.addEventListener('click', (e) => {
          if (!e.target.classList.contains('btn')) {
            this.openSetupModal(name, info.count, onStartSession);
          }
        });
      } else {
        card.addEventListener('click', () => {
          this.openSetupModal(name, info.count, onStartSession);
        });
      }

      grid.appendChild(card);
    });

    // Quick Practice button in Dashboard home
    const quickBtn = document.getElementById('quick-practice-btn');
    if (quickBtn) {
      quickBtn.onclick = () => {
        // Start with the first subject or weak area if any
        const subjects = Object.keys(subjectsMetadata);
        if (subjects.length > 0) {
          const target = analytics.weakSubjects[0] || subjects[0];
          this.openSetupModal(target, subjectsMetadata[target].count, onStartSession);
        }
      };
    }
  }

  /**
   * Opens the practice configuration settings dialog modal
   */
  static openSetupModal(subjectName, maxCount, onStartSession) {
    const modal = document.getElementById('setup-modal');
    const title = document.getElementById('setup-subject-title');
    const idxInput = document.getElementById('setup-start-index');
    const launchBtn = document.getElementById('launch-session-btn');
    const closeBtn = document.getElementById('close-setup-btn');

    title.textContent = `Practice Setup: ${subjectName}`;
    idxInput.max = maxCount;
    idxInput.value = 1;
    
    modal.classList.remove('hidden');

    const closeModal = () => {
      modal.classList.add('hidden');
    };

    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };

    launchBtn.onclick = () => {
      const mode = modal.querySelector('input[name="setup-quiz-mode"]:checked').value;
      const startIdx = parseInt(idxInput.value, 10) || 1;
      closeModal();
      onStartSession(subjectName, mode, startIdx, false);
    };
  }

  /**
   * Dynamically loads flagged bookmarks and renders details with filtering
   */
  static async renderBookmarksTab(searchQuery = '') {
    const bookmarks = StorageService.getBookmarks();
    const emptyState = document.getElementById('bookmarks-empty-state');
    const listEl = document.getElementById('bookmarks-list');
    const controls = document.getElementById('bookmarks-controls-panel');

    listEl.innerHTML = '';
    
    const subjectEntries = Object.entries(bookmarks);
    let totalBookmarks = 0;
    subjectEntries.forEach(([_, arr]) => totalBookmarks += arr.length);

    if (totalBookmarks === 0) {
      emptyState.classList.remove('hidden');
      controls.classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    controls.classList.remove('hidden');

    listEl.innerHTML = `
      <div class="loader-container">
        <div class="spinner"></div>
        <p class="muted">Loading bookmarked questions details...</p>
      </div>
    `;

    try {
      const fragment = document.createDocumentFragment();
      let matchedCount = 0;
      
      for (const [subject, qIndexes] of subjectEntries) {
        const questions = await DataService.loadSubject(subject);
        
        qIndexes.forEach(qIndex => {
          const q = questions[qIndex];
          if (!q) return;

          // Client-side query search
          if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const qText = (q.question || '').toLowerCase();
            const qExpl = (q.explanation || '').toLowerCase();
            const qOptions = (q.options || []).join(' ').toLowerCase();
            
            if (!qText.includes(query) && !qExpl.includes(query) && !qOptions.includes(query)) {
              return;
            }
          }

          matchedCount++;

          const item = document.createElement('div');
          item.className = 'glass review-item active'; // Default active layout
          
          item.innerHTML = `
            <div class="review-item-header" style="cursor: default;">
              <div class="review-header-title">
                <span class="review-item-number">${subject} — Question #${qIndex + 1}</span>
              </div>
              <button class="btn btn-ghost btn-sm remove-bookmark-btn" data-subject="${subject}" data-index="${qIndex}">Remove</button>
            </div>
            
            <div class="review-item-body">
              <div class="review-item-question">${this.sanitizeHtml(q.question)}</div>
              
              <div class="review-explanation text-sm">
                <strong>Options:</strong>
                <ul class="text-xs muted mt-1 pl-4" style="list-style-type: upper-alpha; display: flex; flex-direction: column; gap: 4px;">
                  ${q.options.map(o => `<li>${this.sanitizeHtml(o)}</li>`).join('')}
                </ul>
                <strong class="mt-4 block">Correct Answer:</strong>
                <span class="text-xs font-semibold" style="color: var(--ok-text);">${this.sanitizeHtml(q.correctText || q.options[q.correctIndex])}</span>
                ${q.explanation ? `<strong class="mt-4 block">Explanation:</strong><p class="text-xs muted mt-1">${this.sanitizeHtml(q.explanation)}</p>` : ''}
              </div>
            </div>
          `;

          // Handle bookmark removal click
          item.querySelector('.remove-bookmark-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            StorageService.toggleBookmark(subject, qIndex);
            this.showToast("Bookmark removed.", "success");
            this.renderBookmarksTab(searchQuery); // Re-render tab list
            
            // Sync counts immediately
            this.refreshDashboardStats();
          });

          fragment.appendChild(item);
        });
      }
      
      listEl.innerHTML = '';
      if (matchedCount === 0) {
        listEl.innerHTML = `<div class="empty-state text-center py-6"><p class="muted text-sm">No bookmarks match the query "${searchQuery}"</p></div>`;
      } else {
        listEl.appendChild(fragment);
      }
    } catch (e) {
      console.error(e);
      listEl.innerHTML = '<p class="callout incorrect">An error occurred loading bookmark files.</p>';
    }
  }

  /**
   * Renders the Analytics Tab
   */
  static renderAnalyticsTab() {
    const analytics = StorageService.getAnalytics();
    const historyList = document.getElementById('analytics-history-list');
    const subjectList = document.getElementById('analytics-subject-list');

    historyList.innerHTML = '';
    subjectList.innerHTML = '';

    // Draw Dynamic SVG Performance Chart
    this.drawAnalyticsChart();

    // 1. Render Subject Progress Bars
    if (Object.keys(analytics.subjectBreakdown).length === 0) {
      subjectList.innerHTML = '<p class="muted text-sm text-center py-6">Complete quiz sessions to generate analytics charts.</p>';
    } else {
      Object.entries(analytics.subjectBreakdown).forEach(([subject, data]) => {
        const accuracy = data.answered > 0 ? Math.round((data.correct / data.answered) * 100) : 0;
        
        const item = document.createElement('div');
        item.className = 'analytic-subject-item';
        item.innerHTML = `
          <div class="analytic-labels">
            <span>${subject}</span>
            <span>${accuracy}% (${data.correct}/${data.answered})</span>
          </div>
          <div class="analytic-bar-bg">
            <div class="analytic-bar-fill" style="width: ${accuracy}%"></div>
          </div>
        `;
        subjectList.appendChild(item);
      });
    }

    // 2. Render Practice History Logs Table
    const history = StorageService.getHistory();
    if (history.length === 0) {
      historyList.innerHTML = '<tr><td colspan="4" class="text-center muted text-xs py-6">No historical practice logs found.</td></tr>';
    } else {
      history.slice().reverse().forEach(session => {
        const accuracy = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0;
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td><strong>${session.subject}</strong></td>
          <td>${session.score} / ${session.total}</td>
          <td><span class="font-semibold" style="color: ${accuracy >= 70 ? 'var(--ok-text)' : 'var(--muted)'};">${accuracy}%</span></td>
          <td><span class="badge-mode ${session.mode}">${session.mode}</span></td>
        `;
        historyList.appendChild(row);
      });
    }
  }

  /**
   * Draws a beautiful dynamic SVG Line Chart for the candidate's last 10 quizzes
   */
  static drawAnalyticsChart() {
    const container = document.getElementById('analytics-chart-container');
    if (!container) return;
    
    const history = StorageService.getHistory();
    if (history.length === 0) {
      container.innerHTML = `
        <div class="flex-center flex-col" style="height: 100%; gap: 10px;">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width: 32px; height: 32px; opacity: 0.5;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="muted text-sm">No practice sessions logged yet. Complete a quiz to view your trend chart.</span>
        </div>
      `;
      return;
    }

    const lastTen = history.slice(-10);
    const dataPoints = lastTen.map(s => {
      return {
        subject: s.subject.length > 20 ? s.subject.substring(0, 17) + '...' : s.subject,
        accuracy: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0
      };
    });

    const width = container.clientWidth || 700;
    const height = 220;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Grid marks (0%, 25%, 50%, 75%, 100%)
    let gridLinesHtml = '';
    const yTicks = [0, 25, 50, 75, 100];
    yTicks.forEach(tick => {
      const y = paddingTop + chartHeight - (tick / 100) * chartHeight;
      gridLinesHtml += `
        <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--glass-border)" stroke-dasharray="4 4" stroke-width="1" />
        <text x="${paddingLeft - 10}" y="${y + 4}" fill="var(--muted)" font-size="10" font-family="sans-serif" text-anchor="end">${tick}%</text>
      `;
    });

    // Node locations
    const stepX = dataPoints.length > 1 ? chartWidth / (dataPoints.length - 1) : chartWidth;
    let points = [];
    dataPoints.forEach((p, idx) => {
      const x = paddingLeft + idx * stepX;
      const y = paddingTop + chartHeight - (p.accuracy / 100) * chartHeight;
      points.push({ x, y, val: p.accuracy, sub: p.subject, idx: idx + 1 });
    });

    let linePath = '';
    let areaPath = '';
    
    if (points.length > 0) {
      if (points.length === 1) {
        linePath = `M ${points[0].x - 15} ${points[0].y} L ${points[0].x + 15} ${points[0].y}`;
      } else {
        linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        areaPath = `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`;
      }
    }

    let interactiveElementsHtml = '';
    points.forEach((p) => {
      interactiveElementsHtml += `
        <g class="chart-point-group">
          <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--brand-color)" stroke="#fff" stroke-width="1.5" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); transition: r 0.2s;" />
          <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent" style="cursor: pointer;">
            <title>${p.sub}\nAccuracy: ${p.val}%\nQuiz Session #${p.idx}</title>
          </circle>
          <text x="${p.x}" y="${paddingTop + chartHeight + 18}" fill="var(--muted)" font-size="9" font-family="sans-serif" text-anchor="middle">Q#${p.idx}</text>
        </g>
      `;
    });

    container.innerHTML = `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow: visible;">
        <defs>
          <linearGradient id="area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="var(--brand-color)" stop-opacity="0.3" />
            <stop offset="100%" stop-color="var(--brand-color)" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        
        <!-- Y-Axis Grids -->
        ${gridLinesHtml}
        
        <!-- Underline Gradient Shadow -->
        ${areaPath ? `<path d="${areaPath}" fill="url(#area-gradient)" />` : ''}
        
        <!-- Main Line -->
        ${linePath ? `<path d="${linePath}" fill="none" stroke="var(--brand-color)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />` : ''}
        
        <!-- Dots and labels -->
        ${interactiveElementsHtml}
      </svg>
    `;
  }

  /**
   * Translates subject titles into class styling tags
   * @param {string} name 
   * @returns {string}
   */
  static getSubjectClass(name) {
    const mapping = {
      'Cardiology': 'sub-cardiology',
      'Clinical Haematology and Oncology': 'sub-haematology-oncology',
      'Clinical Pharmacology and Toxicology': 'sub-pharmacology-toxicology',
      'Clininal_Science': 'sub-clinical-science',
      'Dermatology': 'sub-dermatology',
      'Endocrinology': 'sub-endocrinology',
      'Gastroenterology': 'sub-gastroenterology',
      'Geriatric': 'sub-geriatric',
      'Infectious_Disease': 'sub-infectious-disease',
      'Nephrology': 'sub-nephrology',
      'Neurology': 'sub-neurology',
      'Opthalmology': 'sub-opthalmology',
      'Psychiatry': 'sub-psychiatry',
      'Respiratory medicine': 'sub-respiratory',
      'Rheumatology': 'sub-rheumatology'
    };
    return mapping[name] || '';
  }

  /**
   * Cleans up underscores, typos, and casings in database subject names.
   * @param {string} name 
   * @returns {string}
   */
  static formatSubjectName(name) {
    if (!name) return '';
    return name
      .replace(/_/g, ' ')
      .replace('Clininal', 'Clinical')
      .replace('medicine', 'Medicine')
      .replace('Opthalmology', 'Ophthalmology')
      .replace('Infectious Disease', 'Infectious Diseases');
  }

  /**
   * Returns custom medical themed SVG vector string based on subject name
   * @param {string} name 
   * @returns {string}
   */
  static getSubjectIcon(name) {
    const icons = {
      'Cardiology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" /></svg>`,
      
      'Clinical Haematology and Oncology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v5.25H6a.75.75 0 0 0 0 1.5h6v5.25a.75.75 0 0 0 1.5 0v-5.25h5.25a.75.75 0 0 0 0-1.5h-5.25V6Z" /></svg>`,
      
      'Clinical Pharmacology and Toxicology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.625a2.25 2.25 0 01-2.247 2.125H6.622a2.25 2.25 0 01-2.247-2.125L3.75 7.5m16.5 0c.266 0 .524-.106.717-.294A1.002 1.002 0 0021 6.5c0-.621-.504-1.125-1.125-1.125H4.125C3.504 5.375 3 5.879 3 6.5c0 .27.108.53.298.706.193.188.45.294.717.294m16.5 0h-16.5" /></svg>`,
      
      'Clininal_Science': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 3.104v1.242c0 .289.139.56.375.725l5.5 3.85a.89.89 0 01.375.725v4.71m-6.625-11.25c.343 0 .677.067 1 .2l3 1.2a2.25 2.25 0 011.25 2v1.51M12 21a9 9 0 110-18 9 9 0 010 18Z" /></svg>`,
      
      'Dermatology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l5.105-.813M18.225 10.775a9.75 9.75 0 11-12.45 0l1.242 7.242a2.25 2.25 0 002.239 1.933h5.488a2.25 2.25 0 002.239-1.933l1.242-7.242Z" /></svg>`,
      
      'Endocrinology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>`,
      
      'Gastroenterology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>`,
      
      'Geriatric': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0Z" /></svg>`,
      
      'Infectious_Disease': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 21l5.105-.813M18.225 10.775a9.75 9.75 0 11-12.45 0l1.242 7.242a2.25 2.25 0 002.239 1.933h5.488a2.25 2.25 0 002.239-1.933l1.242-7.242Z" /></svg>`,
      
      'Nephrology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v18M3 12h18M12 3a9 9 0 019 9M12 21a9 9 0 01-9-9" /></svg>`,
      
      'Neurology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0Z" /></svg>`,
      
      'Opthalmology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" /></svg>`,
      
      'Psychiatry': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0Zm0 0h-.375M12 17.25a.75.75 0 0 0 .75-.75.75.75 0 0 0-.75-.75.75.75 0 0 0-.75.75.75.75 0 0 0 .75.75Z" /><path stroke-linecap="round" stroke-linejoin="round" d="M22.5 12c0 5.3-4.3 9.6-9.6 9.6a9.8 9.8 0 0 1-5-1.4l-4.5 1.5 1.5-4.5A9.6 9.6 0 0 1 3 12c0-5.3 4.3-9.6 9.6-9.6s9.6 4.3 9.6 9.6Z" /></svg>`,
      
      'Respiratory medicine': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 15v.228a3 3 0 00.18 1.03l.318.954a1.5 1.5 0 001.422 1.026H13.8a1.5 1.5 0 001.422-1.026l.318-.954a3 3 0 00.18-1.03V15m-7.5 0h7.5m-7.5 0h-1.5A2.25 2.25 0 014.5 12.75v-1.5A2.25 2.25 0 016.75 9h1.5m7.5 6h1.5a2.25 2.25 0 002.25-2.25v-1.5A2.25 2.25 0 0017.25 9h-1.5M3 18.75h18" /></svg>`,
      
      'Rheumatology': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l4.5-4.5a4.5 4.5 0 011.243-.88m6.364-6.364a4.5 4.5 0 016.364 6.364l-4.5 4.5a4.5 4.5 0 01-1.24 1.24" /></svg>`
    };
    return icons[name] || `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="card-icon"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>`;
  }

  /**
   * Renders the current active question
   */
  static renderQuestion(session, onOptionSelect) {
    const question = session.getCurrentQuestion();
    const isBookmarked = StorageService.isBookmarked(session.subject, session.currentIndex);

    // Header badge values
    document.getElementById('quiz-subject-badge').textContent = session.subject;
    document.getElementById('quiz-progress-text').textContent = `Question ${session.currentIndex + 1} of ${session.total}`;
    
    // Render Horizontal Topics Bar
    const topicsBar = document.getElementById('quiz-topics-bar');
    if (topicsBar) {
      topicsBar.innerHTML = '';
      const subjectsMetadata = DataService.metadata || {};
      
      Object.entries(subjectsMetadata).forEach(([name, info]) => {
        const pill = document.createElement('button');
        const hasSaved = StorageService.hasSavedState(name);
        const isActive = session.subject === name;
        
        pill.className = 'quiz-topic-pill';
        if (isActive) pill.classList.add('active');
        else if (hasSaved) pill.classList.add('in-progress');
        
        const humanName = this.formatSubjectName(name);
        pill.textContent = humanName;
        
        pill.onclick = () => {
          if (isActive) return;
          if (confirm(`Switch to practicing ${humanName}? Current session progress is saved automatically.`)) {
            // Save current progress before switching
            if (session) {
              session.saveProgress();
              session.stopTimer();
            }
            // Start or resume target subject
            if (UIService.onStartSession) {
              const targetSaved = StorageService.hasSavedState(name);
              if (targetSaved) {
                const targetState = StorageService.getSubjectState(name);
                UIService.onStartSession(name, targetState.mode, targetState.currentIndex + 1, true);
              } else {
                UIService.openSetupModal(name, info.count, UIService.onStartSession);
              }
            }
          }
        };
        
        topicsBar.appendChild(pill);
      });
      
      // Auto-scroll the active pill into view
      setTimeout(() => {
        const activePill = topicsBar.querySelector('.quiz-topic-pill.active');
        if (activePill) {
          activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, 50);
    }

    // Flag details
    const bookmarkBtn = document.getElementById('quiz-bookmark-btn');
    bookmarkBtn.title = "Flag/Bookmark Question [F]";
    if (isBookmarked) {
      bookmarkBtn.classList.add('active');
      bookmarkBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
          <path fill-rule="evenodd" d="M6.32 2.577a4.922 4.922 0 0 0-.113 1.954V19a.75.75 0 0 0 1.23.578l5.3-4.417 5.3 4.417a.75.75 0 0 0 1.23-.578V4.53a4.922 4.922 0 0 0-.113-1.954C17.306 2.117 15.69 2 13.5 2h-3c-2.19 0-3.805.117-4.86 1.488Z" clip-rule="evenodd" />
        </svg>
      `;
    } else {
      bookmarkBtn.classList.remove('active');
      bookmarkBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
        </svg>
      `;
    }

    // Injects question texts
    document.getElementById('quiz-qtext').innerHTML = this.sanitizeHtml(question.question);

    // Injects Option Cards
    const optionsList = document.getElementById('quiz-options-list');
    optionsList.innerHTML = '';

    const alphabet = ['A', 'B', 'C', 'D', 'E'];
    question.options.forEach((opt, idx) => {
      const optionEl = document.createElement('div');
      optionEl.className = 'quiz-option-item';
      
      const isSelected = session.selectedOptionIndex === idx;
      
      let modifierClass = '';
      let badgeMarkup = '';
      if (session.isSubmitted && session.mode === 'study') {
        const correctIdx = question.correctIndex;
        if (idx === correctIdx) {
          modifierClass = 'correct';
          badgeMarkup = '<span class="status-marker correct">✓</span>';
        } else if (isSelected) {
          modifierClass = 'incorrect';
          badgeMarkup = '<span class="status-marker incorrect">✗</span>';
        }
        optionEl.classList.add('disabled');
      } else if (isSelected) {
        modifierClass = 'selected';
      }

      if (modifierClass) {
        optionEl.classList.add(modifierClass);
      }

      optionEl.innerHTML = `
        <span class="option-letter">${alphabet[idx]}</span>
        <span class="option-text">${this.sanitizeHtml(opt)}</span>
        ${badgeMarkup}
        <span class="keyboard-hint text-xs font-mono ml-auto pl-2">[${alphabet[idx]}]</span>
      `;

      if (!session.isSubmitted || session.mode === 'exam') {
        optionEl.addEventListener('click', () => {
          const prevSelected = optionsList.querySelector('.selected');
          if (prevSelected) prevSelected.classList.remove('selected');
          
          optionEl.classList.add('selected');
          onOptionSelect(idx);
        });
      }

      optionsList.appendChild(optionEl);
    });

    // Footer actions
    const submitBtn = document.getElementById('quiz-submit-btn');
    const nextBtn = document.getElementById('quiz-next-btn');

    if (session.mode === 'study') {
      submitBtn.classList.remove('hidden');
      if (session.isSubmitted) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `Submit Answer <kbd class="btn-kbd">Enter</kbd>`;
        nextBtn.classList.remove('hidden');
        nextBtn.disabled = false; // Enable Next
        nextBtn.innerHTML = `Next Question <kbd class="btn-kbd">Enter</kbd>`;
      } else {
        submitBtn.disabled = session.selectedOptionIndex === null;
        submitBtn.innerHTML = `Submit Answer <kbd class="btn-kbd">Enter</kbd>`;
        nextBtn.classList.add('hidden');
        nextBtn.disabled = true;
      }
    } else {
      submitBtn.classList.add('hidden');
      nextBtn.classList.remove('hidden');
      nextBtn.disabled = session.selectedOptionIndex === null;
      const btnText = (session.currentIndex + 1 === session.total) ? 'Finish Exam' : 'Next Question';
      nextBtn.innerHTML = `${btnText} <kbd class="btn-kbd">Enter</kbd>`;
    }

    // Interactive explanation animations
    const feedbackBox = document.getElementById('quiz-feedback-box');
    const explanationBox = document.getElementById('quiz-explanation-box');

    if (session.isSubmitted && session.mode === 'study') {
      const correctIdx = question.correctIndex;
      const isCorrect = session.selectedOptionIndex === correctIdx;
      
      feedbackBox.classList.remove('hidden');
      feedbackBox.className = `callout ${isCorrect ? 'correct' : 'incorrect'}`;
      
      const correctText = question.correctText || (correctIdx >= 0 ? question.options[correctIdx] : "—");
      feedbackBox.innerHTML = isCorrect 
        ? `<strong>Correct!</strong>` 
        : `<strong>Incorrect.</strong> Correct answer: ${this.sanitizeHtml(correctText)}`;

      const explanation = question.explanation ? question.explanation.trim() : "";
      if (explanation) {
        explanationBox.classList.remove('hidden');
        explanationBox.innerHTML = `
          <div class="explanation-inner">
            <div class="key-takeaway-header">💡 Key Clinical Takeaway</div>
            <p class="explanation-text">${this.sanitizeHtml(explanation)}</p>
          </div>
        `;
      } else {
        explanationBox.classList.add('hidden');
      }
    } else {
      feedbackBox.classList.add('hidden');
      explanationBox.classList.add('hidden');
    }
  }

  /**
   * Renders the final quiz summary scorecard and collapsible accordions
   */
  static renderSummary(session, onRestart, onBack) {
    const attempted = session.score + session.wrongList.length;
    document.getElementById('summary-subject').textContent = session.subject;
    document.getElementById('summary-score').textContent = `${session.score} / ${attempted}`;
    
    const percentage = attempted > 0 ? Math.round((session.score / attempted) * 100) : 0;
    document.getElementById('summary-percentage').textContent = `${percentage}%`;
    document.getElementById('summary-time').textContent = session.getFormattedTime();

    // SVG radial accuracy progress
    const circle = document.getElementById('gauge-circle-fill');
    if (circle) {
      const radius = 54;
      const circumference = 2 * Math.PI * radius; // ~339.29
      const strokeDashoffset = circumference - (percentage / 100) * circumference;
      circle.style.strokeDasharray = circumference;
      circle.style.strokeDashoffset = strokeDashoffset;
    }

    // Injects Wrong Answer review accordions
    const reviewList = document.getElementById('summary-review-list');
    const reviewSection = document.getElementById('summary-review-section');
    reviewList.innerHTML = '';

    if (session.wrongList.length > 0) {
      reviewSection.classList.remove('hidden');
      
      session.wrongList.forEach(w => {
        const item = document.createElement('div');
        item.className = 'glass review-item';
        
        item.innerHTML = `
          <button class="review-item-header">
            <div class="review-header-title">
              <span class="review-item-number">Question #${w.qIndex + 1}</span>
              <p class="review-item-question-preview">${this.sanitizeHtml(w.question)}</p>
            </div>
            <svg class="accordion-chevron w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          
          <div class="review-item-body">
            <div class="review-item-question">${this.sanitizeHtml(w.question)}</div>
            
            <div class="review-answers grid-2">
              <div class="answer-card incorrect-card text-sm">
                <span class="answer-label">Your Answer:</span>
                <p>${this.sanitizeHtml(w.chosenText)}</p>
              </div>
              <div class="answer-card correct-card text-sm">
                <span class="answer-label">Correct Answer:</span>
                <p>${this.sanitizeHtml(w.correctText)}</p>
              </div>
            </div>
            
            ${w.explanation ? `
              <div class="review-explanation text-sm">
                <strong>Explanation:</strong>
                <p>${this.sanitizeHtml(w.explanation)}</p>
              </div>
            ` : ''}
          </div>
        `;

        // Toggle Accordion Click Event
        item.querySelector('.review-item-header').addEventListener('click', () => {
          item.classList.toggle('active');
        });

        reviewList.appendChild(item);
      });
    } else {
      reviewSection.classList.add('hidden');
    }

    // Setup Buttons
    const restartBtn = document.getElementById('summary-restart-btn');
    const backBtn = document.getElementById('summary-back-btn');

    const newRestartBtn = restartBtn.cloneNode(true);
    const newBackBtn = backBtn.cloneNode(true);
    
    restartBtn.parentNode.replaceChild(newRestartBtn, restartBtn);
    backBtn.parentNode.replaceChild(newBackBtn, backBtn);

    newRestartBtn.addEventListener('click', onRestart);
    newBackBtn.addEventListener('click', onBack);
  }

  /**
   * Displays toast message notifications
   */
  static showToast(msg, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;

    container.appendChild(toast);
    
    setTimeout(() => toast.classList.add('visible'), 10);
    
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  /**
   * Sanitize html inputs safely
   */
  static sanitizeHtml(s) {
    if (s == null) return "";
    const escaped = String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
    
    return escaped.replace(/\n/g, "<br>");
  }
}
