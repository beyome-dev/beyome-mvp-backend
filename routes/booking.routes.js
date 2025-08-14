

const { Router } = require('express');
const bookingController = require('../controllers/booking.controller');
const { authMiddleware, queryMiddleware } = require('../middlewares');
const { celebrate } = require('celebrate');
const { opts, bookingValidation } = require('../validations');
const { upload } = require('../middlewares/multer.middleware');

const { requireAuth, hasRole } = authMiddleware;

const roleMiddleware = hasRole('psychiatrist','therapist', 'receptionist', 'org_admin');

const router = Router();

router.route('/')
    .get([
        requireAuth, 
        queryMiddleware,
        roleMiddleware
    ], bookingController.getAllBookings)
    .post([
        requireAuth, 
        celebrate(bookingValidation.bookingCreateSchema, opts),
        roleMiddleware
    ], bookingController.createBooking);

router.route('/:id')
    .get([requireAuth, roleMiddleware], bookingController.getBookingById)
    .put([
        requireAuth, 
        roleMiddleware,
        celebrate(bookingValidation.bookingUpdateSchema, opts),
    ], bookingController.updateBooking)
    .delete([requireAuth, roleMiddleware], bookingController.deleteBooking);

router.route('/:id/reschedule')
    .put([ 
        requireAuth, 
        roleMiddleware,
        celebrate(bookingValidation.bookingRescheduleSchema, opts),
    ], bookingController.rescheduleBooking);

router.route('/:id/checkin')
    .post([requireAuth, hasRole('psychiatrist','therapist')], bookingController.checkInBooking);

router.route('/:id/checkout')
    .post([requireAuth, hasRole('psychiatrist','therapist')], bookingController.checkOutBooking);

router.route('/:id/dictate-note')
    .post([requireAuth, hasRole('psychiatrist','therapist'), upload.single('audio')], bookingController.dictateNote);

module.exports = router;