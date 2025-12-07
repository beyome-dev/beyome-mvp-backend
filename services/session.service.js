const { Note, Prompt, Session, Recording, Client } = require("../models");
const clientService = require('./client.service');
const userService = require('./user.service');
const calendatService = require("./utilityServices/google/googleCalendar.service");
const { generateNote } = require("./aiProcessing/noteGeneration");
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
async function getSessionById(id, user) {
    const session = await Session.findById(id)
        .populate("clientId", "firstName lastName tags")
        .populate("recordings.recordingId");

    const sessionObj = session.toObject();

    // Remove sensitive fields from each recording (if any)
    if (Array.isArray(sessionObj.recordings) && (!user || user.userType !== "platform_admin")) {
        sessionObj.recordings = sessionObj.recordings.map(recording => {
            if (recording && recording.recordingId && typeof recording.recordingId === "object") {
                // Create a shallow clone so we don't mutate the underlying Mongoose document
                const sanitizedRecording = { ...recording };
                sanitizedRecording.recordingId = { ...recording.recordingId };

                // Remove potentially sensitive fields
                delete sanitizedRecording.recordingId.filePath
                delete sanitizedRecording.recordingId.audioUrl
                delete sanitizedRecording.recordingId.audioKey
                delete sanitizedRecording.recordingId.duration
                delete sanitizedRecording.recordingId.fileSize
                delete sanitizedRecording.recordingId.transcriptionAttempts;
                delete sanitizedRecording.recordingId.transcriptionError
                delete sanitizedRecording.recordingId.retryConfig
                delete sanitizedRecording.recordingId.summaryMetadata
                delete sanitizedRecording.recordingId.qualityMetrics

                //Metadata
                delete sanitizedRecording.recordingId.transcriptionMetadata.provider
                delete sanitizedRecording.recordingId.transcriptionMetadata.jobId
                delete sanitizedRecording.recordingId.transcriptionMetadata.model
                delete sanitizedRecording.recordingId.transcriptionMetadata.attemptNumber
                delete sanitizedRecording.recordingId.transcriptionMetadata.toolsAttempted
                delete sanitizedRecording.recordingId.transcriptionMetadata.batchProcessed
                delete sanitizedRecording.recordingId.transcriptionMetadata.batchInfo

                return sanitizedRecording;
            }
            return recording;
        });
    }

    //Temporary fix for session transcript, will be removed later and use the below code
    sessionObj.sessionTranscript = (sessionObj.recordings || [])
        .filter(r => r.recordingId?.transcriptionText)
        .map(r => r.recordingId.transcriptionText.trim())
        .join('\n');
    
    // Combine transcripts into multiline strings (each recording on a new line)
    // sessionObj.sessionTranscript = (sessionObj.recordings || [])
    //     .filter(r => r.recordingType === 'session_recording' && r.recordingId?.transcriptionText)
    //     .map(r => r.recordingId.transcriptionText.trim())
    //     .join('\n');

    // sessionObj.dictationTranscript = (sessionObj.recordings || [])
    //     .filter(r => r.recordingType === 'dictation' && r.recordingId?.transcriptionText)
    //     .map(r => r.recordingId.transcriptionText.trim())
    //     .join('\n');

    return sessionObj;
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
    if (data.clientId && data.clientId !== session.clientId.toString()) {
        const client = await Client.findById(session.clientId);
        if (client && client.status === 'unknown') {
            await Client.findByIdAndDelete(session.clientId);
        }
    }
    return await Session.findByIdAndUpdate(id, data, { new: true });
}

// Delete a session by ID
async function deleteSession(id, user) {
    // if (data.googleEventId !== "" && user.googleTokens?.access_token) {
    //    await calendatService.removeSessionEvent(data.googleEventId, user.googleTokens)
    // }
    let session = await Session.findById(id);
    const client = await Client.findById(session.clientId);
        if (client && client.status === 'unknown') {
            await Client.findByIdAndDelete(session.clientId);
        }
    await Recording.deleteMany({ sessionId: id });
    return await Session.findByIdAndDelete(id);
}

// Delete a session by client ID and therapistId ID
async function deleteSessionForUser(clientId, user) {

    const sessions = await Session.find({ clientId, therapistId: user._id }).select('_id');
    const sessionIds = sessions.map(s => s._id);
    if (sessionIds.length > 0) {
        await Recording.deleteMany({ sessionId: { $in: sessionIds } });
    }
    return await Session.deleteMany({ clientId: clientId, therapistId: user._id });
}

async function genreateNote(sessionId, body, user) {

    const { templateId } = body;
    const therapistId = user._id;
    const session = await Session.findOne({
        _id: sessionId,
        therapistId
    }).populate("clientId", "firstName lastName tags")
    .populate("recordings.recordingId")

    if (!session) {
        throw new Error('Session not found');
    }

    const template = await Prompt.findById(templateId);
    if (!template) {
        throw new Error('Template not found');
    }

    const note = await generateNote(session, templateId, user);

    return Note.create(note);
}

    

module.exports = {
    createSession,
    getSessionById,
    getAllSessions,
    updateSession,
    deleteSession,
    deleteSessionForUser,
    genreateNote
};
