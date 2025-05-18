const { Router } = require('express');
const { dashboardController } = require('../controllers');
const { authMiddleware } = require('../middlewares');

const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist','therapist', 'receptionist', 'org_admin');

const router = Router();

router.route('/')
    .get([requireAuth, roleMiddleware], dashboardController.getDashboardData)


module.exports = router;