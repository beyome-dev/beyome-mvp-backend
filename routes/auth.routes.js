const { Router } = require('express');
const { authController } = require('../controllers');
const passport = require('passport');
const { celebrate } = require('celebrate');
const { opts, userValidation } = require('../validations');
const bookingController = require('../controllers/booking.controller');
const { authMiddleware } = require('../middlewares');
const { requireAuth, hasRole } = authMiddleware;

const router = Router();

// local auth
router.route('/register')
    .post([
        requireAuth, 
        hasRole('platform_admin'),
        celebrate(userValidation.registerSchema, opts)
    ], authController.registerUser);

router.route('/login')
    .post(celebrate(userValidation.loginSchema, opts), authController.loginWithEmailAndPassword);

// password reset
router.route('/password-reset/get-code')
    .post(celebrate(userValidation.sendRequestEmailSchema, opts), authController.sendResetPasswordEmail);

router.route('/password-reset/verify/:token')
    .post(celebrate(userValidation.resetPasswordSchema, opts), authController.resetPassword);
    
// google auth
router.route('/google').get(authController.loginWithGoogle);

router.route('/google/callback')
    .get(passport.authenticate('google'), authController.authThirdPartyCallback);

// facebook auth
router.route('/facebook').get(authController.loginWithFacebook);

router.route('/facebook/callback')
    .get(passport.authenticate('facebook'), authController.authThirdPartyCallback);

module.exports = router;