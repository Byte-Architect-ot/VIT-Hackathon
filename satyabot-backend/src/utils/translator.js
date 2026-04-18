const translatte = require('translatte');
const logger = require('./logger');

const translateToHindi = async (text) => {
  try {
    const result = await translatte(text, { 
      from: 'en', 
      to: 'hi' 
    });
    
    return result.text;
  } catch (error) {
    logger.error('Translation error:', error.message);
    return text; 
  }
};

module.exports = { translateToHindi };