const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema({
  name: String,
  specialization: String,
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
