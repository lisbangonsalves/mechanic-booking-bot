// app.js - Updated version
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/payment', require('./routes/payment'));

// Simple success page for payment redirection
app.get('/payment/success', (req, res) => {
  res.send('Payment successful! You can close this window and return to WhatsApp.');
});

// Initialize services in the database
const initializeServices = require('./utils/initializeServices');
initializeServices();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;