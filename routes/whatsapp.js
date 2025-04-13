// routes/whatsapp.js
const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');

// WhatsApp webhook endpoint
router.post('/webhook', whatsappController.handleIncomingMessage);

module.exports = router;