const { Router } = require('express');
const { noteController } = require('../controllers');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { upload } = require('../middlewares');
const { requireAuth } = authMiddleware;

const router = Router();

router.route('/saveAudio')
    .post(
    [
        requireAuth,
        upload.single('audio')
    ], noteController.saveAudio);


module.exports = router;