const noteService = require('../services/note.service');
const path = require('path');
const mongoose = require('mongoose');

// @desc Upload audio recording
// @route POST /api/audio/upload
// @access Public
module.exports.saveAudio = async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded' });
      }
      if (!req.query.name) {
        return res.status(400).json({ message: 'Require patient name' });
      }

      const result = await noteService.saveAudio(req.file, req.query.name, req.user);
      if (!result) {
        return res.status(400).json({ message: 'Failed to process recording'});
      }
      return res.status(201).json({
        message: 'File uploaded successfully',
        fileUrl: result.fileUrl ? result.fileUrl : "",
        transcriptJobId: result.transcriptJobId ? result.transcriptJobId : "",
        note: result.note ? result.note : null
      });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc Listen to Salad API webhook response
// @route POST /api/webhook/salad?id=<note id>
// @access Public
module.exports.saladWebhook = async (req, res) => {
    try {
        const saladResponse = req.body;
        const noteId = req.query.id
        // // Assuming the transcript text is available in saladResponse.transcript
        // const transcript = saladResponse.transcript;

        if (!saladResponse.output) {
            return res.status(400).json({ message: 'Transcript data is missing' });
        }

        if (!noteId) {
            return res.status(400).json({ message: 'Note data is missing' });
        }
        // Get the Socket.io instance
        const io = req.app.get('socketio');

        // Generate SOAP note and emit to frontend
        const note = await noteService.generateSOAPNote(saladResponse, noteId, io);

        res.status(200).json({ 
            message: 'Webhook received and SOAP note generated',
            note: note,
        });
    } catch (error) {
        console.error('Webhook Error:', error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc Listen to Salad API webhook response
// @route POST /api/notes/reprocess?id=<note id>
// @access Public
module.exports.reprocessNote = async (req, res) => {
  try {
      const noteId = req.query.id
      if (!noteId) {
          return res.status(400).json({ message: 'Note data is missing' });
      }
      // Get the Socket.io instance
      const io = req.app.get('socketio');

      // Generate SOAP note and emit to frontend
      const note = await noteService.reprocessNote(noteId, io);

      res.status(200).json({ 
          message: 'Clinicalnote generated',
          note: note,
      });
  } catch (error) {
      console.error('Webhook Error:', error.message);
      res.status(500).json({ message: 'Server error' });
  }
};

module.exports.createNote = async(req, res) => {
    try {
      const note = await noteService.createNote(req.body);
      res.status(201).json(note);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
};

module.exports.getAllNotes = async(req, res) => {
    try {
      let { page, limit, ...filters } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      filters.doctor = new mongoose.Types.ObjectId(req.user._id)
      const notes = await noteService.getAllNotes(filters, page, limit);
      res.status(200).json(notes);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
};

module.exports.getAllNotesMinimal = async (req, res) => {
  try {
      let { page, limit, ...filters } = req.query;
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      filters.doctor = new mongoose.Types.ObjectId(req.user._id)
      const data = await noteService.getAllNotesMinimal(filters, page, limit);
      
      res.status(200).json(data);
  } catch (err) {
      res.status(500).json({ message: err.message });
  }
};

module.exports.getNoteById = async(req, res) => {
    try {
      const note = await noteService.getNoteById(req.params.id, req.user);
      if (!note) return res.status(404).json({ message: 'Note not found' });
      res.status(200).json(note);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
};

module.exports.updateNote = async(req, res) => {
    try {
      const updatedNote = await noteService.updateNote(req.params.id, req.body, req.user);
      if (!updatedNote) return res.status(404).json({ message: 'Note not found' });
      res.status(200).json(updatedNote);
    } catch (err) {
      res.status(400).json({ message: err.message });
    }
};

module.exports.deleteNote = async(req, res) => {
    try {
      const deletedNote = await noteService.deleteNote(req.params.id, req.user);
      if (!deletedNote) return res.status(404).json({ message: 'Note not found' });
      res.status(200).json({ message: 'Note deleted successfully' });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
};