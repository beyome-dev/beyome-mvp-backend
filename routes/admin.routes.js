const { Router } = require('express');
const { authController } = require('../controllers');
const adminDashboardController = require('../controllers/admin/adminDashboard.controller');
const passport = require('passport');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const { requireAuth, hasRole } = require('../middlewares/auth.middleware');

const router = Router();

// Admin dashboard routes - require authentication and admin role
router.get('/user-attendance', requireAuth, hasRole('platform_admin'), adminDashboardController.getUserAttendance);
router.get('/user-statistics', requireAuth, hasRole('platform_admin'), adminDashboardController.getUserStatistics);

module.exports = router;