// jobs/transcriptionRetryJob.js
const cron = require('node-cron');
const { processRetryQueue } = require('../services/recording.service');

/**
 * Retry queue processor
 * Runs every 5 minutes to process failed transcriptions
 */
class TranscriptionRetryJob {
  constructor(io) {
    this.io = io;
    this.isRunning = false;
    this.job = null;
    this.stats = {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      lastRun: null,
      lastError: null
    };
  }

  start() {
    // Run every 5 minutes
    this.job = cron.schedule('*/5 * * * *', async () => {
      await this.execute();
    });

    console.log('✓ Transcription retry job scheduled (every 5 minutes)');
  }

  async execute() {
    if (this.isRunning) {
      console.log('Retry job already running, skipping...');
      return;
    }

    this.isRunning = true;
    this.stats.totalRuns++;

    try {
      console.log(`[${new Date().toISOString()}] Starting retry queue processing...`);
      
      const result = await processRetryQueue(this.io);
      
      this.stats.successfulRuns++;
      this.stats.lastRun = new Date();
      
      console.log(`✓ Retry queue processed: ${result.processed} recordings`);
      
    } catch (error) {
      this.stats.failedRuns++;
      this.stats.lastError = {
        message: error.message,
        timestamp: new Date()
      };
      
      console.error('✗ Retry queue processing failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  stop() {
    if (this.job) {
      this.job.stop();
      console.log('Transcription retry job stopped');
    }
  }

  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      successRate: this.stats.totalRuns > 0 
        ? (this.stats.successfulRuns / this.stats.totalRuns * 100).toFixed(2) + '%'
        : 'N/A'
    };
  }

  // Manual trigger for testing
  async runNow() {
    return await this.execute();
  }
}

module.exports = TranscriptionRetryJob;