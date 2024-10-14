// models/Event.js
const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, unique: true, required: true }, // e.g., 'coastal-trip'
    description: { type: String, required: true },
    date: { type: Date, required: true },
    image: { type: String },
});

module.exports = mongoose.model('Event', eventSchema);
