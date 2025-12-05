const { Router } = require('express');
const sessionController = require('../controllers/session.controller');
const { authMiddleware, queryMiddleware } = require('../middlewares');
// const { celebrate } = require('celebrate');
// const { opts } = require('../validations');
// const { upload } = require('../middlewares/multer.middleware');

const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist','therapist', 'receptionist', 'org_admin');

const router = Router();

// Middleware to increase timeout for long-running AI operations
const increaseTimeout = (req, res, next) => {
    // Set timeout to 15 minutes (900000ms) for generate-note endpoint
    req.setTimeout(15 * 60 * 1000);
    res.setTimeout(15 * 60 * 1000);
    next();
};

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

router.route('/:id/generate-note')
    .post([requireAuth, roleMiddleware, increaseTimeout], sessionController.generateNote);

module.exports = router;