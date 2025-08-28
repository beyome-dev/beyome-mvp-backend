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

// @desc Upload profile picture
// @route POST /api/users/profile/upload-picture
// @access Private
module.exports.uploadProfilePicture = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send({ 
                message: 'No file uploaded or invalid file type. Please upload an image file (JPEG, PNG, GIF, WebP) under 5MB.' 
            });
        }

        // Generate the file URL
        const baseUrl = req.protocol + '://' + req.get('host');
        const imageUrl = `${baseUrl}/api/uploads/${req.file.filename}`;

        // Update user's profile image URL
        const updatedUser = await userService.updateProfileImage(req.user.id, imageUrl);

        res.status(200).send({
            message: 'Profile picture uploaded successfully',
            imageUrl: imageUrl,
            user: updatedUser
        });
    } catch (error) {
        // Handle multer errors specifically
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).send({ 
                message: 'File too large. Please upload an image file under 5MB.' 
            });
        }
        
        if (error.message && error.message.includes('Only image files')) {
            return res.status(400).send({ 
                message: 'Invalid file type. Please upload an image file (JPEG, PNG, GIF, WebP).' 
            });
        }
        
        res.status(400).send({ message: error.message });
    }
}

// @desc Get discoverable users list (minimal info)
// @route GET /api/users/discoverable
// @access Public
module.exports.getDiscoverableUsers = async (req, res) => {
    try {
        const users = await userService.getDiscoverableUsers();
        res.status(200).send(users);
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc Get detailed profile of a specific user by username
// @route GET /api/users/discoverable/:username
// @access Public
module.exports.getUserProfileByUsername = async (req, res) => {
    try {
        const user = await userService.getUserProfileByUsername(req.params.username);
        res.status(200).send(user);
    } catch (error) {
        res.status(404).send({ message: error.message });
    }
}

// @desc Get detailed profile of a specific user by ID (keeping for backward compatibility)
// @route GET /api/users/discoverable/id/:id
// @access Public
// module.exports.getUserProfileById = async (req, res) => {
//     try {
//         const user = await userService.getUserProfileById(req.params.id);
//         res.status(200).send(user);
//     } catch (error) {
//         res.status(404).send({ message: error.message });
//     }
// }

// @desc    Create a new user
// @route   POST /api/users
// @access  Private/Admin
module.exports.createUser = async (req, res) => {
    try {
        const user = await userService.registerUser(req.body);

        // const emailToken = tokenService.createToken({ id: user.id, email: user.email }, config.jwt.JWT_EMAIL_SECRET, '6h');
        // const url = config.client.url + `/confirmation/${emailToken}`;
        const loginUrl = config.client.url + `/login`;


        mailerService.sendMail(user.email, user.firstName, 'Confirm Email', 'register-email', {
            firstName: user.firstName, 
            temporaryPassword: req.body.password, 
            userEmail: user.email, 
            loginLink: loginUrl 
        });

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

        mailerService.sendMail(email, user.firstName, 'Confirm Email', 'confirm-email', { url: url, name: '' });
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

// @desc    Reset password for the first time
// @route   POST /api/users/first-time-password-reset
// @access  Public
module.exports.firstTimePasswordReset = async (req, res) => {
    try {
        const { password } = req.body;

        if (!req.user || !req.user.id) {
            return res.status(404).send({ message: 'user not found' });
        }

        if (req.user.hasResetPassword) {
            return res.status(400).send({ message: 'password has already been reset' });
        }

        await userService.updatePasswordWithoutOld(req.user._id, password);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}


// @desc    Reset password for the first time
// @route   POST /api/users/change-password
// @access  Public
module.exports.changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;

        if (!req.user || !req.user.id) {
            return res.status(404).send({ message: 'user not found' });
        }

        if (req.user.hasResetPassword) {
            return res.status(400).send({ message: 'password has already been reset' });
        }

        await userService.updatePasswordWithoutOld(req.user._id, password);
        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Send client request to a user
// @route   POST /api/users/client-request/:id
// @access  Public
module.exports.clientRequest = async (req, res) => {
    try {
        const { fullName, phone, email, agenda } = req.body;
        const user = await userService.getUserProfileByUsername(req.params.username);
        await mailerService.sendMail(
            user.email, user.firstName, 
            'New 15-Minute Intro Call Request From',
            'client-request', // Template name
            {
                therapistName: user.firstName,
                fullName,
                email,
                phone,
                agenda: agenda || 'N/A'
            }
        );

        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}

// @desc    Send client request to a user
// @route   POST /api/users/plan-upgrade
// @access  Private
module.exports.planUpgrade = async (req, res) => {
    try {
        const { plan } = req.body;

        if (!req.user || !req.user.id) {
            return res.status(404).send({ message: 'user not found' });
        }
        await mailerService.sendMail(
            config.team.email,  config.team.name, // Internal team email
            'Plan updagrade request from '+req.user.firstName,
            'plan-upgrade-request', // Template name
            {
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                email: req.user.email,
                phone: req.user.phone,
                userId: req.user._id,
                upgradePlan: plan || 'N/A',
            }
        );

        res.status(200).send({ message: 'success' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
}