const { Router } = require('express');
const checklistController = require('../controllers/checklist.controller');
const { celebrate } = require('celebrate');
const { opts, clientValidation } = require('../validations');
const { authMiddleware, queryMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

router.route('/')
    .get([ 
        requireAuth, 
        queryMiddleware,
    ], checklistController.getChecklistItems)
    .post([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin'),
        // celebrate(clientValidation.createClient, opts)
    ], checklistController.createChecklistItem);

router.route('/:id')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], checklistController.getChecklistItemById)
    .delete([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], checklistController.deleteChecklistItem)
    .put([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin'),
        // celebrate(clientValidation.updateSchema, opts)
    ], checklistController.updateChecklistItem);

module.exports = router;
