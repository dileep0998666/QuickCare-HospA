const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  specialization: {
    type: String,
    required: true
  },
  fee: {
    type: Number,
    required: true  // ✅ Ensure fee is always provided
  },
  schedule: [String],
  queue: [
    {
      name: String,
      gender: String,
      reason: String,
      age: Number,
      location: String
    }
  ],
  active: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Doctor', doctorSchema);
