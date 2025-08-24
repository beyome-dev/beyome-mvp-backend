const { Router } = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const clientRoutes = require('./client.routes');
const noteRoutes = require('./note.routes');
const bookingRoutes = require('./booking.routes');
const dashboardRoutes = require('./dashboard.routes');
const promptRoutes = require('./prompt.routes');
const waitlistRoutes = require('./waitlist.routes');
const checklistRoutes = require('./checklist.routes');
const adminRoutes = require('./admin.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/notes', noteRoutes);
router.use('/bookings', bookingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/clients', clientRoutes);
router.use('/prompts', promptRoutes);
router.use('/waitlist', waitlistRoutes);
router.use('/checklist', checklistRoutes);
router.use('/admin', adminRoutes);

module.exports = router;