// prompt.controller.js

const {
    createPrompt,
    getPrompts,
    getPromptById,
    updatePrompt,
    deletePrompt
} = require('../services/prompt.service');

// Create a new prompt
exports.createPrompt = async (req, res) => {
    try {
        req.body.createdBy = req.user._id
        const prompt = await createPrompt(req.body);
        res.status(201).json(prompt);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get all approved prompts with pagination and filter
exports.getPrompts = async (req, res) => {
    try {
        let { page, limit, ...filter } = req.query;
        let fields = null;
        if (!req.user.isAdmin) {
            filter = { approved: true, ...filter };
            fields = 'formatName'; // Only return the name field for non-admins
        }
        const result = await getPrompts({
            page: Number(page) || 1,
            limit: Number(limit) || 10,
            filter,
            fields
        });
        res.status(200).json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get a single prompt by ID
exports.getPromptById = async (req, res) => {
    try {
        const prompt = await getPromptById(req.params.id);
        if (!prompt) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        res.status(200).json(prompt);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Update a prompt by ID
exports.updatePrompt = async (req, res) => {
    try {
        const prompt = await updatePrompt(req.params.id, req.body);
        if (!prompt) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        res.status(200).json(prompt);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete a prompt by ID
exports.deletePrompt = async (req, res) => {
    try {
        const prompt = await deletePrompt(req.params.id);
        if (!prompt) {
            return res.status(404).json({ error: 'Prompt not found' });
        }
        res.status(200).json({ message: 'Prompt deleted successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
