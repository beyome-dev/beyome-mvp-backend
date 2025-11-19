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
const {saladCheck, fileManager, bookingCronJob, TranscriptionRetryJob } = require('./cronJobs');
const axios = require('axios');
const { tokenService } = require('./services');

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

    const token = socket.handshake.auth.token;

        if (token) {
            try {
                const jwt_payload = tokenService.verifyToken(token, config.jwt.secret);
                socket.data.user = jwt_payload; // Store user data on the socket

                // Join a room with the user's ID
                const userRoom = jwt_payload.id
                socket.join(userRoom);
            
                console.log(`User ${jwt_payload.id} connected and joined room: ${userRoom}`);
            } catch (err) {
                console.error("Invalid token:", err.message);
                socket.disconnect(); // Disconnect if token is invalid
            }
        } else {
            console.log("No token provided.");
            socket.disconnect(); // Disconnect if no token is provided
        }
        
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
bookingCronJob()

// Initialize retry job
const retryJob = new TranscriptionRetryJob(io);
retryJob.start();

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

process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping retry job...');
    retryJob.stop();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
});

// ============================================
// Monitoring & Alerting Setup
// ============================================

/*
// Optional: Add monitoring with Winston logger
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'logs/transcription-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/transcription-combined.log' })
  ]
});

// Log all transcription attempts
const logTranscriptionAttempt = async (data) => {
  logger.info('Transcription attempt', data);
  
  // Optional: Send to monitoring service (Sentry, DataDog, etc.)
  if (data.success === false) {
    // await sentry.captureException(new Error(data.error));
  }
};
*/