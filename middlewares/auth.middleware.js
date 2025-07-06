const passport = require('passport');
const booking = require('../models/booking');
const { bookingService, clientService, noteService } = require('../services')

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

const verifyUserAccess = (schema) => {
    return (req, res, next) => {
        if (!req.user || !req.user.userType) {
            return res.status(401).send({ message: 'User not authenticated' });
        }
        let id = req.query.id
        if  (req.params.id != undefined || req.params.id != '') {
            d = req.params.id
        }
        if (id == undefined || id == '') {
            return res.status(401).send({ message: 'Unable to fetch the schema id' });
        }
        let data = undefined
        switch(schema) {
            case 'booking':
                data = bookingService.getBookingById(id)
            case 'client':
                data = clientService.getClientById(id)
            case 'note':
                data = noteService.getNoteById(id)
        }
        if (data == undefined) {
            return res.status(401).send({ message: 'Unable to fetch the schema data' });
        }
        const isAuthorized = isAuthorizedToData(data)
        if (isAuthorized) {
            return next();
        }
        res.status(401).send({ message: 'Not authorized to this data' });
    };
};

module.exports = {
    requireAuth,
    verifyUserAccess,
    hasRole
};

 // Helper function to check if handler is authorized
function isAuthorizedToData(data, handler) {
    if (handler === null || handler === undefined) {
        return true
    }
    const handlerIdStr = handler._id.toString();
    const userHandlers = (data.handlers || []).map(h => h.toString());
    const orgMatch = data.organization && handler.organization && data.organization.toString() === handler.organization.toString();
    if (handlerIdStr == data._id.toString()) {
        return true; // Handler is the user themselves
    }
    // Therapist can only delete if they are a handler of the user
    if (handler.userType === "therapist" && !userHandlers.includes(handlerIdStr)) {
        return false;
    }
    // Receptionist or org_admin can only delete if in the same organization
    if ((handler.userType === "receptionist" || handler.userType === "org_admin") && !orgMatch) {
        return false;
    }
    // Otherwise, authorized
    return true;
}