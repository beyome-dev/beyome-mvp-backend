const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const passport = require('passport');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { validationMiddleware, rateLimiter, apiKeyMiddleware } = require('./middlewares');
const { Server } = require('socket.io');
const routes = require('./routes');
const bodyParser = require('body-parser');
const http = require('http');
const path = require('path');
const { noteController } = require('./controllers')
const {saladCheck, fileManager} = require('./cronJobs');
const axios = require('axios');

// set up passport
require('./config/passport-config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// middlewares
// set security HTTP headers
app.use(helmet());

// parse json request body and urlencoded request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// limit repeated failed requests to auth endpoints
if (process.env.NODE_ENV === 'production') {
    app.use('/api/auth', rateLimiter.authLimiter);
}
else {
    app.use(morgan('dev'));
    // Add this once in your app (e.g., in a setup or config file)
    axios.interceptors.request.use(request => {
        console.log('Starting Request', {
            method: request.method,
            url: request.url,
            headers: request.headers,
            data: request.data,
        });
        return request;
    });

    axios.interceptors.response.use(response => {
        console.log('Response:', {
            url: response.config.url,
            status: response.status,
            data: response.data,
        });
        return response;
    }, error => {
        console.error('Error Response:', {
            url: error.config?.url,
            status: error.response?.status,
            data: error.response?.data,
        });
        return Promise.reject(error);
    });
}


// Socket.io connection
io.on('connection', (socket) => {
    console.log('Frontend connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Frontend disconnected:', socket.id);
    });
});

// Make io accessible to routes
app.set('socketio', io);

// set static folders
app.use(express.static('templates'));

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// initialize passport
app.use(passport.initialize());

// const db = config.mongo.url;
// mongoose.connect(db, {
//     useNewUrlParser: true,
//     useUnifiedTopology: true,
//     useFindAndModify: false,
//     useCreateIndex: true
// }, () => console.log('mongodb connected'));

// set up routes
// app.use(bodyParser.json({ limit: '10mb' }));
// app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
saladCheck(io)
fileManager()
app.use('/api', routes);
app.post(
    '/api/webhook/salad', 
    express.json({ limit: '500mb' }), // Increase as needed
    express.urlencoded({ extended: true, limit: '500mb' }),
    noteController.saladWebhook
);
// handle celebrate errors and server errors
app.use(validationMiddleware.handleValidationError);
app.use(apiKeyMiddleware)

// DB Connection
async function connectDB() {
    try {
        console.log("MongoDB URI:", config.mongo.url);
        if (process.env.NODE_ENV != 'production') {
            mongoose.set('debug', true);
        }
        await mongoose.connect(config.mongo.url, {
            dbName: config.mongo.dbName, // Ensure this is correctly set in config
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1); // Exit the process if the DB fails to connect
    }
}


// Connect to MongoDB before starting the server
connectDB().then(() => {
    const PORT = config.PORT || 8000;
    server.listen(PORT, () => console.log(`Server running on PORT: ${PORT}`));
});