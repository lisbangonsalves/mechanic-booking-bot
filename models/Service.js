// models/Service.js
const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Flat tire', 'Engine breakdown', 'Oil leak', 'dont know'],
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  description: {
    type: String
  }
});

module.exports = mongoose.model('Service', serviceSchema);