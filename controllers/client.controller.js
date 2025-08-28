// const { getAuthUrl, getTokensFromCode } = require('../services/utilityServices/google/googleCalendar.service');
const { clientService } = require('../services');
const config = require('../config');

// @desc    Create a new client
// @route   POST /api/clients/
// @access  Private
module.exports.createClient = async (req, res) => {
    try {
      req.body.handler = req.user._id
      const byPassCheck = req.query.byPassCheck ? req.query.byPassCheck : false
      const client = await clientService.createClient(req.body, req.user._id, byPassCheck);
      res.status(201).json(client);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
};

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private/Admin
module.exports.getClients = async (req, res) => {
    try {
        let { page, limit, ...filters } = req.query;
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        filters = req.user.clientType === "receptionist" || req.user.clientType === "org_admin"
            ? { organization: req.user.organization, ...filters }
            : { handler: req.user._id, ...filters };
        const clients = await clientService.getClients(filters, page, limit, req.user);
        res.status(200).send(clients);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Get client by ID
// @route   GET /api/clients/:id
// @access  Private/Admin
module.exports.getClientById = async (req, res) => {
    try {
        if (req.params.id == 'info') {
            let { page, limit, ...filters } = req.query;
            page = parseInt(page) || 1;
            limit = parseInt(limit) || 10;

            filters = req.user.clientType === "receptionist" || req.user.clientType === "org_admin"
                ? { organization: req.user.organization, ...filters }
                : { handler: req.user._id, ...filters };
            const client = await clientService.getClientsWithData(filters, page, limit, req.user);
            res.status(201).json(client);
            return
        } else if (req.params.id == 'names') {
            let { page, limit, ...filters } = req.query;
            page = parseInt(page) || 1;
            limit = parseInt(limit) || 10;

            filters = req.user.clientType === "receptionist" || req.user.clientType === "org_admin"
                ? { organization: req.user.organization, ...filters }
                : { handler: req.user._id, ...filters };

            const client = await clientService.getClientNames(filters, page, limit);
            res.status(201).json(client);
            return
        }
        const client = await clientService.getClientById(req.params.id);
        if (client.googleTokens?.refresh_token) {
            client.hasCalendarSync = true
            client.googleTokens = undefined
        }
        res.status(200).send(client);
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc    Update user
// @route   PUT /api/clients/:id
// @access  Private/Admin
module.exports.updateClient = async (req, res) => {
    try {
        const user = await clientService.updateClientById(req.params.id, req.body, req.user);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc    Delete client
// @route   DELETE /api/clients/:id
// @access  Private/Admin
module.exports.deleteClient = async (req, res) => {
    try {
        await clientService.deleteClientById(req.params.id, req.user);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc    Get client names for handler
// @route   GET /api/clients/client-names
// @access  Private/Admin
module.exports.getClientNames = async (req, res) => {
    try {
        let { page, limit, ...filters } = req.query;
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        filters = req.user.clientType === "receptionist" || req.user.clientType === "org_admin"
            ? { organization: req.user.organization, ...filters }
            : { handler: req.user._id, ...filters };

        const client = await clientService.getClientNames(filters, page, limit);
        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports.getClientsWithInfo = async (req, res) => {
    try {
        let { page, limit, ...filters } = req.query;
        page = parseInt(page) || 1;
        limit = parseInt(limit) || 10;

        filters = req.user.clientType === "receptionist" || req.user.clientType === "org_admin"
            ? { organization: req.user.organization, ...filters }
            : { handler: req.user._id, ...filters };
        const client = await clientService.getClientsWithData(filters, page, limit, req.user);
        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports.getClientData = async (req, res) => {
    try {
        const client = await clientService.getClientDataByID(req.params.id, req.user);
        res.status(201).json(client);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc Upload profile picture
// @route POST /api/clients/:id/upload-consent-form
// @access Private
module.exports.uploadConsentForm = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send({ 
                message: 'No file uploaded or invalid file type. Please upload an doc/image file (PDF, MSDOC, JPEG, PNG, GIF, WebP) under 30MB.' 
            });
        }
        if (!req.params.id) {
             return res.status(400).send({ 
               message: 'Please specify the client details' 
            });
        }
        if (!req.query.type || (req.query.type != 'recapp' && req.query.type != 'therapist')) {
            return res.status(400).send({ 
                message: 'Please specify the type as either "recapp" or "therapist" in the query parameters.' 
            });
        }
        // Generate the file URL
        const baseUrl = req.protocol + '://' + req.get('host');
        const fileUrl = `${baseUrl}/api/uploads/${req.file.filename}`;

        // Update user's profile image URL
        const updatedClient = await clientService.updateConsentForm(req.params.id, fileUrl,req.query.type);

        res.status(200).send({
            message: 'Consent form uploaded successfully',
            fileUrl: fileUrl,
            user: updatedClient
        });
    } catch (error) {
        // Handle multer errors specifically
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send({ 
                message: 'File too large. Please upload an image file under 30MB.' 
            });
        }
        
        if (error.message && error.message.includes('Only image files')) {
            return res.status(400).send({ 
                message: 'Invalid file type. Please upload an image file (PDF, MSDOC, JPEG, PNG, GIF, WebP).' 
            });
        }
        
        res.status(400).send({ message: error.message });
    }
}