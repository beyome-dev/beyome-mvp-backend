const { Router } = require('express');
const { noteController } = require('../controllers');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { upload } = require('../middlewares');
const { requireAuth } = authMiddleware;

const router = Router();

router.route('/')
    .get([requireAuth], noteController.getAllNotes)
    .post([
        requireAuth,
        // celebrate(userValidation.registerSchema, opts)
    ], noteController.createNote);

router.route('/:id')
    .get([requireAuth], noteController.getNoteById)
    .delete([requireAuth], noteController.deleteNote)
    .put([
        requireAuth,
        // celebrate(userValidation.updateSchema, opts)
    ], noteController.updateNote);

router.route('/saveAudio')
    .post(
    [
        requireAuth,
        upload.single('audio')
    ], noteController.saveAudio);
module.exports = router;