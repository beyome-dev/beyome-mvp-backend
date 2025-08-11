const { Router } = require('express');
const { userController } = require('../controllers');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const { authMiddleware } = require('../middlewares');
const { client } = require('../config');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

router.route('/')
    .get([requireAuth, hasRole('platform_admin')], userController.getUsers)
    .post([
        requireAuth,
        hasRole('platform_admin'),
        celebrate(userValidation.registerSchema, opts)
    ], userController.createUser);

// Discoverable users routes (public access)
router.route('/discoverable')
    .get(userController.getDiscoverableUsers);

router.route('/discoverable/:id')
    .get(userController.getUserProfileById);

router.route('/profile')
    .get([requireAuth], userController.getUserProfile)
    .put([
        requireAuth,
        celebrate(userValidation.updateSchema, opts),
    ], userController.updateUserProfile);


router.route('/get-activation-email')
    .get([celebrate(userValidation.sendRequestEmailSchema, opts)], userController.sendConfirmEmail);

router.route('/confirmation/:token')
    .get([userController.confirmEmail]);

router.route('/:id')
    .get([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], userController.getUserById)
    .delete([requireAuth, hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin')], userController.deleteUser)
    .put([
        requireAuth,
        hasRole('psychiatrist', 'therapist', 'receptionist', 'org_admin'),
        celebrate(userValidation.updateSchema, opts)
    ], userController.updateUser);

router.route('/google-calendar/auth-url')
    .get(requireAuth, userController.getGoogleAuthUrl);

router.route('/google-calendar/save-tokens')
    .post([
        requireAuth,
        celebrate(userValidation.googleTokenSchema, opts)
    ], userController.saveGoogleTokens);

router.route('/google-calendar/remove-tokens')
    .post([
        requireAuth,
    ], userController.removeGoogleTokens);

router.route('/password-reset/first-login')
    .post([requireAuth, celebrate(userValidation.resetPasswordSchema, opts)], userController.firstTimePasswordReset);

router.route('/change-password/')
    .post([requireAuth, celebrate(userValidation.changePasswordSchema, opts)], userController.firstTimePasswordReset);

module.exports = router;
