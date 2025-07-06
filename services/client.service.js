const { Client, Booking, Note } = require('../models');
const moment = require('moment-timezone');

const getClients = async (id) => {
    const clients = await Client.find({});
    return clients;
}

const getClientById = async (id, handler) => {
   let client = await Client.findById(id);
    if (!client) {
        throw new Error('client not found');
    }
    if (!isAuthorizedToClient(client, handler)) {
        throw new Error('You are not authorized to edit this client');
    }
    return client;
}

const updateClientById = async (id, clientData, handler) => {
    // if (clientData.email && (await Client.isEmailTaken(clientData.email, id))) {
    //     throw new Error('email is already taken');
    // }
    let client = await Client.findById(id);
    if (!client) {
        throw new Error('client not found');
    }
    if (!isAuthorizedToClient(client, handler)) {
        throw new Error('You are not authorized to edit this client');
    }
    if (handler != null && handler != undefined && handler._id.toString() != client._id.toString()) {
        if(clientData.password) {
            throw new Error('You cannot change the password of another client');
        }
    }
    client = await Client.findByIdAndUpdate(id, clientData);
    if (client) {
        client.password = undefined;
        client.googleTokens = undefined;
        return client;
    }
    throw new Error('client not found');
}
// Helper function to check if handler is authorized
function isAuthorizedToClient(client, handler) {
    if (handler === null || handler === undefined) {
        return true
    }
    const orgMatch = client.organization && handler.organization && client.organization.toString() === handler.organization.toString();
    if (handlerIdStr == client._id.toString()) {
        return true; // Handler is the client themselves
    }
    // Therapist can only delete if they are a handler of the client
    if (handler.clientType === "therapist" && !client.handler.toString() == handler._id.toString()) {
        return false;
    }
    // Receptionist or org_admin can only delete if in the same organization
    if ((handler.clientType === "receptionist" || handler.clientType === "org_admin") && !orgMatch) {
        return false;
    }
    // Otherwise, authorized
    return true;
}

const deleteClientById = async (id, handler) => {
    const client = await Client.findById(id);
    if (client) {
        // Check if handler is allowed to delete this client
        if (!isAuthorizedToClient(client, handler)) {
            throw new Error('You are not authorized to delete this client');
        }
        await Client.findByIdAndDelete(id);

        // Delete all bookings for this client
        let bookings = await Booking.find({ client: id, handler: handler._id })
        await Booking.deleteMany({client: id, handler: handler._id});
        bookings = bookings.map(booking => {
                if (booking.googleEventId !== "" && handler.googleTokens?.access_token) {
                    calendatService.removeBookingEvent(booking.googleEventId, handler.googleTokens)
                }
        });

        return client;
    }
    throw new Error('client not found');
}


const createClient = async (clientData, handlerID, byPassCheck) => {
    if (!clientData.firstName || !clientData.lastName) {
        throw new Error('email, firstName and lastName are required');
    }
    if (!byPassCheck && (clientData.email || clientData.phone)) {
        const client  = await Client.findOne({ $or: [{email: clientData.email }, {phone: clientData.phone}] });
         throw new Error('client with same email or phone exists');
    }
    clientData.handler = handlerID
    const newClient = await Client.create(clientData);
    return newClient;
}

