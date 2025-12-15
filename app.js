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
const { transcriptionState } = require('./services/audioProcessing/transcribeAudio.service');
const { resumeIncompleteTranscriptions } = require('./services/recording.service');

// set up passport
require('./config/passport-config');

const app = express();
const httpServer = http.createServer(app);

// Increase timeout for long-running operations (e.g., AI note generation)
// Default is 2 minutes (120000ms), setting to 15 minutes for AI processing
httpServer.timeout = 15 * 60 * 1000; // 15 minutes
httpServer.keepAliveTimeout = 61 * 1000; // Keep connections alive
httpServer.headersTimeout = 62 * 1000; // Slightly higher than keepAliveTimeout
// Socket.IO CORS configuration - allow localhost in development
const getSocketCorsOrigin = () => {
    if (process.env.NODE_ENV !== 'production') {
        // In development, allow any localhost origin
        return (origin, callback) => {
            if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        };
    }
    // In production, use strict origin
    return config.client.url || "http://localhost:8080";
};

const io = new Server(httpServer, {
    cors: {
        origin: getSocketCorsOrigin(),
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 60000,
    pingInterval: 25000,
});

// ============================================
// MIDDLEWARES - ORDER IS CRITICAL!
// ============================================

// 1. Socket.IO request logging (must be first)
app.use((req, res, next) => {
    if (req.path.includes('/socket.io/')) {
        console.log('📡 Socket.IO Request:', {
            method: req.method,
            path: req.path,
            query: req.query,
        });
    }
    next();
});

// 2. Security headers with HTTPS enforcement
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  // Enforce HTTPS in production
  ...(process.env.NODE_ENV === 'production' && {
    forceHTTPS: true
  })
};

app.use(helmet(helmetConfig));

// HTTPS enforcement middleware (for production)
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust nginx proxy
  
  app.use((req, res, next) => {
    // Check if request came through HTTPS (via nginx)
    const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    
    // Only enforce HTTPS for external requests (not from nginx proxy)
    if (!isSecure && req.hostname !== 'localhost') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    
    // Set HSTS header
    if (isSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    
    next();
  });
}

// 3. CORS - MUST come before body parsers
// Allow localhost in development, use strict config in production
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        // In development, allow localhost
        if (process.env.NODE_ENV !== 'production') {
            if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
                return callback(null, true);
            }
        }
        
        // In production, use strict origin check
        const allowedOrigins = config.client.url ? [config.client.url] : [];
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Api-Key"]
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// 4. Body parsers - EXCLUDE Socket.IO paths
app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io/')) {
        return next();
    }
    express.json()(req, res, next);
});

app.use((req, res, next) => {
    if (req.path.startsWith('/socket.io/')) {
        return next();
    }
    express.urlencoded({ extended: true })(req, res, next);
});

// 5. Compression
app.use(compression());

