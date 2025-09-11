const { Prompt } = require('../models');
const configService = require('./config.service')

// Create a new prompt
const createPrompt = async (data) => {
    const prompt = new Prompt(data);
    return await prompt.save();
};
// Get all approved prompts with pagination and filter
const getPrompts = async ({ page = 1, limit = 10, filter = {}, fields = null } = {}, user) => {
    const skip = (page - 1) * limit;
    let query = Prompt.find(filter).skip(skip).limit(limit);
    if (fields) {
        query = query.select(fields);
    }
    const prompts = await query;
    const config = await configService.GetUserConfig(user._id);

    const promptIdsSet = new Set((config.promptIds || []).map(id => id.toString()));
    const promptsWithEnabled = prompts.map(prompt => {
        const enabled = promptIdsSet.has(prompt._id.toString());
        return { ...prompt.toObject(), enabled };
    });

    const total = await Prompt.countDocuments(filter);
    return {
        prompts: promptsWithEnabled,
        total,
        page,
        limit
    };
};

const getEnabledPrompts = async ({ page = 1, limit = 10, filter = {}, fields = null } = {}, user) => {
    const skip = (page - 1) * limit;

    const config = await configService.GetUserConfig(user._id);
    filter._id = { $in: config.promptIds }

    let query = Prompt.find(filter).skip(skip).limit(limit);
    if (fields) {
        query = query.select(fields);
    }
    const prompts = await query;

    const total = await Prompt.countDocuments(filter);
    return {
        prompts: prompts,
        total,
        page,
        limit
    };
};

// Get a single prompt by ID
const getPromptById = async (id) => {
    return await Prompt.findById(id);
};

// Update a prompt by ID
const updatePrompt = async (id, data) => {
    return await Prompt.findByIdAndUpdate(id, data, { new: true });
};

// Delete a prompt by ID
const deletePrompt = async (id) => {
    return await Prompt.findByIdAndDelete(id);
};

module.exports = {
    createPrompt,
    getPrompts,
    getPromptById,
    updatePrompt,
    deletePrompt,
    getEnabledPrompts,
};
