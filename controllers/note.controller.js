const noteService = require('../services/note.service');
const path = require('path');

// @desc Upload audio recording
// @route POST /api/audio/upload
// @access Public
module.exports.saveAudio = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        
        const result = await noteService.saveAudio(req.file);
        res.status(201).json({
            message: 'File uploaded successfully',
            fileUrl: result.fileUrl,
            transcriptJobId: result.transcriptJobId
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc Listen to Salad API webhook response
// @route POST /api/webhook/salad
// @access Public
module.exports.saladWebhook = async (req, res) => {
    try {
        const saladResponse = req.body;

        // // Assuming the transcript text is available in saladResponse.transcript
        // const transcript = saladResponse.transcript;

        if (!transcript) {
            return res.status(400).json({ message: 'Transcript data is missing' });
        }

        // Get the Socket.io instance
        const io = req.app.get('socketio');

        // Generate SOAP note and emit to frontend
        await noteService.generateSOAPNote(saladResponse, io);

        res.status(200).json({ message: 'Webhook received and SOAP note generated' });
    } catch (error) {
        console.error('Webhook Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};