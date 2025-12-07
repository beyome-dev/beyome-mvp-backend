const { Router } = require('express');
const { clientController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, clientValidation } = require('../validations');
const { authMiddleware, queryMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;
const { createUploadMiddleware } = require('../middlewares/multer.middleware');

const router = Router();

router.route('/')
    .get([requireAuth, queryMiddleware, hasRole('platform_admin')], clientController.getClients)
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

    // Profile picture upload route with file size and type limits
router.route('/:id/upload-consent-form')
    .post([requireAuth, createUploadMiddleware({
        allowedMimeTypes: [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
            'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ],
        allowedExtensions: [
            '.jpg', '.jpeg', '.png', '.gif', '.webp',
            '.pdf', '.doc', '.docx'
        ],
        limits: {
            fileSize: 30 * 1024 * 1024, // 30MB
            files: 2
        }
    }).single("file")], clientController.uploadConsentForm);
module.exports = router;
