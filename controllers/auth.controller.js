const { userService, tokenService, mailerService } = require('../services');
const passport = require('passport');
const config = require('../config');

// @desc Register new user
// @route POST /api/auth/register
// @access Public
module.exports.registerUser = async (req, res) => {
    try {
        const user = await userService.registerUser(req.body);
        const token = tokenService.createToken({ id: user.id, email: user.email });

        const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.emailSecret, '6h');

        const url = config.client.confirmUrl + emailToken;

        mailerService.sendMail(user.email, 'Confirm Email', 'confirm-email', { url: url, name: user.firstName });

        res.status(201).send({ user, token });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc Reset password of user
// @route POST /api/auth/password-reset/get-code
// @access Public
module.exports.sendResetPasswordEmail = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await userService.getUserByOpts({ email });
        if (!user) {
            return res.status(404).send({ message: 'user not found' });
        }

        const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.emailSecret, '1h');

        const url = config.client.resetUrl + emailToken;

        mailerService.sendMail(email, 'Reset Password', 'forgot-password-email', { url: url, name: '' });
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc Verify and save new password of user
// @route POST /api/auth/password-reset/verify/:token
// @access Public
module.exports.resetPassword = async (req, res) => {
    try {
        const { password } = req.body;
        const { id } = tokenService.verifyToken(req.params.token, config.jwt.emailSecret);
        const user = await userService.updateUserById(id, { password: password });
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc Auth user & get token
// @route POST /api/auth/login
// @access Public
module.exports.loginWithEmailAndPassword = (req, res, next) => {
    passport.authenticate('local', { session: false }, (error, user, info) => {
        if (error) { return res.status(500).send({ message: error.message }); }

        if (!user) {
            return res.status(500).send({ message: info.message })
        }
        const token = tokenService.createToken({ id: user.id, email: user.email });

        res.send({ user, token });

    })(req, res, next);
}

// @desc Login with google
// @route GET /api/auth/google
// @access Public
module.exports.loginWithGoogle = passport.authenticate('google', {
    scope: ['profile', 'email'],
})

// @desc Login with facebook
// @route GET /api/auth/facebook
// @access Public
module.exports.loginWithFacebook = passport.authenticate('facebook', {
    scope: ['public_profile', 'email']
})

// @desc Callback route for third party auth to redirect to
// @route GET /api/auth/google/callback
// @route GET /api/auth/facebook/callback
// @access Public
module.exports.authThirdPartyCallback = (req, res) => {
    const token = tokenService.createToken({ id: req.user.id, email: req.user.email });
    const url = config.client.oauthRedirectUrl + '?token=' + token;
    res.redirect(url);
}

// @desc Add user to waitlist and send email notification
// @route POST /api/auth/waitlist
// @access Public
module.exports.addToWaitlist = async (req, res) => {
    try {
        const { firstName, lastName, email, specialty, organization } = req.body;

        // Send email to the internal team
        await mailerService.sendMail(
            config.team.email, // Internal team email
            'New Waitlist Request',
            'waitlist-email', // Template name
            {
                firstName,
                lastName,
                email,
                specialty: specialty || 'N/A',
                organization: organization || 'N/A',
            }
        );

        res.status(200).send({ message: 'Waitlist request submitted successfully' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
};