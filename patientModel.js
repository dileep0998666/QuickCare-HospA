
const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  name: String,
  gender: String,
  reason: String,
  age: Number,
  location: String,
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor'
  },
  visitedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Patient', patientSchema);
