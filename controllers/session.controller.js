const sessionService = require("../services/session.service");

// Create a new session
async function createSession(req, res) {
    try {
        //TODO: Need to handle receptionist scenario where receptionist can create session for other therapistIds
        // Check if the user is a receptionist or org_admin
        req.body.organization = req.user.organization;
        req.body.therapistId = req.user._id;
        const session = await sessionService.createSession(req.body, req.user);
        res.status(201).json(session);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Get all sessions
async function getAllSessions(req, res) {
    try {
        let { page, limit } = req.query;
        let filter = req.mongoQuery
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;
        filter.therapistId = req.user._id;
        // filter.organization = req.user.organization;
        // if (req.user.userType === "receptionist" || req.user.userType === "org_admin") {
        //     delete filter.therapistId;
        // }
             
        const sessions = await sessionService.getAllSessions(filter, page, limit, req.user);
        res.json(sessions);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Get a session by ID
async function getSessionById(req, res) {
    try {
        const session = await sessionService.getSessionById(req.params.id, req.user);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if  (session.therapistId._id.toString() !== req.user._id.toString()) {
            return res.status(404).json({ message: "Session not found" });
        }
        // if((req.user.userType === "receptionist" || req.user.userType === "org_admin")) {
        //     if (session.organization && req.user.organization && session.organization.toString() !== req.user.organization.toString()) {
        //         return res.status(404).json({ message: "Session not found" });
        //     }
        // }
        res.json(session);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

// Update a session
async function updateSession(req, res) {
    try {
        const session = await sessionService.getSessionById(req.params.id, req.user);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if  (session.therapistId._id.toString() !== req.user._id.toString()) {
            return res.status(404).json({ message: "Session not found" });
        }
        // if((req.user.userType === "receptionist" || req.user.userType === "org_admin")) {
        //     if (session.organization && req.user.organization && session.organization.toString() !== req.user.organization.toString()) {
        //         return res.status(404).json({ message: "Session not found" });
        //     }
        // }
        delete req.body.organization; // Prevent organization change
        delete req.body.therapistId; // Prevent therapistId change
        
        const updated = await sessionService.updateSession(req.params.id, req.body, req.user);
        if (!updated) {
            return res.status(404).json({ message: "Session failed to update" });
        }
        res.json(updated);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
}

// Delete a session
async function deleteSession(req, res) {
    try {
        const session = await sessionService.getSessionById(req.params.id);
        if (!session) {
            return res.status(404).json({ message: "Session not found" });
        }
        if  (session.therapistId._id.toString() !== req.user._id.toString()) {
            return res.status(404).json({ message: "Session not found" });
        }
        // if((req.user.userType === "receptionist" || req.user.userType === "org_admin")) {
        //     if (session.organization && req.user.organization && session.organization.toString() !== req.user.organization.toString()) {
        //         return res.status(404).json({ message: "Session not found" });
        //     }
        // }
        const deleted = await sessionService.deleteSession(req.params.id, session, req.user);
        if (!deleted) {
            return res.status(404).json({ message: "Session not found" });
        }
        res.json({ message: "Session deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

async function generateNote(req, res) {
    try {
        const sessionId = req.params.id;
        const body = req.body;

        const note = await sessionService.genreateNote(sessionId, body, req.user);
        return res.status(200).json({ success: true, data: note });
    } catch (error) {
        console.error('Controller genreateNote error:', error);
        return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
    }

}


// ...existing code...

module.exports = {
    createSession,
    getSessionById,
    getAllSessions,
    updateSession,
    deleteSession,
    generateNote
};