const { Router } = require('express');
const sessionController = require('../controllers/session.controller');
const { authMiddleware, queryMiddleware } = require('../middlewares');
// const { celebrate } = require('celebrate');
// const { opts } = require('../validations');
// const { upload } = require('../middlewares/multer.middleware');

const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist','therapist', 'receptionist', 'org_admin');

const router = Router();

router.route('/')
    .get([
        requireAuth, 
        queryMiddleware,
        roleMiddleware
    ], sessionController.getAllSessions)
    .post([
        requireAuth, 
        roleMiddleware
    ], sessionController.createSession);

router.route('/:id')
    .get([requireAuth, roleMiddleware], sessionController.getSessionById)
    .put([
        requireAuth, 
        roleMiddleware,
    ], sessionController.updateSession)
    .delete([requireAuth, roleMiddleware], sessionController.deleteSession);

module.exports = router;