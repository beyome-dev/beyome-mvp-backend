const {
    createChecklistItem,
    getChecklistItems,
    updateChecklistItem,
    deleteChecklistItem,
    getChecklistItemById
} = require('../services/checklist.service');

// Create
exports.createChecklistItem = async (req, res) => {
    try {
        const item = await createChecklistItem(req.body);
        res.status(201).json(item);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Read with pagination, advanced filter, and keyword search
exports.getChecklistItems = async (req, res) => {
    try {
        const { client, page = 1, limit = 10, keyword } = req.query;

        let filter = req.mongoQuery

        if (!client) {
            throw new Error("Require client id") 
        }
        filter.client = client 

        // Keyword search for 'item' field
        if (keyword) {
            filter.item = { $regex: keyword, $options: 'i' };
        }

        const items = await getChecklistItems(filter, page, limit);

        res.status(200).json(items);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Update
exports.updateChecklistItem = async (req, res) => {
    try {
        // Prevent updating the 'client' field to maintain data integrity
        if ('client' in req.body) {
            delete req.body.client;
                // Optionally, you can add a validation error:
                // return res.status(400).json({ error: "Updating 'client' field is not allowed." });
        }
        const item = await updateChecklistItem(req.params.id, req.body);
        if (!item) return res.status(404).json({ error: 'Checklist item not found' });
        res.status(200).json(item);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete
exports.deleteChecklistItem = async (req, res) => {
    try {
        const item = await deleteChecklistItem(req.params.id);
        if (!item) return res.status(404).json({ error: 'Checklist item not found' });
        res.status(200).json({ message: 'Checklist item deleted' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Fetch by Id
exports.getChecklistItemById = async (req, res) => {
    try {
        const user = await getChecklistItemById(req.params.id);
        res.status(200).send(user);
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}