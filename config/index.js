const dotenv = require('dotenv');
const path = require('path');
const os = require('os');
dotenv.config();


console.log("MongoDB URI:", process.env.MONGO_URI);
module.exports = {
    PORT: process.env.PORT,
    APP_URL: process.env.APP_URL,
    apiKey: process.env.API_KEY || 'your-secure-api-key',
    storagePath: process.env.STORAGE_PATH || '../uploads',
    chunkWorkspaceRoot: process.env.CHUNK_WORKSPACE_ROOT || path.join(os.tmpdir(), 'recapp-chunks'),
    deleteAudio: process.env.DELETE_AUDIO_RECORD || false,
    mongo: {
        url: process.env.MONGO_URI,
        dbName: process.env.MONGO_DB_NAME,
    },
    jwt: {
        secret: process.env.JWT_SECRET,
        maxAge: process.env.JWT_MAX_AGE,
        refreshMaxAge: process.env.JWT_REFRESH_MAX_AGE,
        emailSecret: process.env.JWT_EMAIL_SECRET,
    },
    google: {
        projectID: process.env.GOOGLE_PROJECT_ID,
        projectLocation: process.env.GOOGLE_PROJECT_LOCATION,
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        apiKey: process.env.GOOGLE_API_KEY,
        aiModel: process.env.GOOGLE_AI_MODEL,
    },
    googleCloudStorage: {
        bucketName: process.env.GCS_BUCKET_NAME,
        basePath: process.env.GCS_BASE_PATH || 'recapp-mvp/recordings',
        makePublic: process.env.GCS_MAKE_PUBLIC !== 'false',
        signedUrlExpirationSeconds: parseInt(process.env.GCS_SIGNED_URL_TTL, 10) || 60 * 60 * 24, // 24h
        credentialsPath: process.env.GCS_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_KEY_PATH,
    },
    facebook: {
        appID: process.env.FACEBOOK_APP_ID,
        appSecret: process.env.FACEBOOK_APP_SECRET,
    },
    email: {
        user: process.env.EMAIL_USER,
        password: process.env.EMAIL_PASSWORD,
        service: process.env.EMAIL_SERVICE,
        brevoUser: process.env.BREVO_USERNAME, // Your Brevo SMTP user
        brevoPassword: process.env.BREVO_PASSWORD,
        brevoApiKey: process.env.BREVO_API_KEY
    },
    client: {
        url: process.env.CLIENT_URL,
        resetUrl: process.env.CLIENT_RESET_URL,
        oauthRedirectUrl: process.env.CLIENT_OAUTH_REDIRECT_URL,
        confirmUrl: process.env.CLIENT_CONFIRM_URL,
    },
    transcriptionConfig: {
        default: process.env.DEFAULT_TRANSCRIBE_TOOL || 'openai',
        saladAPIKey: process.env.SALAD_API_KEY,
        openAIAPIKey: process.env.OPENAI_API_KEY,
        assemblyAIAPIKey: process.env.ASSEMBLYAI_API_KEY,
        googleKeyPath: process.env.GOOGLE_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GCS_KEY_FILE
    },
    chunkMaxDuration: parseInt(process.env.CHUNK_MAX_DURATION_SECONDS) || 600,
    chunkOverlap: parseInt(process.env.CHUNK_OVERLAP_SECONDS) || 5,
    // salad: {
    //     apiKey: process.env.SALAD_API_KEY,
    // },
    team: {
        email: process.env.TEAM_EMAIL,
        name:  process.env.TEAM_NAME
    }
};