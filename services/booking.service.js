const Booking = require("../models/booking");
const userService = require("./user.service");
const calendatService = require("./utilityServices/google/googleCalendar.service");
const moment = require('moment-timezone');

// Create a new booking
async function createBooking(data, user) {
    const client = await userService.getUserById(data.client);
    if (!client) {
        throw new Error("Client not found");
    }

    // Check for existing booking with same date, time, and handler
    const existingBooking = await Booking.findOne({
        date: data.date,
        time: data.time,
        handler: data.handler,
        organization: data.organization,
    });
    if (existingBooking) {
        throw new Error("A booking already exists for the given date and time.");
    }

    data.customerName = client.firstName + " " + client.lastName;
    data.organization = user.organization;
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
        .populate("client", "firstName lastName tags")
        .populate("handler", "firstName lastName")
        .populate("dictationNote");

    return booking;
}

// Get all bookings with optional filters
async function getAllBookings(filter = {}, page = 1, limit = 10, user) {
    const skip = (page - 1) * limit;

    const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    if (filter.date === 'upcoming') {
        filter.date = { $gte: today };
        filter.status = { $nin: ['pending-review','generating-note','completed'] };
    } else if (filter.date === 'past') {
        filter.$or = [
            { date: { $lt: today } },
            { date: today, status: { $in: ['pending-review','generating-note','completed'] } }
        ];
    }

    for (const key in filter) {
        if (key === 'date' && filter[key]) {
            if (typeof filter[key] === 'object') {
                for (const operator in filter[key]) {
                    if (['$in', '$nin', '$gte', '$gt', '$lt', '$lte'].includes(operator)) {
                        if (Array.isArray(filter[key][operator])) {
                            filter[key][operator] = filter[key][operator].map(date => typeof date === 'string' ? date : moment(date).format('YYYY-MM-DD'));
                        } else {
                            filter[key][operator] = typeof filter[key][operator] === 'string' ? filter[key][operator] : moment(filter[key][operator]).format('YYYY-MM-DD');
                        }
                    }
                }
            } else {
                filter[key] = typeof filter[key] === 'string' ? filter[key] : moment(filter[key]).format('YYYY-MM-DD');
            }
        }
        if (key === 'time' && filter[key]) {
             if (typeof filter[key] === 'object') {
                for (const operator in filter[key]) {
                    if (['$in', '$nin', '$gte', '$gt', '$lt', '$lte'].includes(operator)) {
                        if (Array.isArray(filter[key][operator])) {
                            filter[key][operator] = filter[key][operator].map(time => typeof time === 'string' ? time : moment(time).format('HH:mm'));
                        } else {
                            filter[key][operator] = typeof filter[key][operator] === 'string' ?  filter[key][operator] : moment(filter[key][operator]).format('HH:mm');
                        }
                    }
                }
            } else {
                filter[key] = typeof filter[key] === 'string' ? filter[key] : moment(filter[key]).format('HH:mm');
            }
        }
    }
    let bookings = await Booking.find(filter)
        .populate("client", "firstName lastName tags")
        .populate("handler", "firstName lastName")
        .populate("dictationNote")
        .sort({ date: -1, time: -1 })
        .skip(skip)
        .limit(limit);

    bookings = bookings.map(booking => {
        const bookingObj = booking.toObject();
        bookingObj.generatedDictationNote =
            typeof booking.dictationNote?.outputContent === 'string' && booking.dictationNote.outputContent.trim() !== '';
        delete bookingObj.dictationNote;
        return bookingObj;
    });
    const totalCount = await Booking.countDocuments(filter);

    return {
        bookings,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        totalCount
    };
}

// Update a booking by ID
async function updateBooking(id, data, user) {
    const booking = await Booking.findByIdAndUpdate(id, data, { new: true });
    if (data.googleEventId !== "" && user.googleTokens?.access_token
        && (data.date !== booking.date || data.time !== booking.time 
        || data.visitType !== booking.visitType)) {
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
    existingBooking.date = newDate
    existingBooking.time = newTime
    existingBooking.status = "rescheduled"
    await existingBooking.save();
    if (existingBooking.googleEventId !== "" && user.googleTokens?.access_token) {
        const evenID = await calendatService.patchBookingEvent(data.googleEventId, booking, user.googleTokens)
        booking.googleEventId = evenID;
    }
    // Update the booking's date, time, and status
    return existingBooking;
}

// Link a new note to a booking
async function linkNoteToBooking(bookingId, noteId) {
    return await Booking.findByIdAndUpdate(
        bookingId,
        { dictationNote: noteId },
        { new: false }
    );
}

// Check In: update checkInTime and status
async function checkInBooking(id, checkInTime) {
    return await Booking.findByIdAndUpdate(
        id,
        { checkInTime, status: "in-progress" },
        { new: true }
    );
}

// Check Out: update checkOutTime and status
async function checkOutBooking(id, checkOutTime) {
    return await Booking.findByIdAndUpdate(
        id,
        { checkOutTime, status: "pending-review" },
        { new: true }
    );
}

// Dictate Note: save audio, update booking with note id
async function dictateNote(bookingId, file, user) {
    const booking = await Booking.findById(bookingId);
    if (!booking) throw new Error("Booking not found");

    // You may want to validate user permissions here

    // Save audio and generate note
    const noteService = require("./note.service");
    const noteResult = await noteService.saveAudio(file, booking.client, bookingId, true, user);
    if (!noteResult) throw new Error("Failed to process recording");
    if (!noteResult.note) throw new Error("Failed to generate note");
    booking.dictationNote = noteResult.note;

    return booking;
}

module.exports = {
    createBooking,
    getBookingById,
    getAllBookings,
    updateBooking,
    deleteBooking,
    rescheduleBooking,
    linkNoteToBooking,
    checkInBooking,
    checkOutBooking,
    dictateNote,
};
