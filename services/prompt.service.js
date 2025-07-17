const { Prompt } = require('../models');

// Create a new prompt
const createPrompt = async (data) => {
    const prompt = new Prompt(data);
    return await prompt.save();
};
// Get all approved prompts with pagination and filter
const getPrompts = async ({ page = 1, limit = 10, filter = {}, fields = null } = {}) => {
    const skip = (page - 1) * limit;
    let query = Prompt.find(filter).skip(skip).limit(limit);
    if (fields) {
        query = query.select(fields);
    }
    const prompts = await query;
    const total = await Prompt.countDocuments(filter);
    return {
        prompts,
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
    deletePrompt
};
