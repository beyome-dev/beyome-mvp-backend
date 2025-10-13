const { waitlistService, mailerService } = require('../services');
const config = require('../config');

// Create waitlist entry
exports.createWaitlistEntry = async (req, res) => {
    try {
        await waitlistService.createWaitlistEntry(req.body);

        const { 
            firstName, lastName, 
            email, phone, 
            specialty, organization, 
            disableClientMail 
        } = req.body;
        // Send email to the internal team
        await mailerService.sendMail(
            config.team.email,  config.team.name, // Internal team email
            'New Waitlist Request',
            'waitlist-email', // Template name
            {
                firstName,
                lastName,
                email,
                phone,
                specialty: specialty || 'N/A',
                organization: organization || 'N/A',
            }
        );
        if (email && !disableClientMail) {
            await mailerService.sendMail(
                email, firstName,
                `Welcome Aboard, ${firstName} — Here’s How to Get Started`,
                'waitlist-welcome-email', // Template name
                { firstName }
            );
        }
        res.status(200).send({ message: 'Waitlist request submitted successfully' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get waitlist entry by ID
exports.getWaitlistEntryById = async (req, res) => {
    try {
        const entry = await waitlistService.getWaitlistEntryById(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
        res.json(entry);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Get all waitlist entries
exports.getAllWaitlistEntries = async (req, res) => {
    try {
        const entries = await waitlistService.getAllWaitlistEntries(req.query);
        res.json(entries);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Update waitlist entry
exports.updateWaitlistEntry = async (req, res) => {
    try {
        const entry = await waitlistService.updateWaitlistEntry(req.params.id, req.body);
        if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
        res.json(entry);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Delete waitlist entry
exports.deleteWaitlistEntry = async (req, res) => {
    try {
        const entry = await waitlistService.deleteWaitlistEntry(req.params.id);
        if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Convert waitlist entry to user
exports.convertWaitlistToUser = async (req, res) => {
    try {
        const { user, randomPassword } = await waitlistService.convertWaitlistToUser(
            req.params.id,
            req.user._id // assuming req.user is set by auth middleware
        );
        res.json({ user, randomPassword });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// Convert multiple waitlist entries to users
exports.convertMultipleWaitlistsToUsers = async (req, res) => {
    try {
        const results = await waitlistService.convertMultipleWaitlistsToUsers(
            req.body.waitlistIds,
            req.user._id // assuming req.user is set by auth middleware
        );
        res.json(results);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};