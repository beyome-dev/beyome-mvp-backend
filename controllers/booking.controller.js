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
        let { page, limit, ...filters } = req.query;
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        filter = req.user.userType === "receptionist" || req.user.userType === "org_admin"
            ? { organization: req.user.organization, ...filters }
            : { handler: req.user._id, ...filters };
             
        const bookings = await bookingService.getAllBookings(filter, page, limit, req.user);
        res.json(bookings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Get a booking by ID
async function getBookingById(req, res) {
    try {
        const booking = await bookingService.getBookingById(req.params.id);
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
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id.toString()) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization)) {
            return res.status(404).json({ message: "Booking not found" });
        }
        req.body.googleEventId = booking.googleEventId;
        const updated = await bookingService.updateBooking(req.params.id, req.body, req.user);
        if (!updated) {
            return res.status(404).json({ message: "Booking failed to update" });
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
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id.toString()) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization.toString())) {
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
            ((req.user.userType !== "receptionist" && req.user.userType !== "org_admin") && booking.handler._id.toString() !== req.user._id.toString()) ||
            ((req.user.userType === "receptionist" || req.user.userType === "org_admin") && booking.organization.toString() !== req.user.organization.toString())) {
            return res.status(404).json({ message: "Booking not found" });
        }
        const { newDate, newTime } = req.body;
        const rescheduled = await bookingService.rescheduleBooking(req.params.id, newDate, newTime, req.user);
        res.json(rescheduled);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Check In
async function checkInBooking (req, res) {
    try {
        const checkInTime = new Date().toISOString().substring(11, 16); // "HH:MM"
        let booking = await bookingService.getBookingById(req.params.id);
        if (booking.status != "scheduled") {
            throw new Error("Booking is already checked in.");
        }
        booking = await bookingService.checkInBooking(req.params.id, checkInTime);
        res.json(booking);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Check Out
async function checkOutBooking (req, res) {
    try {
        const checkOutTime = new Date().toISOString().substring(11, 16); // "HH:MM"
        let booking = await bookingService.getBookingById(req.params.id);
        if (booking.status != "in-progress") {
            throw new Error("Booking is not checked in.");
        }
        booking = await bookingService.checkOutBooking(req.params.id, checkOutTime);
        res.json(booking);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Dictate Note
async function dictateNote (req, res) {
    try {
        // Assuming you're using multer for file upload and file is in req.file
        const booking = await bookingService.dictateNote(req.params.id, req.file, req.user);
        res.json(booking);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ...existing code...

module.exports = {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBooking,
    deleteBooking,
    rescheduleBooking,
    checkInBooking,
    checkOutBooking,
    dictateNote
};