// 6. Logging & Rate limiting
if (process.env.NODE_ENV === 'production') {
    app.use('/api/auth', rateLimiter.authLimiter);
} else {
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

// ============================================
// SOCKET.IO CONNECTION
// ============================================

io.on('connection', (socket) => {
    console.log('✅ Frontend connected:', socket.id);

    const token = socket.handshake.auth.token;

    if (token) {
        try {
            const jwt_payload = tokenService.verifyToken(token, config.jwt.secret);
            socket.data.user = jwt_payload;

            const userRoom = jwt_payload.id;
            socket.join(userRoom);
            
            console.log(`✅ User ${jwt_payload.id} connected and joined room: ${userRoom}`);
            
            // Send confirmation to client
            socket.emit('authenticated', { userId: jwt_payload.id });
        } catch (err) {
            console.error("❌ Invalid token:", err.message);
            socket.emit('auth_error', { message: 'Invalid token' });
            socket.disconnect();
        }
    } else {
        console.log("❌ No token provided");
        socket.emit('auth_error', { message: 'No token provided' });
        socket.disconnect();
    }
    
    socket.on('disconnect', (reason) => {
        console.log('❌ Frontend disconnected:', socket.id, 'Reason:', reason);
    });
    
    socket.on('error', (error) => {
        console.error('Socket error:', socket.id, error);
    });
});

// Make io accessible to routes
app.set('socketio', io);

// 7. Static folders
app.use(express.static('templates'));
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// 8. Passport
app.use(passport.initialize());

// 9. Cron jobs
saladCheck(io);
fileManager();
bookingCronJob();

// Initialize retry job
const retryJob = new TranscriptionRetryJob(io);
retryJob.start();

// 10. Routes
app.use('/api', routes);

// 11. Special webhook route with larger payload
app.post(
    '/api/webhook/salad', 
    express.json({ limit: '500mb' }),
    express.urlencoded({ extended: true, limit: '500mb' }),
    noteController.saladWebhook
);

// 12. Error handlers
app.use(validationMiddleware.handleValidationError);
app.use(apiKeyMiddleware);

// Rest of your code remains the same...
// DB Connection, process handlers, etc.

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
connectDB().then(async () => {
    const PORT = config.PORT || 8000;
    httpServer.listen(PORT, async () => {
        console.log(`Server running on PORT: ${PORT}`);
        
        // Resume any incomplete transcriptions that were cut off during previous crash
        try {
            console.log('[Startup] Checking for incomplete transcriptions to resume...');
            const resumeResult = await resumeIncompleteTranscriptions(io);
            if (resumeResult.resumed > 0) {
                console.log(`[Startup] Resumed ${resumeResult.resumed} incomplete transcription(s)`);
            } else {
                console.log('[Startup] No incomplete transcriptions found');
            }
        } catch (error) {
            console.error('[Startup] Error resuming incomplete transcriptions:', error);
            // Don't fail startup if resume fails
        }
    });
});

const bytesToMB = (bytes = 0) => Number((bytes / (1024 * 1024)).toFixed(1));
const getProcessHealthSnapshot = () => {
  const memoryUsage = process.memoryUsage();
  const snapshot = {
    memoryMB: {
      rss: bytesToMB(memoryUsage.rss),
      heapTotal: bytesToMB(memoryUsage.heapTotal),
      heapUsed: bytesToMB(memoryUsage.heapUsed),
      external: bytesToMB(memoryUsage.external),
      arrayBuffers: bytesToMB(memoryUsage.arrayBuffers || 0)
    },
    uptimeSeconds: Number(process.uptime().toFixed(1))
  };
  if (typeof process._getActiveHandles === 'function') {
    snapshot.activeHandles = process._getActiveHandles().length;
  }
  if (typeof process._getActiveRequests === 'function') {
    snapshot.activeRequests = process._getActiveRequests().length;
  }
  return snapshot;
};

const logProcessHealth = (event, extra = {}) => {
  console.log(`[Process Health] ${event}`, {
    ...extra,
    ...getProcessHealthSnapshot()
  });
};

process.on('SIGTERM', () => {
    console.log('SIGTERM received, stopping retry job...');
    logProcessHealth('SIGTERM');
    retryJob.stop();
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
});

// ============================================
// Process Error Handlers - Catch unhandled errors
// ============================================

process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION - App will crash:', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    timestamp: new Date().toISOString()
  });
  logProcessHealth('uncaughtException', { error: error.message });
  // Give time for logging before exit
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION - Promise rejected:', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise,
    timestamp: new Date().toISOString()
  });
  logProcessHealth('unhandledRejection', { error: reason?.message || String(reason) });
  // Don't exit on unhandled rejection, but log it
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  logProcessHealth('SIGTERM graceful');
  if (retryJob) {
    retryJob.stop();
  }
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  logProcessHealth('SIGINT');
  
  // Check if transcription is active - delay shutdown to prevent data loss
  if (transcriptionState.isActive()) {
    const activeCount = transcriptionState.getActiveCount();
    console.log(`[Shutdown Protection] Active transcriptions detected (${activeCount}). Delaying shutdown for up to 5 minutes...`);
    console.log(`[Shutdown Protection] Active recording IDs: ${Array.from(transcriptionState.activeTranscriptions).join(', ')}`);
    
    // Poll every 10 seconds to check if transcription completed
    let waitTime = 0;
    const maxWaitTime = 5 * 60 * 1000; // 5 minutes max
    const checkInterval = setInterval(() => {
      waitTime += 10000;
      if (!transcriptionState.isActive()) {
        clearInterval(checkInterval);
        console.log(`[Shutdown Protection] All transcriptions completed after ${waitTime/1000}s. Proceeding with shutdown...`);
        performShutdown();
      } else if (waitTime >= maxWaitTime) {
        clearInterval(checkInterval);
        console.log(`[Shutdown Protection] Max wait time reached (${maxWaitTime/1000}s). Forcing shutdown...`);
        performShutdown();
      } else {
        const remaining = transcriptionState.getActiveCount();
        console.log(`[Shutdown Protection] Still waiting... (${waitTime/1000}s elapsed, ${remaining} active transcription(s))`);
      }
    }, 10000);
    
    return; // Don't proceed with shutdown yet
  }
  
  // No active transcriptions, proceed immediately
  performShutdown();
});

function performShutdown() {
  if (retryJob) {
    retryJob.stop();
  }
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('beforeExit', (code) => {
  logProcessHealth('beforeExit', { code });
});

process.on('exit', (code) => {
  logProcessHealth('exit', { code });
});

process.on('warning', (warning) => {
  logProcessHealth('warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack
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