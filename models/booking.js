// models/booking.js
const mongoose = require("mongoose");
const { google } = require("../config");
const Schema = mongoose.Schema;

const FeedbackSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true }
});

const BookingSchema = new mongoose.Schema({
    customerName: { type: String, required: true },
    visitType: { 
        type: String, 
        enum: [
            'Follow-Up', 
            'Orientation', 
            'Consultation', 
            'Assessment', 
            'Therapy', 
            'Medication Management', 
            'Crisis Intervention', 
            'Group Therapy', 
            'Family Therapy', 
            'Teletherapy', 
            'In-Person Therapy'
        ],
        required: true
    },
    appointmentType: { 
        type: String, 
        enum: [
            'online', 
            'offline',
        ],
        required: true
    },
    client: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    handler: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    organization: {
        type: Schema.Types.ObjectId,
        ref: 'Organization',
    },
    // recordingNote: {
    //     type: Schema.Types.ObjectId,
    //     ref: 'Note',
    //     required: false
    // },
    dictationNote: {
        type: Schema.Types.ObjectId,
        ref: 'Note',
        required: false
    },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    time: { type: String, required: true }, // "HH:MM"
    checkInTime: { type: Date, required: false }, // changed to Date
    checkOutTime: { type: Date, required: false }, // changed to Date
    status: {
        type: String,
        enum: ["scheduled", "cancelled","no-show","in-progress","rescheduled","pending-review", "generating-note", "completed"],
        required: true,
        default: "scheduled",
    },
    personalNotes: { type: [String], required: false }, 
    userFeedback: {
        type: String
    },
    clientFeedback: {
        type: [FeedbackSchema]
    },
    sessionCost: { type: Number, required: false },
    sessionCostPaid: { type: Boolean, default: false },
    sessionCostPaidDate: { type: String, required: false }, // "YYYY-MM-DD"
    sessionCostPaidTime: { type: String, required: false }, // "HH:MM"
    sessionCostPaidMethod: { 
        type: String, 
        enum: [
            'credit_card', 
            'debit_card', 
            'cash', 
            'insurance', 
            'upi',
            'other'
        ],
        required: false
    },
    googleEventId: { type: String, required: false },
});

BookingSchema.index({ handler: 1, client: 1, status: 1, date: -1 });

module.exports = mongoose.model("Booking", BookingSchema);