const getClientNames = async (filter = {}, page = 1, limit = 10) => {
    let query = {};
    if (filter.name) {
        query = {
            $or: [
                { firstName: { $regex: filter.name, $options: 'i' } },
                { lastName: { $regex: filter.name, $options: 'i' } },
                { nickName: { $regex: filter.name, $options: 'i' } }
            ]
        };
        delete filter.name;
    }

    query = { ...query, ...filter };

    const skip = (page - 1) * limit;
    let clients = await Client.find(query)
        .select('firstName lastName nickName email')
        .sort({ visitDate: -1 })
        .skip(skip)
        .limit(limit);
    
    clients = clients.map(client => {
        return {
            name: `${client.firstName} ${client.lastName}`,
            email: client.email ? client.email : "",
            _id: client._id
        };
    });

    const totalCount = await Client.countDocuments(query);
    
    return { 
        clients, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
}

const getClientDataByID = async (clientID, handler) => {

    const client  = await Client.findById(clientID);
    if (!client) {
        throw new Error('Client not found');
    }

    // Fetch all bookings for the client
    const bookings = await Booking.find({ client: client._id });

    // Fetch all notes for the client
    const notes = await Note.find({ client: client._id });

    const now = moment().tz('Asia/Kolkata'); // current date-time
        const todayStr = now.format("YYYY-MM-DD");
        const currentTimeStr = now.format("HH:mm");

        const stats = await Booking.aggregate([
            {
                $match: {
                    client: client._id,
                    handler: handler._id
                }
            },
            {
                $facet: {
                    revenue: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$sessionCost' }
                            }
                        }
                    ],
                    completedOrPending: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        { $count: "count" }
                    ],
                    upcoming: [
                        {
                            $match: {
                                status: 'scheduled',
                                $or: [
                                    { date: { $gt: todayStr } },
                                    {
                                        date: todayStr,
                                        time: { $gte: currentTimeStr }
                                    }
                                ]
                            }
                        },
                        { $count: "count" }
                    ],
                    pendingReview: [
                        { $match: { status: 'pending-review' } },
                        { $count: "count" }
                    ],
                    latestBooking: [
                        { $sort: { date: -1, time: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, date: 1, time: 1 } }
                    ]
                }
            }
        ]);

        const result = stats[0] || {};
        let analysis = {}
        analysis.revenue = result.revenue?.[0]?.total || 0;
        analysis.completedOrPendingCount = result.completedOrPending?.[0]?.count || 0;
        analysis.upcomingCount = result.upcoming?.[0]?.count || 0;
        analysis.pendingReviewCount = result.pendingReview?.[0]?.count || 0;

        // Assign lastVisit as joined date and time from latestBooking
        if (result.latestBooking && result.latestBooking[0]) {
            const { date, time } = result.latestBooking[0];
            analysis.lastVisit = date && time ? `${date} ${time}` : null;
        } else {
            analysis.lastVisit = null;
        }


    return {
        client,
        bookings,
        notes,
        analysis
    };
}
const getClientsWithData = async (filter = {}, page = 1, limit = 10, handler) => {
    const skip = (page - 1) * limit;
    let clients = await Client.find(filter).select('firstName lastName email')
    .sort({ visitDate: -1 })
    .skip(skip)
    .limit(limit);
    
    const totalCount = await Client.countDocuments(filter);

clients = await Promise.all(clients.map(async client => {
    try {
        const now = moment().tz('Asia/Kolkata'); // current date-time
        const todayStr = now.format("YYYY-MM-DD");
        const currentTimeStr = now.format("HH:mm");

        const stats = await Booking.aggregate([
            {
                $match: {
                    client: client._id,
                    handler: handler._id
                }
            },
            {
                $facet: {
                    revenue: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        {
                            $group: {
                                _id: null,
                                total: { $sum: '$sessionCost' }
                            }
                        }
                    ],
                    completedOrPending: [
                        {
                            $match: {
                                status: { $in: ['completed', 'pending-review'] }
                            }
                        },
                        { $count: "count" }
                    ],
                    upcoming: [
                        {
                            $match: {
                                status: 'scheduled',
                                $or: [
                                    { date: { $gt: todayStr } },
                                    {
                                        date: todayStr,
                                        time: { $gte: currentTimeStr }
                                    }
                                ]
                            }
                        },
                        { $count: "count" }
                    ],
                    pendingReview: [
                        { $match: { status: 'pending-review' } },
                        { $count: "count" }
                    ],
                    latestBooking: [
                        { $sort: { date: -1, time: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, date: 1, time: 1 } }
                    ]
                }
            }
        ]);

        const result = stats[0] || {};
        client = client.toObject ? client.toObject() : client;
        client.revenue = result.revenue?.[0]?.total || 0;
        client.completedOrPendingCount = result.completedOrPending?.[0]?.count || 0;
        client.upcomingCount = result.upcoming?.[0]?.count || 0;
        client.pendingReviewCount = result.pendingReview?.[0]?.count || 0;

        console.log(result.latestBooking, "latestBooking");
        // Assign lastVisit as joined date and time from latestBooking
        if (result.latestBooking && result.latestBooking[0]) {
            const { date, time } = result.latestBooking[0];
            client.lastVisit = date && time ? `${date} ${time}` : null;
        } else {
            client.lastVisit = null;
        }

    } catch (error) {
        console.error(`Error processing client ${client._id}:`, error);
        client = client.toObject ? client.toObject() : client;
        client.revenue = 0;
        client.completedOrPendingCount = 0;
        client.upcomingCount = 0;
        client.pendingReviewCount = 0;
        client.lastVisit = null;
    }
    return client;
}));

    return { 
        clients, 
        totalPages: Math.ceil(totalCount / limit), 
        currentPage: page, 
        totalCount 
    };
}

module.exports = {
    createClient,
    getClientById,
    updateClientById,
    deleteClientById,
    getClientNames,
    getClients,
    getClientDataByID,
    getClientsWithData
}

