const crypto = require('crypto');

const generateHash = (text) => {
  
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Generate SHA256 hash
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 16); 
};

module.exports = { generateHash };