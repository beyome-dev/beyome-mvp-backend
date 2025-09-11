const { Router } = require('express');
const { noteController } = require('../controllers');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { upload } = require('../middlewares/multer.middleware');
const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist', 'therapist', 'org_admin');

const router = Router();

router.route('/')
    .get([requireAuth, roleMiddleware], noteController.getAllNotes)
    .post([
        requireAuth,
        roleMiddleware,
        // celebrate(userValidation.registerSchema, opts)
    ], noteController.createNote);

router.route('/minimal')
    .get([requireAuth, roleMiddleware], noteController.getAllNotesMinimal)

router.route('/:id')
    .get([requireAuth, roleMiddleware], noteController.getNoteById)
    .delete([requireAuth, roleMiddleware], noteController.deleteNote)
    .put([
        requireAuth,
        roleMiddleware,
        // celebrate(userValidation.updateSchema, opts)
    ], noteController.updateNote);

router.route('/reprocess')
    .post(
    [
        requireAuth,
        roleMiddleware,
    ], noteController.reprocessNote);

router.route('/saveAudio')
    .post(
    [
        requireAuth,
        roleMiddleware,
        upload.single('audio')
    ], noteController.saveAudio);

router.route('/manual-note')
    .post([
        requireAuth,
        roleMiddleware
    ],noteController.CreateManualNote)

router.route('/:id/download')
    .get([requireAuth,
        roleMiddleware,
    ], noteController.downloadTherapyNotePDF)

    
module.exports = router;