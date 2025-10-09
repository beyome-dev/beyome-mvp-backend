const organizationService = require('../services/organization.service');

// Create Organization
exports.createOrganization = async (req, res) => {
    try {
        const organization = await organizationService.createOrganization(req.body);
        res.status(201).json(organization);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get Organization by ID
exports.getOrganizationById = async (req, res) => {
    try {
        const organization = await organizationService.getOrganizationById(req.params.id);
        res.status(200).json(organization);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Update Organization
exports.updateOrganization = async (req, res) => {
    try {
        const organization = await organizationService.updateOrganization(req.params.id, req.body);
        res.status(200).json(organization);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Delete Organization
exports.deleteOrganization = async (req, res) => {
    try {
        await organizationService.deleteOrganization(req.params.id);
        res.status(200).json({ message: 'Organization deleted' });
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// List Organizations
exports.listOrganizations = async (req, res) => {
    try {
        const organizations = await organizationService.listOrganizations(req.user, req.query);
        res.status(200).json(organizations);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};