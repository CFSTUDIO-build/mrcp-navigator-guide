/**
 * DataService - Fetches metadata and question JSON arrays on demand.
 */
export class DataService {
  static metadata = null;
  static cache = {};

  /**
   * Loads the global subject index metadata.
   * @returns {Promise<object>}
   */
  static async loadMetadata() {
    if (this.metadata) return this.metadata;
    try {
      const response = await fetch('./data/metadata.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.metadata = await response.json();
      return this.metadata;
    } catch (e) {
      console.error("Failed to load metadata index file:", e);
      return {};
    }
  }

  /**
   * Fetches the questions list for a specific subject (with caching).
   * @param {string} subjectName 
   * @returns {Promise<array>}
   */
  static async loadSubject(subjectName) {
    if (this.cache[subjectName]) return this.cache[subjectName];
    
    const meta = await this.loadMetadata();
    const subInfo = meta[subjectName];
    if (!subInfo) {
      throw new Error(`Subject "${subjectName}" not found in metadata.`);
    }

    try {
      const response = await fetch(`./data/${subInfo.file}`);
      if (!response.ok) {
        throw new Error(`HTTP error fetching ${subInfo.file}: ${response.status}`);
      }
      const questions = await response.json();
      this.cache[subjectName] = questions;
      return questions;
    } catch (e) {
      console.error(`Failed to load questions for subject: ${subjectName}`, e);
      throw e;
    }
  }

  /**
   * Returns a list of all subjects.
   * @returns {string[]}
   */
  static getSubjectsList() {
    if (!this.metadata) return [];
    return Object.keys(this.metadata);
  }
}
