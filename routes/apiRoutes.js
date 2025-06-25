const express = require('express');
const router = express.Router();

let doctors = [];
let appointments = [];
let schedules = [];

router.get('/doctors', (req, res) => {
  res.json(doctors);
});

router.post('/doctors', (req, res) => {
  const { name, specialization } = req.body;
  const newDoctor = {
    id: doctors.length + 1,
    name,
    specialization
  };
  doctors.push(newDoctor);
  res.status(201).json(newDoctor);
});

router.post('/schedule', (req, res) => {
  const { doctor_id, time } = req.body;
  schedules.push({ doctor_id, time });
  res.json({ message: 'Schedule set successfully' });
});

router.post('/appointments', (req, res) => {
  const { doctor_id, patient_name, time } = req.body;
  appointments.push({ doctor_id, patient_name, time });
  res.json({ message: 'Appointment confirmed' });
});

module.exports = router;
