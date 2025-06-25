const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getInfo } = require('../hospitalData');
const authMiddleware = require('../authMiddleware');

const router = express.Router();

router.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const stored = getInfo();

  console.log('🔐 Login attempt:', username, password);
  console.log('🧾 Stored credentials:', stored);

  if (username === stored.username && password === stored.password) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '1h' });
    return res.json({ token });
  }

  res.status(401).send('Invalid credentials');
});

router.get('/dashboard',  (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

module.exports = router;
