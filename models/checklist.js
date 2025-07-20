const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ChecklistSchema = new Schema({
    client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    booking: { type: Schema.Types.ObjectId, ref: 'Booking' }, // Optional
    item: { type: String, required: true },
    completed: { type: Boolean, default: false },
    dateCompleted: { type: Date },
    category: { type: String, enums: ['Message', 'Payment', 'Activity', 'Documentation', 'Forms','My tasks', 'Client tasks'] },
    dueDate: { type: Date },
    priority: { type: Number, min: 0, max: 5, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Checklist', ChecklistSchema);