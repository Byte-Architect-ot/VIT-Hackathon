require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const { connectDB } = require('../config/database');
const FactCheckRecord = require('../models/FactCheckRecord');
const { generateHash } = require('../utils/hashGenerator');
const logger = require('../utils/logger');

class DatasetImporter {
  constructor(filePath) {
    this.filePath = filePath;
    this.stats = {
      total: 0,
      imported: 0,
      skipped: 0,
      errors: 0
    };
  }

    async import() {
    try {
      logger.info(' Starting dataset import...');
      
      await connectDB();
      
      const workbook = XLSX.readFile(this.filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const rawData = XLSX.utils.sheet_to_json(worksheet);
      this.stats.total = rawData.length;
      
      logger.info(` Found ${rawData.length} records in dataset`);
      
      const batchSize = 100;
      const importBatchId = new Date().toISOString();
      
      for (let i = 0; i < rawData.length; i += batchSize) {
        const batch = rawData.slice(i, i + batchSize);
        await this.processBatch(batch, importBatchId);
        
        logger.info(`Progress: ${Math.min(i + batchSize, rawData.length)}/${rawData.length}`);
      }
      
      this.printStats();
      
      process.exit(0);
    } catch (error) {
      logger.error('Import failed:', error);
      process.exit(1);
    }
  }

    async processBatch(batch, importBatchId) {
    const operations = batch.map(row => this.transformRow(row, importBatchId));
    const validRecords = operations.filter(op => op !== null);
    
    if (validRecords.length === 0) return;
    
    try {
      
      const bulkOps = validRecords.map(record => ({
        updateOne: {
          filter: { originalId: record.originalId },
          update: { $set: record },
          upsert: true
        }
      }));
      
      const result = await FactCheckRecord.bulkWrite(bulkOps);
      
      this.stats.imported += result.upsertedCount + result.modifiedCount;
      this.stats.skipped += validRecords.length - (result.upsertedCount + result.modifiedCount);
      
    } catch (error) {
      logger.error('Batch import error:', error.message);
      this.stats.errors += validRecords.length;
    }
  }

    transformRow(row, importBatchId) {
    try {
      
      let publishDate = null;
      if (row.Publish_Date) {
        publishDate = this.parseDate(row.Publish_Date);
      }
      
      const statementText = row.Eng_Trans_Statement || row.Statement || '';
      const claimHash = generateHash(statementText);
      
      // Extract keywords
      const keywords = this.extractKeywords(statementText);
      
      // Map label to standardized format
      const label = this.standardizeLabel(row.Label);
      
      // Calculate trust score based on source
      const trustScore = this.calculateTrustScore(row.Fact_Check_Source, row.Source_Type);
      
      return {
        originalId: row.id,
        authorName: row.Author_Name,
        factCheckSource: row.Fact_Check_Source,
        sourceType: row.Source_Type || 'Independent',
        
        statement: row.Statement,
        statementEnglish: row.Eng_Trans_Statement,
        
        newsBody: row.News_Body,
        newsBodyEnglish: row.Eng_Trans_News_Body,
        
        mediaLink: row.Media_Link,
        publishDate,
        factCheckLink: row.Fact_Check_Link,
        
        newsCategory: row.News_Category,
        language: row.Language,
        region: row.Region,
        platform: row.Platform,
        
        contentType: {
          text: this.parseBoolean(row.Text),
          video: this.parseBoolean(row.Video),
          image: this.parseBoolean(row.Image)
        },
        
        label,
        
        claimHash,
        extractedKeywords: keywords,
        trustScore,
        
        importBatch: importBatchId
      };
    } catch (error) {
      logger.error(`Error transforming row ${row.id}:`, error.message);
      this.stats.errors++;
      return null;
    }
  }

    parseDate(dateString) {
    try {
      if (!dateString) return null;
      if (typeof dateString === 'number') {
        const utcDays = Math.floor(dateString - 25569);
        const utcValue = utcDays * 86400;                                        
        const dt = new Date(utcValue * 1000);
        return isNaN(dt.getTime()) ? null : dt;
      }
      const cleaned = String(dateString).replace(/(\d+)(st|nd|rd|th)/, '$1');
      const dt = new Date(cleaned);
      return isNaN(dt.getTime()) ? null : dt;
    } catch {
      return null;
    }
  }

    parseBoolean(value) {
    if (typeof value === 'boolean') return value;
    return value?.toLowerCase() === 'yes';
  }

    standardizeLabel(label) {
    const mapping = {
      'FALSE': 'FALSE',
      'TRUE': 'TRUE',
      'MISLEADING': 'MISLEADING',
      'UNVERIFIED': 'UNVERIFIED',
      'SATIRE': 'SATIRE',
      'FAKE': 'FALSE',
      'REAL': 'TRUE'
    };
    
    if (label == null) return 'UNVERIFIED';
    const safeLabel = typeof label === 'object' ? Object.values(label).join('') : String(label);
    return mapping[safeLabel.toUpperCase()] || 'UNVERIFIED';
  }

    extractKeywords(text) {
    if (!text) return [];
    
    const stopWords = new Set([
      'the', 'is', 'in', 'at', 'on', 'a', 'an', 'and', 'or', 'but',
      'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
      'to', 'from', 'for', 'of', 'with', 'by'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word))
      .slice(0, 10);
  }

  /**
   * Calculate trust score based on source
   */
  calculateTrustScore(source, sourceType) {
    const trustedSources = {
      'Alt News': 95,
      'Boom Live': 95,
      'Fact Crescendo': 90,
      'Newschecker': 90,
      'PIB Fact Check': 100,
      'AFP Fact Check': 95,
      'IFCN': 90
    };
    
    if (trustedSources[source]) {
      return trustedSources[source];
    }
    
    if (sourceType === 'IFCN') return 85;
    if (sourceType === 'Government') return 95;
    
    return 75; 
  }

    printStats() {
    logger.info('\n' + '='.repeat(50));
    logger.info(' IMPORT STATISTICS');
    logger.info('='.repeat(50));
    logger.info(`Total Records:    ${this.stats.total}`);
    logger.info(` Imported:      ${this.stats.imported}`);
    logger.info(` Skipped:       ${this.stats.skipped}`);
    logger.info(` Errors:        ${this.stats.errors}`);
    logger.info(` Success Rate:  ${((this.stats.imported / this.stats.total) * 100).toFixed(2)}%`);
    logger.info('='.repeat(50) + '\n');
  }
}

const datasetPath = process.argv[2] || path.join(__dirname, '../../data/raw/factcheck_dataset.xlsx');

const importer = new DatasetImporter(datasetPath);
importer.import();