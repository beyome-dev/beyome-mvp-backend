const Booking = require("../models/booking");
const userService = require("./user.service");
const calendatService = require("./utilityServices/google/googleCalendar.service");

// Create a new booking
async function createBooking(data, user) {
    const client = await userService.getUserById(data.client);
    if (!client) {
        throw new Error("Client not found");
    }
    console.log("Client found:", client);
    data.customerName = client.firstName + " " + client.lastName;
    const booking = new Booking(data);
    if (user.googleTokens?.access_token) {
        const evenID = await calendatService.addBookingEvent(booking, user.googleTokens)
        booking.googleEventId = evenID;
    }
    return await booking.save();
}

// Get a booking by ID
async function getBookingById(id, user) {
    const booking = await Booking.findById(id)
        .populate("client", "firstName lastName")
        .populate("handler", "firstName lastName")
        .populate("dictationNote");

    return booking;
}

// Get all bookings with optional filters
async function getAllBookings(filter = {}, user) {
    const bookings = await Booking.find(filter)
        .populate("client", "firstName lastName")
        .populate("handler", "firstName lastName")
        .populate("dictationNote");

    return bookings.map(booking => {
        const bookingObj = booking.toObject();
        bookingObj.generatedDictationNote =
            typeof booking.dictationNote?.outputContent === 'string' && booking.dictationNote.outputContent.trim() !== '';
        delete bookingObj.dictationNote;
        return bookingObj;
    });
}

// Update a booking by ID
async function updateBooking(id, data, user) {
    if (data.googleEventId !== "" && user.googleTokens?.access_token) {
        const evenID = await calendatService.patchBookingEvent(data.googleEventId, booking, user.googleTokens)
        booking.googleEventId = evenID;
    }
    return await Booking.findByIdAndUpdate(id, data, { new: true });
}

// Delete a booking by ID
async function deleteBooking(id, data, user) {
    if (data.googleEventId !== "" && user.googleTokens?.access_token) {
        const evenID = await calendatService.patchBookingEvent(data.googleEventId, booking, user.googleTokens)
        booking.googleEventId = evenID;
    }
    return await Booking.findByIdAndDelete(id);
}

// Reschedule a booking
async function rescheduleBooking(id, newDate, newTime, user) {
    // Check if a booking already exists for the handler at the new date and time
    const existingBooking = await Booking.findOne({ date: newDate, time: newTime });
    if (existingBooking) {
        throw new Error("A booking already exists for the given date and time.");
    }
    if (existingBooking.googleEventId !== "" && user.googleTokens?.access_token) {
        const evenID = await calendatService.patchBookingEvent(data.googleEventId, booking, user.googleTokens)
        booking.googleEventId = evenID;
    }
    // Update the booking's date, time, and status
    return await Booking.findByIdAndUpdate(
        id,
        {
            date: newDate,
            time: newTime,
            status: "rescheduled"
        },
        { new: true }
    );
}

// Link a new note to a booking
async function linkNoteToBooking(bookingId, noteId) {
    return await Booking.findByIdAndUpdate(
        bookingId,
        { dictationNote: noteId },
        { new: true }
    );
}

module.exports = {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBooking,
    deleteBooking,
    rescheduleBooking,
    linkNoteToBooking
};
