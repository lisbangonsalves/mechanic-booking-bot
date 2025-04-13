// utils/userSessions.js
const sessions = {};

// Auto-cleanup sessions after 30 minutes of inactivity
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function cleanupSessions() {
  const now = Date.now();
  Object.keys(sessions).forEach(key => {
    if (now - sessions[key].lastUpdated > SESSION_TIMEOUT) {
      delete sessions[key];
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupSessions, 5 * 60 * 1000);

module.exports = {
  getSession(phoneNumber) {
    return sessions[phoneNumber];
  },
  
  createSession(phoneNumber) {
    sessions[phoneNumber] = {
      state: null,
      data: {},
      lastUpdated: Date.now()
    };
    return sessions[phoneNumber];
  },
  
  updateSession(phoneNumber, updates) {
    if (!sessions[phoneNumber]) {
      this.createSession(phoneNumber);
    }
    
    Object.assign(sessions[phoneNumber], updates);
    sessions[phoneNumber].lastUpdated = Date.now();
    return sessions[phoneNumber];
  },
  
  clearSession(phoneNumber) {
    delete sessions[phoneNumber];
  }
};