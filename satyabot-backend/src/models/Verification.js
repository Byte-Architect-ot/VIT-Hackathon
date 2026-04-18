const mongoose = require('mongoose');

const verificationSchema = new mongoose.Schema({
  claimHash: {
    type: String,
    required: true,
    index: true
  },
  userId: String, 
  userMessage: String,
  
  processingTime: Number, 
  cacheHit: {
    type: Boolean,
    default: false
  },
  
  llmCalls: {
    type: Number,
    default: 0
  },
  newsApiCalls: {
    type: Number,
    default: 0
  },
  
  result: {
    status: String,
    confidence: Number,
    explanation: String
  },
  
  userLocation: {
    type: String 
  }
}, {
  timestamps: true
});

verificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Verification', verificationSchema);