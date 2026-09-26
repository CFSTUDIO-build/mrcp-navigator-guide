import { StorageService } from './storage.js';

/**
 * QuizSession - Manages the state, timer, scoring, and progress of a quiz session.
 */
export class QuizSession {
  /**
   * @param {string} subject 
   * @param {array} questions 
   * @param {string} mode 'study' or 'exam'
   */
  constructor(subject, questions, mode = 'study') {
    this.subject = subject;
    this.questions = questions;
    this.mode = mode;
    this.total = questions.length;

    // Default state
    this.currentIndex = 0;
    this.score = 0;
    this.wrongList = [];
    this.selectedOptionIndex = null;
    this.isSubmitted = false;
    
    // Timer state
    this.elapsedTime = 0; // in seconds
    this.timerInterval = null;
  }

  /**
   * Populates the session state from a saved configuration.
   * @param {object} state 
   */
  loadState(state) {
    this.currentIndex = Math.min(Math.max(0, state.currentIndex), this.total - 1);
    this.score = state.score || 0;
    this.wrongList = Array.isArray(state.wrongList) ? state.wrongList : [];
    this.selectedOptionIndex = state.selectedOptionIndex ?? null;
    this.isSubmitted = !!state.isSubmitted;
    this.elapsedTime = state.elapsedTime || 0;
    this.mode = state.mode || 'study';
  }

  /**
   * Returns current active question object.
   * @returns {object}
   */
  getCurrentQuestion() {
    return this.questions[this.currentIndex];
  }

  /**
   * Sets the user's selected option index.
   * @param {number} index 
   */
  selectOption(index) {
    if (this.isSubmitted && this.mode === 'study') return; // Cannot change after submit in study mode
    this.selectedOptionIndex = index;
  }

  /**
   * Submits the selected answer.
   * @returns {object} Review result of the question
   */
  submitAnswer() {
    if (this.selectedOptionIndex === null) return null;
    
    const question = this.getCurrentQuestion();
    const correctIdx = typeof question.correctIndex === 'number' ? question.correctIndex : -1;
    const isCorrect = this.selectedOptionIndex === correctIdx;
    
    this.isSubmitted = true;

    const chosenText = question.options[this.selectedOptionIndex] || "—";
    const correctText = question.correctText || (correctIdx >= 0 ? question.options[correctIdx] : "—");

    if (isCorrect) {
      this.score += 1;
    } else {
      this.wrongList.push({
        qIndex: this.currentIndex,
        question: question.question,
        chosenText: chosenText,
        correctText: correctText,
        explanation: question.explanation || ""
      });
    }

    // Record this practice in daily counters & streaks
    StorageService.recordQuestionPracticed();

    // Permanently record into cumulative profile progress
    StorageService.recordQuestionAnswer(
      this.subject,
      this.currentIndex,
      isCorrect,
      this.selectedOptionIndex,
      chosenText,
      correctText,
      this.total
    );

    this.saveProgress();

    return {
      isCorrect,
      correctIndex: correctIdx,
      selectedIndex: this.selectedOptionIndex
    };
  }

  /**
   * Advances session to the next question.
   * @returns {boolean} True if successfully advanced, false if quiz is completed
   */
  nextQuestion() {
    if (this.currentIndex + 1 >= this.total) {
      this.stopTimer();
      return false;
    }
    
    this.currentIndex += 1;
    this.selectedOptionIndex = null;
    this.isSubmitted = false;
    this.saveProgress();
    return true;
  }

  /**
   * Saves the current session state to StorageService.
   */
  saveProgress() {
    StorageService.saveSubjectState(this.subject, this.serialize());
  }

  /**
   * Clears saved progress and writes result to completed history.
   */
  finishSession() {
    this.stopTimer();
    const attempted = this.score + this.wrongList.length;
    StorageService.saveSessionResult(this.subject, this.score, attempted, this.mode);
    StorageService.clearSubjectState(this.subject);
  }

  /**
   * Starts the elapsed timer.
   * @param {function} tickCallback Triggered every second with the current time string
   */
  startTimer(tickCallback) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const start = Date.now() - (this.elapsedTime * 1000);
    
    this.timerInterval = setInterval(() => {
      this.elapsedTime = Math.floor((Date.now() - start) / 1000);
      if (tickCallback) {
        tickCallback(this.getFormattedTime());
      }
    }, 1000);
  }

  /**
   * Stops the active timer.
   */
  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Formats elapsed seconds to MM:SS or HH:MM:SS.
   * @returns {string}
   */
  getFormattedTime() {
    const s = this.elapsedTime % 60;
    const m = Math.floor((this.elapsedTime / 60) % 60);
    const h = Math.floor(this.elapsedTime / 3600);

    const pad = (num) => String(num).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  /**
   * Serializes current session variables for persistence.
   * @returns {object}
   */
  serialize() {
    return {
      currentIndex: this.currentIndex,
      score: this.score,
      wrongList: this.wrongList,
      selectedOptionIndex: this.selectedOptionIndex,
      isSubmitted: this.isSubmitted,
      elapsedTime: this.elapsedTime,
      mode: this.mode,
      total: this.total
    };
  }
}
