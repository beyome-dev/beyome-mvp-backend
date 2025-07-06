// const { getAuthUrl, getTokensFromCode } = require('../services/utilityServices/google/googleCalendar.service');
const { userService, tokenService, mailerService, googleCalendarService } = require('../services');
const config = require('../config');

// @desc Get user profile
// @route GET /api/users/profile
// @access Private
module.exports.getUserProfile = async (req, res) => {
    try {
        var user = await userService.getUserById(req.user.id);
        let userObj = user.toObject ? user.toObject() : { ...user };
        if (userObj.googleTokens?.refresh_token) {
            userObj.hasCalendarSync = true;
            userObj.googleTokens = undefined;
        } else {
            userObj.hasCalendarSync = false;
        }
        if (userObj.calendarSettings) {
            delete userObj.calendarSettings._id
        }
        res.status(200).send(userObj);
    } catch (error) {
        console.log(error);
        res.status(400).send({ message: error.message });
    }
}

// @desc Update user profile
// @route PUT /api/users/profile
// @access Private
module.exports.updateUserProfile = async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            req.body.isAdmin = false;
        }
        if (req.body.googleTokens) {
            delete req.body.googleTokens;
        }
        const user = await userService.updateUserById(req.user.id, req.body);
        if (user.googleTokens?.refresh_token) {
            user.hasCalendarSync = true
            user.googleTokens = undefined
        }
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Create a new user
// @route   POST /api/users
// @access  Private/Admin
module.exports.createUser = async (req, res) => {
    try {
        const user = await userService.registerUser(req.body);

        const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.JWT_EMAIL_SECRET, '6h');

        const baseUrl = req.protocol + "://" + req.get("host");
        const url = baseUrl + `/api/auth/confirmation/${emailToken}`;


        mailerService.sendMail(user.email, 'Confirm Email', 'confirm-email', { url: url, name: user.firstName })

        res.status(201).send(user);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Get all users
// @route   GET /api/users
// @access  Private/Admin
module.exports.getUsers = async (req, res) => {
    try {
        const users = await userService.getUsers();
        res.status(200).send(users);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private/Admin
module.exports.getUserById = async (req, res) => {
    try {
        const user = await userService.getUserById(req.params.id);
        if (user.googleTokens?.refresh_token) {
            user.hasCalendarSync = true
            user.googleTokens = undefined
        }
        res.status(200).send(user);
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private/Admin
module.exports.deleteUser = async (req, res) => {
    try {
        const user = await userService.deleteUserById(req.params.id, req.user);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}


// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private/Admin
module.exports.updateUser = async (req, res) => {
    try {
        const user = await userService.updateUserById(req.params.id, req.body, req.user);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc Resend confirmation email
// @route GET /api/users/get-activation-email
// @access Private
module.exports.sendConfirmEmail = async (req, res) => {
    try {
        const { email } = req.user;

        const user = await userService.getUserByOpts({ email });
        if (!user) {
            return res.status(404).send({ message: 'user not found' });
        }

        const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.JWT_EMAIL_SECRET, '6h');

        const baseUrl = req.protocol + "://" + req.get("host");
        const url = baseUrl + `/api/auth/confirmation/${emailToken}`;

        mailerService.sendMail(email, 'Confirm Email', 'confirm-email', { url: url, name: '' });
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc Confirm user's email
// @route GET /api/users/confirmation/:token
// @access Public
module.exports.confirmEmail = async (req, res) => {
    try {
        const { id } = tokenService.verifyToken(req.params.token, config.jwt.JWT_EMAIL_SECRET);
        const user = await userService.updateUserById(id, { isConfirmed: true });
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Get Google OAuth URL
// @route   GET /api/users/google-calendar/auth-url
// @access  Private
module.exports.getGoogleAuthUrl = async (req, res) => {
    try {
        if (req.user && req.user.googleTokens?.refresh_token) {
            // Already synced
            return res.status(200).send({ message: "Already synced" });
          }
        const url = googleCalendarService.getAuthUrl(req.user.email);
        res.status(200).send({ url });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
};

// @desc    Handle Google OAuth callback and save tokens
// @route   POST /api/users/google-calendar/save-tokens
// @access  Private
module.exports.saveGoogleTokens = async (req, res) => {
    try {
        const { code } = req.body;
        const tokens = await googleCalendarService.getTokensFromCode(code);

        await userService.updateUserById(req.user.id, {
            googleTokens: tokens
        });

        res.status(200).send({ message: 'Google Calendar synced successfully' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
};

// @desc    Handle Google OAuth callback and save tokens
// @route   POST /api/users/google-calendar/remove-tokens
// @access  Private
module.exports.removeGoogleTokens = async (req, res) => {
    try {
        await userService.updateUserById(req.user.id, {
            googleTokens: null
        });

        res.status(200).send({ message: 'Google Calendar sync removed successfully' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
};