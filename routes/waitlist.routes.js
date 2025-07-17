const { Router } = require('express');
const { waitlistController } = require('../controllers');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');

const router = Router();

router.route('/')
    .get([requireAuth, hasRole('platform_admin')], waitlistController.getAllWaitlistEntries)
    .post(celebrate(userValidation.waitlistSchema, opts), waitlistController.createWaitlistEntry);

router.route('/convert-multiple')
    .post([requireAuth, hasRole('platform_admin')], waitlistController.convertMultipleWaitlistsToUsers);

router.route('/:id')
    .get([requireAuth, hasRole('platform_admin')], waitlistController.getWaitlistEntryById)
    .put([requireAuth, hasRole('platform_admin')], waitlistController.updateWaitlistEntry)
    .delete([requireAuth, hasRole('platform_admin')], waitlistController.deleteWaitlistEntry);

router.route('/:id/convert')
    .post([requireAuth, hasRole('platform_admin')], waitlistController.convertWaitlistToUser);

module.exports = router;