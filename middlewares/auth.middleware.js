const passport = require('passport');

const requireAuth = passport.authenticate('jwt', { session: false });

const hasRole = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.userType) {
            return res.status(401).send({ message: 'User not authenticated' });
        }

        const isAuthorized = allowedRoles.includes(req.user.userType) || req.user.userType === 'platform_admin';

        if (isAuthorized) {
            return next();
        }

        res.status(401).send({ message: 'Not authorized for this role' });
    };
};

module.exports = {
    requireAuth,
    hasRole
};