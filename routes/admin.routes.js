const { Router } = require('express');
const { authController } = require('../controllers');
const adminDashboardController = require('../controllers/admin/adminDashboard.controller');
const passport = require('passport');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const { requireAuth, hasRole } = require('../middlewares/auth.middleware');
const TranscriptionRetryJob = require('../cronJobs/transcriptionRetryJob');
const { createUploadMiddleware } = require('../middlewares/multer.middleware');

const adminTranscriptionUpload = createUploadMiddleware({
    allowedMimeTypes: [
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'audio/mp4',
        'audio/x-m4a',
        'audio/m4a',
        'audio/aac',
        'audio/webm',
        'audio/ogg',
        'audio/flac'
    ],
    allowedExtensions: ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.webm', '.flac', '.mp4'],
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB
        files: 1
    }
});

const router = Router();

// Admin dashboard routes - require authentication and admin role
router.get('/user-attendance', requireAuth, hasRole('platform_admin'), adminDashboardController.getUserAttendance);
router.get('/user-statistics', requireAuth, hasRole('platform_admin'), adminDashboardController.getUserStatistics);

// Admin endpoint to check job status
router.get('/retry-job/stats',  requireAuth, hasRole('platform_admin'), async (req, res) => {
    const io = req.app.get('socketio');
    const retryJob = new TranscriptionRetryJob(io);
    const stats = await retryJob.getStats();
    res.json({ success: true, data: stats });
});
    
// Admin endpoint to manually trigger retry queue
router.post('/retry-job/run', requireAuth, hasRole('platform_admin'), async (req, res) => {
    try {
        const io = req.app.get('socketio');
        const retryJob = new TranscriptionRetryJob(io);
        await retryJob.runNow();
        res.json({ success: true, message: 'Retry queue processed' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

// Admin endpoint to test transcription tools with ad-hoc uploads
router.post(
    '/transcription/test',
    requireAuth,
    hasRole('platform_admin'),
    adminTranscriptionUpload.single('audio'),
    adminDashboardController.testTranscriptionTool
);

module.exports = router;


// ============================================
// API Routes for monitoring
// ============================================

/*
const express = require('express');
const router = express.Router();
const { getTranscriptionStats, manualRetryTranscription } = require('../services/recordingSession.service');
const { Recording } = require('../models');

// Get transcription statistics
router.get('/transcription/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const therapistId = req.user._id;
    
    const dateRange = {
      start: startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: endDate ? new Date(endDate) : new Date()
    };
    
    const stats = await getTranscriptionStats(therapistId, dateRange);
    
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get failed recordings
router.get('/transcription/failed', async (req, res) => {
  try {
    const therapistId = req.user._id;
    
    const failedRecordings = await Recording.find({
      therapistId,
      transcriptionStatus: { $in: ['failed', 'retrying'] }
    })
    .populate('sessionId', 'sessionDate clientId')
    .sort({ updatedAt: -1 })
    .limit(50);
    
    res.json({ success: true, data: failedRecordings });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual retry
router.post('/transcription/retry/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    const { preferredTool, force } = req.body;
    
    const recording = await manualRetryTranscription(recordingId, {
      preferredTool,
      force
    });
    
    res.json({ 
      success: true, 
      message: 'Retry initiated',
      data: {
        recordingId: recording._id,
        status: recording.transcriptionStatus,
        attempt: recording.retryConfig.currentRetry
      }
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

module.exports = router;
*/