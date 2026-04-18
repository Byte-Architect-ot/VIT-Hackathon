const crypto = require('crypto');

const generateHash = (text) => {

    const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') 
    .replace(/\s+/g, ' ') 
    .trim();

  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .substring(0, 16); 
};

module.exports = { generateHash };