const { Router } = require('express');
const organizationController = require('../controllers/organization.controller');
const { authMiddleware, queryMiddleware } = require('../middlewares');

const { requireAuth, hasRole } = authMiddleware;

// Admin middleware - only platform_admin can access these routes
const adminMiddleware = hasRole('platform_admin');

const router = Router();

// CRUD routes with admin middleware (except update)
router.route('/')
    .get([
        requireAuth,
        queryMiddleware,
        adminMiddleware
    ], organizationController.listOrganizations)
    .post([
        requireAuth,
        adminMiddleware
    ], organizationController.createOrganization);

router.route('/:id')
    .get([
        requireAuth,
        adminMiddleware
    ], organizationController.getOrganizationById)
    .put([
        requireAuth
        // No admin middleware - allows role-based field restrictions
    ], organizationController.updateOrganization)
    .delete([
        requireAuth,
        adminMiddleware
    ], organizationController.deleteOrganization);

// Route to attach organizationID to user
router.route('/:id/attach-user/:userId')
    .post([
        requireAuth,
        adminMiddleware
    ], organizationController.attachOrganizationToUser);

module.exports = router;
