// routes/payment.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

// Payment callback from Razorpay
router.get('/callback', paymentController.handlePaymentCallback);

// Add this to app.js routes section
// app.use('/api/payment', require('./routes/payment'));

module.exports = router;