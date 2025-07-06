const { Router } = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const clientRoutes = require('./client.routes');
const noteRoutes = require('./note.routes');
const bookingRoutes = require('./booking.routes');
const dashboardRoutes = require('./dashboard.routes');

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/notes', noteRoutes);
router.use('/bookings', bookingRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/clients', clientRoutes);

module.exports = router;