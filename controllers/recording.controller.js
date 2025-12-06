const { recordingService } = require('../services');

const startRecordingSession = async (req, res) => {
    try {
      const result = await recordingService.startRecordingSession(req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller startRecordingSession error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
}

const  uploadRecording = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const duration = req.body.duration ? Number(req.body.duration) : undefined;
      const languageCode = req.body.languageCode ? req.body.languageCode : undefined;
      const audioFile = req.file;

      if (!audioFile) {
        return res.status(400).json({ success: false, error: 'Audio file is required (multipart form field "audio")' });
      }

       // Get the Socket.io instance
      const io = req.app.get('socketio');

      const result = await recordingService.uploadRecording(sessionId, audioFile, duration, languageCode, req.user, io);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller uploadRecording error:', error);
      
      // Return 400 for validation errors, 500 for server errors
      const isValidationError = error.message && (
        error.message.includes('empty') ||
        error.message.includes('corrupted') ||
        error.message.includes('invalid') ||
        error.message.includes('missing') ||
        error.message.includes('too short') ||
        error.message.includes('Duration') ||
        error.message.includes('Session not found')
      );
      
      const statusCode = isValidationError ? 400 : 500;
      return res.status(statusCode).json({ success: false, error: error.message || 'Internal server error' });
    }
}

const manualRecordingGeneration = async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { input } = req.body;
      const result = await recordingService.manualRecordingGeneration(input, sessionId, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller manualRecordingGeneration error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
}

const updateRecordingMetadata = async (req, res) => {
    try {
      const recordingId = req.params.id;
      const data = req.body;

      const result = await recordingService.updateRecordingMetadata(recordingId, data, req.user);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller updateRecordingMetadata error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
}

const checkRecordingStatus = async (req, res) => {
    try {
      const recordingId = req.params.id;

      const result = await recordingService.checkAndUpdateRecordingTranscription(recordingId);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller updateRecordingTranscriptionMetadata error:', error);
      return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }
}
module.exports = {
    startRecordingSession,
    uploadRecording,
    updateRecordingMetadata,
    checkRecordingStatus,
    manualRecordingGeneration
};
