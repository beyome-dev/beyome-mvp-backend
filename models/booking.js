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
    checkInTime: { type: String, required: false }, // "HH:MM"
    checkOutTime: { type: String, required: false }, // "HH:MM"
    status: {
        type: String,
        enum: ["booked", "completed", "cancelled","no-show","in-progress","rescheduled"],
        required: true,
        default: "booked",
    },
    personalNotes: { type: [String], required: false }, 
    userFeedback: {
        type: String
    },
    clientFeedback: {
        type: [FeedbackSchema]
    },
    googleEventId: { type: String, required: false },
});

BookingSchema.index({ handler: 1, client: 1, status: 1, date: -1 });

module.exports = mongoose.model("Booking", BookingSchema);