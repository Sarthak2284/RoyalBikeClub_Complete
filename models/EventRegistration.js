const mongoose = require('mongoose');

const eventRegistrationSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    event: String,
    paymentStatus: { type: String, default: 'Pending' }, // Track payment
    status: { type: String, default: 'Pending' } // Track approval
});

module.exports = mongoose.model('EventRegistration', eventRegistrationSchema);
