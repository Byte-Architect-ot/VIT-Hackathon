const mongoose = require('mongoose');

const claimSchema = new mongoose.Schema({
  claimHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  originalText: {
    type: String,
    required: true,
    maxlength: 5000
  },
  extractedClaim: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['FAKE', 'TRUE', 'UNVERIFIED'],
    required: true
  },
  confidenceScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  explanationEnglish: String,
  explanationHindi: String,
  suggestedAction: String,

    queryCount: {
    type: Number,
    default: 1
  },
  lastQueried: {
    type: Date,
    default: Date.now
  },
  trustedContext: [{
    title: String,
    source: String,
    url: String,
    publishedAt: Date
  }],

    clusterGroup: {
    type: String,
    index: true
  },

    regions: [{
    type: String
  }],

    velocityScore: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

claimSchema.index({ velocityScore: -1, updatedAt: -1 });
claimSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 }); 

claimSchema.methods.incrementQuery = async function() {
  this.queryCount += 1;
  this.lastQueried = new Date();

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (this.lastQueried > tenMinutesAgo) {
    this.velocityScore += 1;
  }

    await this.save();
};

module.exports = mongoose.model('Claim', claimSchema);