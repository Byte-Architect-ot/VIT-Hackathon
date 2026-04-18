const mongoose = require('mongoose');

const factCheckRecordSchema = new mongoose.Schema({
  
  originalId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  authorName: String,
  factCheckSource: {
    type: String,
    index: true
  },
  sourceType: {
    type: String,
    enum: ['IFCN', 'Independent', 'News Organization', 'Government'],
    default: 'Independent'
  },
  
  statement: {
    type: String,
    required: true
  },
  statementEnglish: String,
  
  newsBody: String,
  newsBodyEnglish: String,
  
  mediaLink: String,
  publishDate: Date,
  factCheckLink: {
    type: String,
    required: true
  },
  
  newsCategory: {
    type: String,
    index: true
  },
  language: {
    type: String,
    index: true
  },
  region: {
    type: String,
    index: true
  },
  platform: {
    type: String,
    enum: ['Twitter', 'Facebook', 'WhatsApp', 'Instagram', 'YouTube', 'Other']
  },
  
  contentType: {
    text: { type: Boolean, default: false },
    video: { type: Boolean, default: false },
    image: { type: Boolean, default: false }
  },
  
  label: {
    type: String,
    enum: ['FALSE', 'TRUE', 'MISLEADING', 'UNVERIFIED', 'SATIRE'],
    required: true,
    index: true
  },
  
  claimHash: {
    type: String,
    index: true
  },
  extractedKeywords: [String],
  trustScore: {
    type: Number,
    min: 0,
    max: 100
  },
  
  usedInVerification: {
    type: Number,
    default: 0
  },
  lastUsed: Date,
  
  importedAt: {
    type: Date,
    default: Date.now
  },
  importBatch: String
}, {
  timestamps: true
});

factCheckRecordSchema.index(
  { statement: 'text', statementEnglish: 'text' },
  { language_override: 'text_language' }
);
factCheckRecordSchema.index({ label: 1, region: 1 });
factCheckRecordSchema.index({ factCheckSource: 1, publishDate: -1 });

factCheckRecordSchema.methods.recordUsage = async function() {
  this.usedInVerification += 1;
  this.lastUsed = new Date();
  await this.save();
};

module.exports = mongoose.model('FactCheckRecord', factCheckRecordSchema);