// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: { 
    type: String, 
    required: true, 
    unique: true 
  },
  name: { 
    type: String, 
    required: true 
  },
  userType: { 
    type: String, 
    enum: ['customer', 'mechanic'], 
    required: true 
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: false
    }
  },
  upiId: { 
    type: String,
    required: function() { return this.userType === 'mechanic'; }
  },
  isAvailable: {
    type: Boolean,
    default: true,
    required: function() { return this.userType === 'mechanic'; }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create geospatial index for location queries
userSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('User', userSchema);