import mongoose from "mongoose";

const AppConfigSchema = new mongoose.Schema({
  version: { type: String, required: true },
  enabled: { type: Boolean, default: true },

  transcription: {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    apiKeyRef: { type: String },
    language: { type: String, default: "en" },
    diarization: { type: Boolean, default: false }
  },

  aiGeneration: {
    provider: { type: String, required: true },
    model: { type: String, required: true },
    temperature: { type: Number, default: 0.2 },
    maxTokens: { type: Number, default: 1024 }
  },

  runtime: {
    concurrency: { type: Number, default: 4 },
    timeoutMs: { type: Number, default: 600000 }
  },

  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export default mongoose.models.AppConfig || mongoose.model("AppConfig", AppConfigSchema);