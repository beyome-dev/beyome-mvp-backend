const { Note, Prompt, Session } = require("../models");
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

        const sessionObj = session.toObject();
    // combine transcripts into multiline strings (each recording on a new line)
    sessionObj.sessionTranscript = (sessionObj.recordings || [])
        .filter(r => r.recordingType === 'session_recording' && r.recordingId?.transcriptionText)
        .map(r => r.recordingId.transcriptionText.trim())
        .join('\n');

    sessionObj.dictationTranscript = (sessionObj.recordings || [])
        .filter(r => r.recordingType === 'dictation' && r.recordingId?.transcriptionText)
        .map(r => r.recordingId.transcriptionText.trim())
        .join('\n');
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
    // if (data.googleEventId !== "" && user.googleTokens?.access_token) {
    //    await calendatService.removeSessionEvent(data.googleEventId, user.googleTokens)
    // }
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

async function genreateNote(id, param, user) {

    const { templateId } = param;
    const therapistId = user._id;
    const session = await Session.findOne({
        _id: sessionId,
        therapistId
    }).populate("recordings.recordingId")
    if (!session) {
        throw new Error('Session not found');
    }

    let transcriptInputData = [];
    let dictationInputData = [];
    let combinedContent = '';

    for (const rec of session.recordings) {
        if (rec.recordingType === 'session_recording' && rec.recordingId.transcriptionStatus === 'completed') {
            transcriptInputData.push({
                contentType: 'text',
                content: rec.recordingId.transcriptionText
            });
            combinedContent += 'Session Recording: ' + rec.recordingId.transcriptionText + '\n\n';
        }   
        if (rec.recordingType === 'dictation' && rec.recordingId.transcriptionStatus === 'completed') {
            dictationInputData.push({
                contentType: 'text',
                content: rec.recordingId.transcriptionText
            });
            combinedContent += 'Dictation: ' + rec.recordingId.transcriptionText + '\n\n';
        }   
    }

    if (transcriptInputData.length === 0 && dictationInputData.length === 0) {
        throw new Error('No valid transcription or dictation recordings found for this session');
    }

    const template = await Prompt.findById(templateId);
    if (!template) {
        throw new Error('Template not found');
    }
    let note = new Note({
        title: `Clinical Note for ${clientData.firstName} ${clientData.lastName}`,
        noteType: template.formatName,
        inputContent: file.filename,
        tags: ["soap", `${clientData.firstName} ${clientData.lastName}`],
        sessionId: session._id,
        user: user._id,
        client: clientData._id,
        organization: user.organization,
        prompt: template._id,

        content: {
            subjective: "Generating...",
            objective: "Generating...",
            assessment: "Generating...",
            plan: "Generating...",
            data: "Generating...",
            analysis: "Generating...",
            customSections: [
        //         {
        //     label: String,
        //     content: String,
        //     order: Number
        // }
            ]
        },
        version: 1,
        rawContent: combinedContent,
        status: "pending",
        generatedFromRecordings: session.recordings.map(rec => ({
            recordingId: rec.recordingId._id,
            recordingType: rec.recordingType,
            usedAt: new Date()
        })),
    });


     // AI metadata
//   aiGenerated: { type: Boolean, default: false },
//   aiMetadata: {
//     model: String,
//     promptId: Schema.Types.ObjectId,
//     generatedAt: Date,
//     editedByUser: { type: Boolean, default: false },
//     confidence: Number,
//     tokensUsed: Number
//   },
}


    

module.exports = {
    createSession,
    getSessionById,
    getAllSessions,
    updateSession,
    deleteSession,
    deleteSessionForUser,
};
