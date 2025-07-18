const { isDate } = require('lodash');
const mongoose = require('mongoose'); // Import mongoose

/**
 * Middleware to parse and transform request query parameters into MongoDB queries.
 * Supports:
 * 1. Multiple Values: key=val1,val2,val3  (creates a $in query)
 * 2. Range Queries: key=gt:10,lt:20 or key=gte:2023-01-01,lte:2023-12-31
 *    - gt: greater than
 *    - lt: less than
 *    - gte: greater than or equal to
 *    - lte: less than or equal to
 * 3. Not Equal Queries: key!=val1 or key!=val1,val2 (creates a $ne or $nin query)
 * 4. Exact Match: key=value
 *
 * It also includes basic SQL injection prevention by checking for ';' and '--' in query values.
 */
const queryManager = (req, res, next) => {
    try {
        req.mongoQuery = {};

        for (const key in req.query) {
            if (Object.hasOwnProperty.call(req.query, key)) {
                 // Ignore limit and page queries
                if (key === 'limit' || key === 'page') {
                    continue;
                }
                let value = req.query[key];

                // SQL Injection Prevention (Basic)
                if (typeof value === 'string' && (value.includes(';') || value.includes('--'))) {
                    console.warn(`SQL injection attempt detected for key: ${key}`);
                    continue; // Skip this query parameter
                }

                // Function to check if a value is a valid MongoDB ObjectId
                const isValidObjectId = (val) => {
                    return mongoose.Types.ObjectId.isValid(val);
                };

                // 1. Multiple Values (e.g., key=val1,val2,val3)
                if (typeof value === 'string' && value.includes(',') && !key.endsWith('!')) {
                    const values = value.split(',').map(v => v.trim()).map(v => isValidObjectId(v) ? mongoose.Types.ObjectId.createFromHexString(v) : v);
                    req.mongoQuery[key] = { $in: values };
                }
                // 2. Range Queries (e.g., key=gt:10,lt:20 or key=gte:2023-01-01,lte:2023-12-31)
                else if (typeof value === 'string' && (value.includes('gt:') || value.includes('lt:') || value.includes('gte:') || value.includes('lte:'))) {
                    const rangeQuery = {};
                    const parts = value.split(',');

                    parts.forEach(part => {
                        const [operator, val] = part.split(':');
                        let parsedVal = val;
                        if (operator === 'gt') {
                            parsedVal = isDate(new Date(val)) ? new Date(val) :  isNaN(Number(val)) ? val : Number(val);
                            rangeQuery.$gt = isValidObjectId(parsedVal) ? new mongoose.Types.ObjectId(parsedVal) : parsedVal;
                        } else if (operator === 'lt') {
                            parsedVal = isDate(new Date(val)) ? new Date(val) : isNaN(Number(val)) ? val : Number(val);
                            rangeQuery.$lt = isValidObjectId(parsedVal) ? new mongoose.Types.ObjectId(parsedVal) : parsedVal;
                        } else if (operator === 'gte') {
                            parsedVal = isDate(new Date(val)) ? new Date(val) : isNaN(Number(val)) ? val : Number(val);
                            rangeQuery.$gte = isValidObjectId(parsedVal) ? new mongoose.Types.ObjectId(parsedVal) : parsedVal;
                        } else if (operator === 'lte') {
                            parsedVal = isDate(new Date(val)) ? new Date(val) : isNaN(Number(val)) ? val : Number(val);
                            rangeQuery.$lte = isValidObjectId(parsedVal) ? new mongoose.Types.ObjectId(parsedVal) : parsedVal;
                        }
                    });

                    req.mongoQuery[key] = rangeQuery;
                }
                // 3. Not Equal (!=) Queries (e.g., key!=val1 or key!=val1,val2)
                else if (typeof value === 'string' && key.endsWith('!')) {
                    const cleanKey = key.slice(0, -1); // Remove trailing '!' from key
                    if (value.includes(',')) {
                        const notEqualValues = value.split(',').map(v => v.trim()).map(v => isValidObjectId(v) ? mongoose.Types.ObjectId.createFromHexString(v) : v);
                        req.mongoQuery[cleanKey] = { $nin: notEqualValues };
                    } else {
                        const finalValue = isValidObjectId(value) ? mongoose.Types.ObjectId.createFromHexString(value) : value;
                        req.mongoQuery[cleanKey] = { $ne: finalValue };
                    }
                }
                // 4. Not In Range (ni:) -  Not implemented, as it would require significantly more complex parsing and might overlap with other functionalities.  If needed, implement similarly to range queries.
                //else if (typeof value === 'string' && value.startsWith('ni:')) {
                //  // Implementation for "not in range"
                //  }
                // 5. Exact Match
                else {
                    const finalValue = isValidObjectId(value) ? mongoose.Types.ObjectId.createFromHexString(value) : value;
                    req.mongoQuery[key] = finalValue;
                }
            }
        }

        next();
    } catch (error) {
        console.error("Error in queryManager middleware:", error);
        return res.status(500).json({ message: "Error processing query parameters", error: error.message });
    }
};

module.exports = queryManager;