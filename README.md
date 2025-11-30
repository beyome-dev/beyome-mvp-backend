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


## Language code
| Language                | Code    |
|-------------------------|---------|
| Global English          | en      |
| Hindi                   | hi      |
| Gujarati                | gu      |
| Kannada                 | kn      |
| Malayalam               | ml      |
| Tamil                   | ta      |
| Telugu                  | te      |
| Marathi                 | mr      |
| Panjabi                 | pa      |
| Sanskrit                | sa      |
| Sindhi                  | sd      |
| Urdu                    | ur      |
| Sinhala                 | si      |
| Australian English      | en_au   |
| British English         | en_uk   |
| US English              | en_us   |
| Spanish                 | es      |
| French                  | fr      |
| German                  | de      |
| Italian                 | it      |
| Portuguese              | pt      |
| Dutch                   | nl      |
| Lingala                 | ln      |
| Japanese                | ja      |
| Chinese                 | zh      |
| Finnish                 | fi      |
| Korean                  | ko      |
| Polish                  | pl      |
| Russian                 | ru      |
| Turkish                 | tr      |
| Ukrainian               | uk      |
| Vietnamese              | vi      |
| Afrikaans               | af      |
| Albanian                | sq      |
| Amharic                 | am      |
| Arabic                  | ar      |
| Armenian                | hy      |
| Assamese                | as      |
| Azerbaijani             | az      |
| Bashkir                 | ba      |
| Basque                  | eu      |
| Belarusian              | be      |
| Bengali                 | bn      |
| Bosnian                 | bs      |
| Breton                  | br      |
| Bulgarian               | bg      |
| Burmese                 | my      |
| Catalan                 | ca      |
| Croatian                | hr      |
| Czech                   | cs      |
| Danish                  | da      |
| Estonian                | et      |
| Faroese                 | fo      |
| Galician                | gl      |
| Georgian                | ka      |
| Greek                   | el      |
| Haitian                 | ht      |
| Hausa                   | ha      |
| Hawaiian                | haw     |
| Hebrew                  | he      |
| Hungarian               | hu      |
| Icelandic               | is      |
| Indonesian              | id      |
| Javanese                | jw      |
| Kazakh                  | kk      |
| Khmer                   | km      |
| Lao                     | lo      |
| Latin                   | la      |
| Latvian                 | lv      |
| Lithuanian              | lt      |
| Luxembourgish           | lb      |
| Macedonian              | mk      |
| Malagasy                | mg      |
| Malay                   | ms      |
| Maltese                 | mt      |
| Maori                   | mi      |
| Mongolian               | mn      |
| Nepali                  | ne      |
| Norwegian               | no      |
| Norwegian Nynorsk       | nn      |
| Occitan                 | oc      |
| Pashto                  | ps      |
| Persian                 | fa      |
| Romanian                | ro      |
| Serbian                 | sr      |
| Shona                   | sn      |
| Slovak                  | sk      |
| Slovenian               | sl      |
| Somali                  | so      |
| Sundanese               | su      |
| Swahili                 | sw      |
| Swedish                 | sv      |
| Tagalog                 | tl      |
| Tajik                   | tg      |
| Tatar                   | tt      |
| Thai                    | th      |
| Tibetan                 | bo      |
| Turkmen                 | tk      |
| Uzbek                   | uz      |
| Welsh                   | cy      |
| Yiddish                 | yi      |
| Yoruba                  | yo      |