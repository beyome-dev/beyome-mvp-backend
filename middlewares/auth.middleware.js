const passport = require('passport');

const requireAuth = passport.authenticate('jwt', { session: false });

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        return next();
    }
    res.status(401).send({ message: 'Not authorized as an admin' });
}
const isDoctor = (req, res, next) => {
    if (req.user && req.user.isDoctor) {
        return next();
    }
    res.status(401).send({ message: 'Not authorized as a Doctor' });

}
module.exports = {
    requireAuth,
    isAdmin,
    isDoctor
}