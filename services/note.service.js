const config = require('../config');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const SALAD_API_URL = 'https://api.salad.com/api/public/organizations/beyome/inference-endpoints/transcribe/jobs';
const SALAD_API_KEY = config.salad.apiKey;
const WEBHOOK_URL = `${config.APP_URL}/api/webhook/salad`;

const uploadDir = path.join(__dirname, '../uploads');

// Ensure upload directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

module.exports.saveAudio = async (file) => {
    try {
        const filePath = path.join(uploadDir, file.filename);
        const fileUrl = `/uploads/${file.filename}`;

        // Move file to uploads directory (if needed)
        fs.renameSync(file.path, filePath);

        // 🔹 Call Salad API for transcription
        const transcriptResponse = await requestTranscription(fileUrl);

        console.log('Transcript response:', transcriptResponse);
        return {
            fileUrl,
            transcriptJobId: transcriptResponse?.id || null
        };
    } catch (error) {
        throw new Error('Error saving file');
    }
};

// Function to request transcription from Salad API
const requestTranscription = async (fileUrl) => {
    try {
        const response = await axios.post(
            SALAD_API_URL,
            {
                input: {
                    url: 'https://drive.google.com/uc?export=download&id=1z2nFZQF8sotyeFHbFY7JtMyqMqCEZJBc',//`${config.APP_URL}/${fileUrl}`, // Adjust with your base URL
                    diarization: true,
                    language_code: 'en',
                    overall_sentiment_analysis: false,
                    sentence_level_timestamps: true,
                    summarize: 100
                },
                webhook: WEBHOOK_URL
            },
            {
                headers: {
                    'Salad-Api-Key': SALAD_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error('Salad API Error:', error.response?.data || error.message);
        throw new Error('Error requesting transcription');
    }
};


/**
 * Generates a SOAP note based on the provided transcript data.
 * @param {string} transcript - The transcript text from Salad.
 * @param {object} io - The Socket.io instance to emit the result.
 */
module.exports.generateSOAPNote = async (transcriptPayload, io) => {
    try {

        const transcript = extractSpeakerSentencesFromTimestamps(transcriptPayload);

        const prompt = `Based on the following transcript, generate a SOAP note:\n\n${transcript}`;

        const result = await model.generateContent(prompt);

        const soapNote = result.response.text();

        // Emit the SOAP note to the frontend
        io.emit('soapNoteGenerated', { soapNote });

        return soapNote;
    } catch (error) {
        console.error('Error generating SOAP note:', error.message);
        throw new Error('Failed to generate SOAP note');
    }
};


const extractSpeakerSentencesFromTimestamps = (payload) => {
    const speakerSentences = {};
  
    payload.output.sentence_level_timestamps.forEach(sentence => {
      const { speaker, text } = sentence;
  
      if (!speakerSentences[speaker]) {
        speakerSentences[speaker] = [];
      }
  
      speakerSentences[speaker].push(text);
    });
  
    // Combine sentences into a single string for each speaker
    for (const speaker in speakerSentences) {
      speakerSentences[speaker] = speakerSentences[speaker].join(' ');
    }
  
    return speakerSentences;
  };
