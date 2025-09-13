const { userService, tokenService, mailerService, configService } = require('../services');
const passport = require('passport');
const config = require('../config');

// @desc Register new user
// @route POST /api/auth/register
// @access Public
module.exports.registerUser = async (req, res) => {
    try {
        const user = await userService.registerUser(req.body);
        configService.createConfig({
                "scope": "user",
                "role": "default",
                "backgroundColor": "#FFFFFF",
                "fontColor": "#000000",
                "promptIds": []
        }, user)
        const token = tokenService.createToken({ id: user.id, email: user.email });

        // const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.emailSecret, '6h');

        const loginUrl = config.client.url + `/login`;
        mailerService.sendMail(user.email, user.firstName, 'Your Recapp Account Is Now Active!', 'register-email', {
            firstName: user.firstName, 
            temporaryPassword: req.body.password, 
            userEmail: user.email, 
            loginLink: loginUrl 
        });

        res.status(201).send({ user, token });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

module.exports.updatePassword = async (req, res) => {
    try {

        const { password } = req.body;
        const user = await userService.updateUserById(id, { password: password });
        res.status(201).send({ user });
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

        mailerService.sendMail(email, user.firstName, 'Reset Password', 'forgot-password-email', { url: url, name: '' });
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
    passport.authenticate('local', { session: false }, async (error, user, info) => {
        if (error) { return res.status(500).send({ message: error.message }); }

        if (!user) {
            return res.status(500).send({ message: info.message })
        }
        let config = await configService.GetUserConfig(user)
        if (!config) {
            config = await configService.createConfig({
                "scope": "user",
                "role": "default",
                "backgroundColor": "#FFFFFF",
                "fontColor": "#000000",
                "promptIds": []
            }, user)
        }
        let response = {
            user: user,
            token: tokenService.createToken({ id: user.id, email: user.email }),
            config: config
        }
        if (!user.hasResetPassword) {
            // Create a one-time token for first-time password reset
            response.emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.emailSecret, '6h');
            // const url = config.client.firstTimePasswordResetUrl + emailToken;

            // Send the email with the token
            mailerService.sendMail(user.email, user.firstName, 'Welcome to Recapp', 'first-login-email', { firstName: user.firstName });
        }
        res.send(response);

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