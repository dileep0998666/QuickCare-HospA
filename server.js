// hospital-server/server.js
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const { setInfo, getInfo } = require('./hospitalData');


const adminRoutes = require('./routes/adminRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

let hospitalInfo = {};

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.post('/register', (req, res) => {
  console.log(' Incoming registration:', req.body); // ADD THIS LINE

  const { name, location, contact, username, password } = req.body;
  if (!name || !location || !contact || !username || !password) {
    return res.status(400).send(' Missing fields');
  }

  setInfo({ name, location, contact, username, password });
  console.log(' Hospital info saved:', { name, username });

  res.send(' Hospital registered successfully. <a href="/admin/login">Login</a>');
});

app.get('/hospital-info', (req, res) => {
  const info = getInfo();
  console.log(' Serving hospital info:', info); // add this line

  res.json({
    name: info.name,
    location: info.location,
    contact: info.contact
  });
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Hospital server running on port ${PORT}`));

