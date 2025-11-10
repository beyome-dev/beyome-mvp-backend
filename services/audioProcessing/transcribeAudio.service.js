const axios = require('axios');
const config = require('../../config');
const { duration } = require('moment');
const { AssemblyAI } = require('assemblyai');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');


const uploadDir = path.join(__dirname, '../uploads');
const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;
const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';
const SALAD_API_KEY = config.transcriptionConfig.saladAPIKey;
const OPENAI_API_KEY = config.transcriptionConfig.openAIAPIKey;
const ASSEMBLYAI_API_KEY = config.transcriptionConfig.assemblyAIAPIKey;
const transcriptionTool = config.transcriptionConfig.default || 'openai';

const openAIClient = new OpenAI({
  apiKey: OPENAI_API_KEY, 
});
const assemblyAIClient = new AssemblyAI({
  apiKey: ASSEMBLYAI_API_KEY,
});

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Function to request transcription from Salad API
const requestTranscription = async (file, recordingId) => {
    try {

        // Upload to Cloud Storage
        // const { url, key } = await uploadToCloud({
        //   file: audioFile,
        //   folder: `audio/${therapistId}/${sessionId}`,
        //   fileName: `${Date.now()}-${audioFile.originalname}`
        // });

        const filePath = path.join(uploadDir, file.filename);
        let fileUrl =`${config.APP_URL}/files/${file.filename}`;
        if (process.env.NODE_ENV === 'development') {
            fileUrl = `https://drive.google.com/uc?export=download&id=1aTdDS9oGf80MbG2kicOlEKqEcA_Do47i`
        }
        // Move file to uploads directory
        fs.renameSync(file.path, filePath);

        console.log(`Requesting transcription using tool: ${transcriptionTool}`);
        switch (transcriptionTool) {
            case 'openai':
                const openAIData = await openaiTranscribeAudioService(filePath, recordingId);
                return await formatTranscriptResponseFromTool(openAIData, 'openai');
            case 'assemblyai':
                const assemblyAIData = await assemblyAITranscribeAudioService(filePath, recordingId);
                return await formatTranscriptResponseFromTool(assemblyAIData, 'assemblyai');
            case 'salad':
                const data = await saladTranscribeAudioService(fileUrl, recordingId);
                return await formatTranscriptResponseFromTool(data, 'salad');
            default:
                throw new Error('Unsupported transcription tool');
        }
    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
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
const formatTranscriptResponseFromTool = async (transcriptData, format) => {
    switch (format) {
        case 'salad':
            return await saladFormat(transcriptData);
        case 'openai':
            return await openAIFormat(transcriptData);
        case 'assemblyai':
            return await assemblyAIFormat(transcriptData);
        default:
            throw new Error('Unsupported transcription tool for formatting');
    }
}  
    
const saladFormat = async (transcriptData) => {
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
    let timeStamps = [];
    let speakerLabels = [];

    transcriptData.output.sentence_level_timestamps.forEach(sentence => {
      const { speaker, text, start, end, timestamp } = sentence;
      timeStamps.push({ text, start, end });
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
            timestamps: timeStamps,
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

const saladTranscribeAudioService = async (fileUrl, recordingId) => {
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
    return response.data;
}

/**
 * Transcribes an audio file using OpenAI's transcription API.
 * @param {string} audioFile - The path to the audio file to be transcribed.
 * @param {Array<string>} [speakerNames=[]] - Optional array of known speaker names.
 * @returns {Promise<Object>} The transcription result from OpenAI.
 */
const openaiTranscribeAudioService = async (audioFile, speakerNames = []) => {
//   const speakerRef = fs.readFileSync(audioFile).toString("base64");
  let modelName = "gpt-4o-transcribe-diarize"; // Default model name

  // Verify file exists
    if (!fs.existsSync(audioFile)) {
      throw new Error(`Audio file not found: ${audioFile}`);
    }
    try {
        const extraBody = {};
        // if (speakerRef) {
        //   extraBody.known_speaker_names = ["therapist", "patient"];
        //   extraBody.known_speaker_references = [`data:audio/wav;base64,${speakerRef}`];
        // }

        const transcript = await openAIClient.audio.transcriptions.create({
            file: fs.createReadStream(audioFile),
            model: modelName,
            response_format: "diarized_json",
            chunking_strategy: "auto",
            //   extra_body: extraBody,
        });

        console.log("OpenAI Transcript Data",transcript);
        return transcript;
    } catch (error) {
    if (error.message && error.message.includes("model not found")) {
      // Fallback to a supported model if available
      modelName = "whisper-1";
      const transcript = await openAIClient.audio.transcriptions.create({
        file: fs.createReadStream(audioFile),
        model: modelName,
        response_format: "json",
      });
      return transcript;
    } else {
      throw error;
    }
  }
};

const openAIFormat = async (transcriptData) => {

    if (!transcriptData) {
        throw new Error("Failed to get transcription data from OpenAI");
    }
    
    let speakerSentences = '';
    let currentSpeaker = ''
    let timeStamps = [];
    let speakerLabels = [];
    transcriptData.segments.forEach(segment => {
      const { speaker, text, start, end } = segment;
      timeStamps.push({ text, start, end });
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
        duration: transcriptData.duration,
        transcriptionMetadata: {
            provider: 'openai',
            model: 'whisper-1',
            // jobId: transcriptData.id,
            language: 'en',
            confidence: transcriptData.segments?.reduce((acc, s) => acc + (s.confidence || 0), 0) / 
                    (response.data.segments?.length || 1),
            sentiment: analyzeSentiment(1),
            timestamps: timeStamps,
            speakerLabels: speakerLabels,
            processedAt: new Date(),
            // processingTime: (new Date(transcriptData.update_time) - new Date(transcriptData.create_time)) / 1000
        }
    }
}

const assemblyAITranscribeAudioService = async (audioFile, recordingId) => {

    const params = {
        audio: audioFile,
        speech_model: "universal",
        speaker_labels: true,
    };

    const transcript = await assemblyAIClient.transcripts.transcribe(params);

    if (transcript.status === "error") {
        throw new Error(`Transcription failed: ${transcript.error}`);
    }
    // Return transcript job info
    return transcript;
}

const assemblyAIFormat = async (transcriptData) => {

    if (!transcriptData) {
        throw new Error("Failed to get transcription data from AssemblyAI");
    }
    let speakerSentences = '';
    let currentSpeaker = ''
    let timeStamps = [];
    let speakerLabels = [];
    for (const utterance of transcriptData.utterances) {
        const { speaker, text, start, end, confidence } = utterance;
        timeStamps.push({ text, start, end });
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
    }
    return {
        transcriptionText: speakerSentences,
        transcriptionStatus: 'completed',
        duration: transcriptData.duration,
        transcriptionMetadata: {
            provider: 'assemblyai',
            model: 'universal',
            jobId: transcriptData.id,
            language: 'en',
            confidence: transcriptData.confidence,
            timestamps: timeStamps,
            speakerLabels: speakerLabels,
            processedAt: new Date(),
            // processingTime: (new Date(transcriptData.update_time) - new Date(transcriptData.create_time)) / 1000
        }
    }
}

module.exports =  {
    requestTranscription,
    fetchTranscriptionStatus,
}