const Checklist = require('../models/checklist');

// Create a checklist item
const createChecklistItem = async (data) => {
    const item = new Checklist(data);
    return await item.save();
};


// Get a ChecklistItem by ID
async function getChecklistItemById(id) {
    const booking = await Checklist.findById(id)
    return booking;
}
        
// Get all checklist items for a client
const getChecklistItems = async (filter, page, limit) => {
    const skip = (page - 1) * limit;
    return await Checklist.find(filter)
        .skip(skip)
        .limit(limit);
};

// Update a checklist item
const updateChecklistItem = async (id, data) => {
    if (data.completed) data.dateCompleted = new Date();
    return await Checklist.findByIdAndUpdate(id, data, { new: true });
};

// Delete a checklist item
const deleteChecklistItem = async (id) => {
    return await Checklist.findByIdAndDelete(id);
};

module.exports = {
    createChecklistItem,
    getChecklistItems,
    getChecklistItemById,
    updateChecklistItem,
    deleteChecklistItem
};