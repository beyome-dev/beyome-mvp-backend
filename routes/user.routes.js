const { Router } = require('express');
const { userController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

router.route('/')
    .get([requireAuth, hasRole('platform_admin')], userController.getUsers)
    .post([
        requireAuth,
        hasRole('platform_admin'),
        celebrate(userValidation.registerSchema, opts)
    ], userController.createUser);


router.route('/profile')
    .get(requireAuth, userController.getUserProfile)
    .put([
        requireAuth,
        celebrate(userValidation.updateSchema, opts),
    ], userController.updateUserProfile);


router.route('/get-activation-email')
    .get(celebrate(userValidation.sendRequestEmailSchema, opts), userController.sendConfirmEmail);

router.route('/confirmation/:token')
    .get(userController.confirmEmail);

router.route('/:id')
    .get([requireAuth, hasRole('platform_admin')], userController.getUserById)
    .delete([requireAuth, hasRole('platform_admin')], userController.deleteUser)
    .put([
        requireAuth,
        hasRole('platform_admin'),
        celebrate(userValidation.updateSchema, opts)
    ], userController.updateUser);

module.exports = router;
