const { Router } = require('express');
const { clientController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, clientValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

router.route('/')
    .get([requireAuth, hasRole('platform_admin')], clientController.getClients)
    .post([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin'),
        // celebrate(clientValidation.createClient, opts)
    ], clientController.createClient);

router.route('/:id')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], clientController.getClientById)
    .delete([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], clientController.deleteClient)
    .put([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin'),
        // celebrate(clientValidation.updateSchema, opts)
    ], clientController.updateClient);

router.route('/info')
    .get([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')
    ], clientController.getClientsWithInfo)

router.route('/:id/info')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], clientController.getClientData)

router.route('/names')
    .get([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')
    ], clientController.getClientNames)

module.exports = router;
