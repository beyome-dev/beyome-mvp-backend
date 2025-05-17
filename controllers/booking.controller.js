const bookingService = require("../services/booking.service");

// Create a new booking
async function createBooking(req, res) {
    try {
        //TODO: Need to handle receptionist scenario where receptionist can create booking for other handlers
        // Check if the user is a receptionist or org_admin
        if (req.user.userType === "receptionist" || req.user.userType === "org_admin") {
            req.body.organization = req.user.organization;
        } else {
            req.body.handler = req.user._id;
        }
        const booking = await bookingService.createBooking(req.body, req.user);
        res.status(201).json(booking);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Get all bookings
async function getAllBookings(req, res) {
    try {
        let filter = req.user.userType === "receptionist" || req.user.userType === "org_admin"
            ? { organization: req.user.organization, ...req.query }
            : { handler: req.user._id, ...req.query };
        const bookings = await bookingService.getAllBookings(filter);
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Get a booking by ID
async function getBookingById(req, res) {
    try {
        const booking = await bookingService.getBookingById(req.params.id);
        console.log("Booking found:", booking);
        console.log("User found:", req.user);
        if (!booking || 
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id.toString()) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization.toString())) {
            return res.status(404).json({ message: "Booking not found" });
        }
        res.json(booking);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Update a booking
async function updateBooking(req, res) {
    try {
        const booking = await bookingService.getBookingById(req.params.id);
        if (!booking || 
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization)) {
            return res.status(404).json({ message: "Booking not found" });
        }
        req.body.googleEventId = booking.googleEventId;
        const updated = await bookingService.updateBooking(req.params.id, req.body, req.user);
        if (!updated) {
            return res.status(404).json({ message: "Booking not found" });
        }
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Delete a booking
async function deleteBooking(req, res) {
    try {
        const booking = await bookingService.getBookingById(req.params.id);
        if (!booking || 
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization)) {
            return res.status(404).json({ message: "Booking not found" });
        }
        req.body.googleEventId = booking.googleEventId;
        const deleted = await bookingService.deleteBooking(req.params.id, booking, req.user);
        if (!deleted) {
            return res.status(404).json({ message: "Booking not found" });
        }
        res.json({ message: "Booking deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Reschedule a booking
async function rescheduleBooking(req, res) {
    try {
        const booking = await bookingService.getBookingById(req.params.id);
        if (!booking || 
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization)) {
            return res.status(404).json({ message: "Booking not found" });
        }
        const { newDate, newTime } = req.body;
        const rescheduled = await bookingService.rescheduleBooking(req.params.id, newDate, newTime, req.user);
        res.json(rescheduled);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

module.exports = {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBooking,
    deleteBooking,
    rescheduleBooking
};