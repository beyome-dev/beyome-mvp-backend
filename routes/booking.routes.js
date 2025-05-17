

const { Router } = require('express');
const bookingController = require('../controllers/booking.controller');
const { authMiddleware } = require('../middlewares');

const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist','therapist', 'receptionist', 'org_admin');

const router = Router();

router.route('/')
    .get([requireAuth, roleMiddleware], bookingController.getAllBookings)
    .post([requireAuth, roleMiddleware], bookingController.createBooking);

router.route('/:id')
    .get([requireAuth, roleMiddleware], bookingController.getBookingById)
    .put([requireAuth, roleMiddleware], bookingController.updateBooking)
    .delete([requireAuth, roleMiddleware], bookingController.deleteBooking);

router.route('/:id/reschedule')
    .put([requireAuth, roleMiddleware], bookingController.rescheduleBooking);

module.exports = router;