const { Router } = require('express');
const { configController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, clientValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;
const { createUploadMiddleware } = require('../middlewares/multer.middleware');

const roleMiddleware = hasRole('psychiatrist', 'therapist', 'org_admin');
const router = Router();

router.route('/')
    .get([requireAuth, roleMiddleware], configController.listConfigs)
    .post([
        requireAuth,
        roleMiddleware,
        // celebrate(clientValidation.createClient, opts)
    ],configController.createConfig);

router.route('/:id')
    .get([requireAuth, roleMiddleware], configController.getConfig)
    .put([requireAuth, roleMiddleware], configController.updateConfig)
    .delete([requireAuth, hasRole('platform_admin')], configController.deleteConfig);


module.exports = router;