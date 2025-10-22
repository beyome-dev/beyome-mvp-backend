const express = require('express');
const { upload } = require('../middlewares/multer.middleware');
const router = express.Router();
const recordingController = require('../controllers/recording.controller');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist', 'therapist', 'org_admin');

// Start a new recording session (creates unknown client + session)
router.post('/start',[requireAuth, roleMiddleware], recordingController.startRecordingSession);

// Upload a recording to a session
// Expects multipart form with file field named "audio"
router.post(
    '/upload-audio/:sessionId',
    [
        requireAuth,
        roleMiddleware,
        upload.single('audio')
    ],
  recordingController.uploadRecording
);

// Update recording metadata (assign to client / update recordingType, etc.)
router.put('/metadata/:id', [requireAuth, roleMiddleware], recordingController.updateRecordingMetadata);

module.exports = router;