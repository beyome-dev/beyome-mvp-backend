const Session = require("../models/session");
const clientService = require('./client.service');
const userService = require('./user.service');
const calendatService = require("./utilityServices/google/googleCalendar.service");
const moment = require('moment-timezone');

// Create a new session
async function createSession(data, user) {
    const client = await clientService.getClientById(data.client);
    if (!client) {
        throw new Error("Client not found");
    }

    // Check for existing session with same date, time, and therapistId
    const existingSession = await Session.findOne({
        date: data.date,
        time: data.time,
        therapistId: data.therapistId,
        organization: data.organization,
        status: { $nin: ['cancelled', 'no-show', 'removed'] } // Exclude cancelled and no-show sessions
    });
    if (existingSession) {
        throw new Error("A session already exists for the given date and time.");
    }

    data.customerName = client.nickName ? client.nickName : client.firstName + " " + client.lastName;
    data.organization = user.organization;
    const session = new Session(data);
    if (user.googleTokens?.access_token) {
        const evenID = await calendatService.addSessionEvent(session, user.googleTokens)
        session.googleEventId = evenID;
    }
    return await session.save();
}

// Get a session by ID
async function getSessionById(id) {
    const session = await Session.findById(id)
        .populate("clientId", "firstName lastName tags")
        .populate("recordings.recordingId")

    return session;
}

// Get all sessions with optional filters
async function getAllSessions(filter = {}, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
    // if (filter.date === 'upcoming') {
    //     filter.date = { $gte: today };
    //     filter.status = { $nin: ['pending-review','generating-note','completed'] };
    // } else if (filter.date === 'past') {
    //     filter.$or = [
    //         { date: { $lt: today } },
    //         { date: today, status: { $in: ['pending-review','generating-note','completed'] } }
    //     ];
    // }

    const totalCount = await Session.countDocuments(filter);
    let sessions = await Session.find(filter)
        .populate("clientId", "firstName lastName tags")
        .sort({ sessionDate: -1 })
        .skip(skip)
        .limit(limit);

    return {
        sessions,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        totalCount
    };
}

// Update a session by ID
async function updateSession(id, data, user) {
    let session = await Session.findById(id);
    if ((data.date && data.date !== session.date) || (data.time && data.time !== session.time)) {
        const existingSession = await Session.findOne({
            date: data.date,
            time: data.time,
            therapistId: user._id,
            organization: data.organization,
            status: { $nin: ['cancelled', 'no-show', 'removed'] } // Exclude cancelled and no-show sessions
        });
        if (existingSession) {
            throw new Error("A session already exists for the given date and time.");
        }
        if (session.googleEventId !== "" && user.googleTokens?.access_token) {
            const evenID = await calendatService.patchSessionEvent(data.googleEventId, session, user.googleTokens)
            session.googleEventId = evenID;
        }
    }
    return await Session.findByIdAndUpdate(id, data, { new: true });
}

// Delete a session by ID
async function deleteSession(id, data, user) {
    if (data.googleEventId !== "" && user.googleTokens?.access_token) {
       await calendatService.removeSessionEvent(data.googleEventId, user.googleTokens)
    }
    return await Session.findByIdAndDelete(id);
}

// Delete a session by client ID and therapistId ID
async function deleteSessionForUser(clientId, user) {
    let sessions = await Session.find({ client: clientId, therapistId: user._id })
    sessions = sessions.map(session => {
        if (session.googleEventId !== "" && user.googleTokens?.access_token) {
            calendatService.removeSessionEvent(session.googleEventId, user.googleTokens)
        }
    });
    return await Session.deleteMany({client: clientId, therapistId: user._id});
}


module.exports = {
    createSession,
    getSessionById,
    getAllSessions,
    updateSession,
    deleteSession,
    deleteSessionForUser,
};
