const axios = require('axios');
const config = require('../../config');
const { duration } = require('moment');

const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';
const SALAD_API_KEY = config.salad.apiKey;


// Function to request transcription from Salad API
const requestTranscription = async (fileUrl, recordingId) => {
    try {
        const response = await axios.post(
            SALAD_API_URL,
            {
                input: {
                    url: fileUrl,
                    return_as_file: false,
                    language_code: "en",
                    sentence_level_timestamps: false,
                    word_level_timestamps: false,
                    diarization: false,
                    sentence_diarization: true,
                    srt: false,
                    summarize: 0,
                    overall_sentiment_analysis: false

                },
                webhook: WEBHOOK_URL+`?id=${recordingId}`
            },
            {
                headers: {
                    'Salad-Api-Key': SALAD_API_KEY, 
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return await formatTranscriptResponseFromTool(response.data);
    } catch (error) {
        console.error('Salad API Error:', error.response?.data || error.message);
        throw new Error('Error requesting transcription');
    }
};

const fetchTranscriptionStatus = async (jobId) => {
    try {
        const response = await axios.get(`${SALAD_API_URL}/${jobId}`, {
            headers: { 'Salad-Api-Key': SALAD_API_KEY }
        });
        
        return await formatTranscriptResponseFromTool(response.data);
    } catch (error) {
        console.error('Salad API Error:', error.response?.data || error.message);
        throw new Error('Error fetching transcription status');
    }
}

// Handle and format the response from Salad API, both create and get job APIs
const formatTranscriptResponseFromTool = async (transcriptData) => {
    
    if (!transcriptData) {
        throw new Error("Failed to get transcription data from Salad");
    }
    if (transcriptData.status == 'pending' || transcriptData.status == 'running') {
        return {
            transcriptionText: "Generating...",
            transcriptionStatus: 'processing',
            transcriptionMetadata: {
                jobId: transcriptData.id,
                provider: 'salad',
                model: 'salad',
                language: 'en',
            }
        }
    }
    if  (transcriptData.status != 'succeeded' || !transcriptData.output) {
        throw new Error("Failed to get transcription data from Salad");
    }

    console.log(`Job ${transcriptData.id} succeeded, processing SOAP note...`);
    if (transcriptData.output.error && transcriptData.output.error != '') {
        throw new Error(transcriptData.output.error);
    }

    let speakerSentences = '';
    let currentSpeaker = ''
    let timpeStamps = [];
    let speakerLabels = [];

    transcriptData.output.sentence_level_timestamps.forEach(sentence => {
      const { speaker, text, start, end, timestamp } = sentence;
      timpeStamps.push({ text, start, end });
      if (speaker) {
        speakerLabels.push({ speaker, startTime: start, endTime: end, text });
      }
      if (currentSpeaker != speaker) {
        if (speaker) {
            currentSpeaker = speaker
        }
        speakerSentences += `\n ${currentSpeaker}: ${text}`
      } else {
        speakerSentences += ` ${text}`
      }
    });

    return {
        transcriptionText: speakerSentences,
        transcriptionStatus: 'completed',
        duration: transcriptData.output?.duration_in_seconds,
        transcriptionMetadata: {
            jobId: transcriptData.id,
            provider: 'salad',
            model: 'salad',
            language: 'en',
            // confidence: transcriptData.segments?.reduce((acc, s) => acc + (s.confidence || 0), 0) / 
            //         (response.data.segments?.length || 1),
            sentiment: analyzeSentiment(transcriptData.output.overall_sentiment),
            timestamps: timpeStamps,
            speakerLabels: speakerLabels,
            processedAt: new Date(),
            processingTime: (new Date(transcriptData.update_time) - new Date(transcriptData.create_time)) / 1000
        }
    }
}

/**
 * Analyze sentiment
 */
function analyzeSentiment(text) {
  // Placeholder - integrate with sentiment analysis service
  // or use a library like sentiment.js
  return {
    score: 0.5,
    label: 'neutral'
  };
}


module.exports =  {
    requestTranscription,
    fetchTranscriptionStatus,
}