const { Router } = require('express');
const { promptController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { client } = require('../config');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

router.route('/')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], promptController.getPrompts)
    .post([
        requireAuth,
        hasRole('platform_admin'),
    ], promptController.createPrompt);
    
router.route('/enabled')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], promptController.getEnabledPrompts)

router.route('/profile')
    .get([requireAuth], (req, res) => res.status(404).send('Not implemented'))
    .put([
        requireAuth,
        celebrate(userValidation.updateSchema, opts),
    ], (req, res) => res.status(404).send('Not implemented'));

router.route('/:id')
    .get([requireAuth, hasRole('platform_admin')], promptController.getPromptById)
    .delete([requireAuth, hasRole('platform_admin')], promptController.deletePrompt)
    .put([
        requireAuth,
        hasRole('platform_admin')
    ], promptController.updatePrompt);

module.exports = router;
