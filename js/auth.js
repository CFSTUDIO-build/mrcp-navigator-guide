/**
 * AuthService - Manages client-side authentication and case-sensitive password changes.
 */
export class AuthService {
  /**
   * Hashes a string using SHA-256 via Web Crypto API.
   * @param {string} str 
   * @param {boolean} lowercase 
   * @returns {Promise<string>}
   */
  static async hashString(str, lowercase = false) {
    let formatted = str.trim();
    if (lowercase) {
      formatted = formatted.toLowerCase();
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(formatted);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Validates credentials and starts session if matching.
   * @param {string} email 
   * @param {string} password 
   * @param {object} usersMap CONFIG.USERS dictionary mapping email hashes to password hashes
   * @returns {Promise<boolean>}
   */
  static async login(email, password, usersMap) {
    if (!email || !password) return false;

    const emailHash = await this.hashString(email, true);
    const userRecord = usersMap[emailHash];
    
    if (!userRecord) return false;

    const inputPwdHash = await this.hashString(password, false);

    // Check if user has a custom changed password in localStorage
    const customPwdHash = localStorage.getItem(`MRCP_NAVIGATOR_PWD::${emailHash}`);
    const targetPwdHash = customPwdHash || userRecord.initialPasswordHash;

    if (inputPwdHash === targetPwdHash) {
      localStorage.setItem('MRCP_NAVIGATOR_AUTH', JSON.stringify({
        email: email.trim().toLowerCase(),
        loginTime: Date.now(),
        token: emailHash
      }));
      return true;
    }

    return false;
  }

  /**
   * Changes the password for the current user and saves it locally in localStorage.
   * @param {string} email Plaintext email of current user
   * @param {string} currentPassword Plaintext current password
   * @param {string} newPassword Plaintext new password
   * @param {object} usersMap CONFIG.USERS database map
   * @returns {Promise<{success: boolean, message: string}>}
   */
  static async changePassword(email, currentPassword, newPassword, usersMap) {
    const emailHash = await this.hashString(email, true);
    const userRecord = usersMap[emailHash];

    if (!userRecord) {
      return { success: false, message: "User session is invalid." };
    }

    const currentPwdHashInput = await this.hashString(currentPassword, false);
    
    // Find expected current password hash (custom or initial)
    const customPwdHash = localStorage.getItem(`MRCP_NAVIGATOR_PWD::${emailHash}`);
    const expectedCurrentHash = customPwdHash || userRecord.initialPasswordHash;

    if (currentPwdHashInput !== expectedCurrentHash) {
      return { success: false, message: "Current password is incorrect." };
    }

    // Hash and save the new password
    const newPwdHash = await this.hashString(newPassword, false);
    localStorage.setItem(`MRCP_NAVIGATOR_PWD::${emailHash}`, newPwdHash);

    return { success: true, message: "Password updated successfully!" };
  }

  /**
   * Logs out the current user by clearing the session.
   */
  static logout() {
    localStorage.removeItem('MRCP_NAVIGATOR_AUTH');
  }

  /**
   * Checks if the user session is active and valid (expires in 30 days).
   * @returns {boolean}
   */
  static isAuthenticated() {
    const authData = localStorage.getItem('MRCP_NAVIGATOR_AUTH');
    if (!authData) return false;
    try {
      const parsed = JSON.parse(authData);
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.loginTime < thirtyDays) {
        return true;
      }
      this.logout(); // Session expired
      return false;
    } catch (e) {
      this.logout();
      return false;
    }
  }

  /**
   * Returns the authenticated user's email or null.
   * @returns {string|null}
   */
  static getAuthenticatedUser() {
    const authData = localStorage.getItem('MRCP_NAVIGATOR_AUTH');
    if (!authData) return null;
    try {
      return JSON.parse(authData).email;
    } catch (e) {
      return null;
    }
  }
}
