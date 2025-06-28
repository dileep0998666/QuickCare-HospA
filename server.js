require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const Doctor = require('./doctorModel');


const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Fixed hospital name
const HOSPITAL_NAME = "ABC Hospital";

// Admin page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin.html'));
});

// Add doctor
app.post('/api/doctors', async (req, res) => {
  const { name, specialization, schedule } = req.body;
  const newDoc = await Doctor.create({ name, specialization, schedule, queue: [] });
  res.json(newDoc);
});

// Get active doctors (for central app)
app.get('/api/doctors', async (req, res) => {
  const docs = await Doctor.find({ active: true }, '-queue');
  res.json({ hospital: HOSPITAL_NAME, doctors: docs });
});

// Admin only: fetch all doctors
// Admin: Get ALL doctors (active and inactive)
app.get('/api/admin/doctors', async (req, res) => {
  const doctors = await Doctor.find();
  res.json({ doctors });
});

// Get queue
app.get('/api/doctors/:id/queue', async (req, res) => {
  const doc = await Doctor.findById(req.params.id);
  res.json({ queue: doc.queue });
});

// Join queue
const Patient = require('./patientModel');

app.post('/api/doctors/:id/join', async (req, res) => {
  const doctor = await Doctor.findById(req.params.id);
  if (!doctor) return res.status(404).json({ error: "Doctor not found" });

  const patient = {
    name: req.body.name,
    gender: req.body.gender,
    reason: req.body.reason,
    age: req.body.age,
    location: req.body.location
  };

  // Add to queue
  doctor.queue.push(patient);
  await doctor.save();

  // Save to patient history (permanent)
  await Patient.create({
    ...patient,
    doctorId: doctor._id
  });

  res.json({ position: doctor.queue.length });
});



// Get patient status in queue
app.get('/api/doctors/:id/status', async (req, res) => {
  const { name } = req.query;
  const doc = await Doctor.findById(req.params.id);
  const pos = doc.queue.findIndex(p => p.name === name);
  res.json({ position: pos >= 0 ? pos + 1 : null });
});

// Next patient (dequeue)
app.post('/api/doctors/:id/next', async (req, res) => {
  const doc = await Doctor.findById(req.params.id);
  const [next, ...rest] = doc.queue;
  doc.queue = rest;
  await doc.save();
  res.json({ next });
});

// Toggle active/inactive
// Toggle doctor active/inactive
app.post('/api/admin/doctors/:id/toggle', async (req, res) => {
  const doc = await Doctor.findById(req.params.id);
  if (!doc) return res.status(404).json({ error: "Doctor not found" });

  doc.active = !doc.active;
  await doc.save();
  res.json({ active: doc.active });
});

app.get('/api/admin/patients/:doctorId', async (req, res) => {
  const patients = await Patient.find({ doctorId: req.params.doctorId });
  res.json({ patients });
});
app.get('/api/admin/patients', async (req, res) => {
  const patients = await Patient.find().populate('doctorId');
  res.json({ patients });
});

// Connect to MongoDB and start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log(" MongoDB connected");
    app.listen(process.env.PORT || 3001, () =>
      console.log("🚀 Hospital server running at http://localhost:3001/admin")
    );
  })
  .catch(err => console.error(" MongoDB failed:", err));


 