# Beyome MVP Backend

## Admin Dashboard APIs

### 1. User Attendance API
**GET** `/api/admin/user-attendance`

Get user login attendance between specified dates.

**Query Parameters:**
- `from` (required): Start date in YYYY-MM-DD format
- `to` (required): End date in YYYY-MM-DD format

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "users": [
        {
          "user": {
            "_id": "user_id",
            "firstName": "John",
            "lastName": "Doe",
            "email": "john@example.com"
          },
          "loginCount": 3
        }
      ]
    }
  ]
}
```

**Authentication:** Requires platform_admin role

### 2. User Statistics API
**GET** `/api/admin/user-statistics`

Get comprehensive statistics for all users.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user": {
        "_id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      },
      "totalBookings": 25,
      "bookingsWithNotes": 20,
      "bookingsPerDay": [
        {
          "date": "2024-01-15",
          "count": 3
        },
        {
          "date": "2024-01-14",
          "count": 2
        }
      ],
      "totalNotes": 18
    }
  ]
}
```

**Authentication:** Requires platform_admin role

## Usage Examples

### Get user attendance for a date range:
```bash
curl -X GET "http://localhost:3000/api/admin/user-attendance?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get user statistics:
```bash
curl -X GET "http://localhost:3000/api/admin/user-statistics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

// ============================================
// .env configuration additions
// ============================================
# Transcription Configuration
TRANSCRIPTION_DEFAULT_TOOL=openai
TRANSCRIPTION_ENABLE_FALLBACK=true
TRANSCRIPTION_MAX_RETRIES=3
TRANSCRIPTION_RETRY_INTERVAL_MINUTES=5

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key
OPENAI_MAX_FILE_SIZE_MB=25

# AssemblyAI Configuration
ASSEMBLYAI_API_KEY=your_assemblyai_key

# Google Cloud Speech-to-Text
GOOGLE_APPLICATION_CREDENTIALS=./path/to/google-credentials.json
GOOGLE_PROJECT_ID=your_project_id

# Salad Configuration
SALAD_API_KEY=your_salad_key

# Batch Processing
CHUNK_MAX_DURATION_SECONDS=600
CHUNK_OVERLAP_SECONDS=5

# FFmpeg (ensure it's installed)
# sudo apt-get install ffmpeg (Ubuntu/Debian)
# brew install ffmpeg (macOS)


============================================
 Socket.io events for real-time updates
============================================


### Client-side listening example
```
socket.on('recordingTranscriptionCompleted', (data) => {
  console.log('Transcription completed:', data);
  // Update UI
});

socket.on('recordingTranscriptionRetrying', (data) => {
  console.log('Transcription retrying:', data);
  // Show retry notification
});

socket.on('recordingTranscriptionFailed', (data) => {
  console.log('Transcription failed:', data);
  // Show error notification
});
```