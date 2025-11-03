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
      const audioFile = req.file;

      if (!audioFile) {
        return res.status(400).json({ success: false, error: 'Audio file is required (multipart form field "audio")' });
      }

      const result = await recordingService.uploadRecording(sessionId, audioFile, duration, req.user);
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      console.error('Controller uploadRecording error:', error);
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
    checkRecordingStatus
};
