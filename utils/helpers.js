// utils/helpers.js
const User = require('../models/User');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Razorpay = require('razorpay');

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Generate a 6-digit OTP
exports.generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Find mechanics within radius (in meters)
exports.findNearbyMechanics = async (coordinates, radius) => {
  try {
    return await User.find({
      userType: 'mechanic',
      isAvailable: true,
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates
          },
          $maxDistance: radius
        }
      }
    });
  } catch (error) {
    console.error('Error finding nearby mechanics:', error);
    throw error;
  }
};

// Generate QR code for payment
exports.generatePaymentQR = async (upiId, amount, description) => {
  try {
    const upiURL = `upi://pay?pa=${upiId}&pn=MechanicBooking&am=${amount}&cu=INR&tn=${encodeURIComponent(description)}`;
    
    const qrCodeOutputDir = path.join(__dirname, '../public/qrcodes');
    
    // Ensure directory exists
    if (!fs.existsSync(qrCodeOutputDir)) {
      fs.mkdirSync(qrCodeOutputDir, { recursive: true });
    }
    
    const fileName = `payment-${Date.now()}.png`;
    const filePath = path.join(qrCodeOutputDir, fileName);
    
    await qrcode.toFile(filePath, upiURL, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 300
    });
    
    // Return public URL to the QR code
    return `${process.env.BASE_URL || 'http://localhost:3000'}/qrcodes/${fileName}`;
  } catch (error) {
    console.error('Error generating payment QR:', error);
    throw error;
  }
};

// Create Razorpay payment link
exports.sendPaymentLink = async (booking) => {
  try {
    // Create Razorpay payment link
    const paymentLink = await razorpay.paymentLink.create({
      amount: booking.price * 100, // Amount in paise
      currency: 'INR',
      accept_partial: false,
      description: `Payment for ${booking.service.type} service`,
      customer: {
        name: booking.customer.name,
        contact: booking.customer.phoneNumber.replace('whatsapp:', '')
      },
      notify: {
        sms: true,
        email: false
      },
      reminder_enable: true,
      notes: {
        booking_id: booking._id.toString()
      },
      callback_url: `${process.env.BASE_URL}/api/payment/callback`,
      callback_method: 'get'
    });
    
    // Generate and return QR code for the admin's UPI ID
    return await exports.generatePaymentQR(
      process.env.ADMIN_UPI_ID,
      booking.price,
      `Payment for ${booking.service.type} service`
    );
  } catch (error) {
    console.error('Error creating payment link:', error);
    // Fall back to UPI QR code if Razorpay fails
    return await exports.generatePaymentQR(
      process.env.ADMIN_UPI_ID,
      booking.price,
      `Payment for ${booking.service.type} service`
    );
  }
};

// Process UPI transfer to mechanic
exports.transferToMechanic = async (booking) => {
  // In a real implementation, you would use a UPI API to transfer money
  // For now, we'll just log the transfer
  console.log(`Transferring ₹${booking.price * 0.83} to mechanic ${booking.mechanic.name} at UPI ID: ${booking.mechanic.upiId}`);
  console.log(`Platform fee: ₹${booking.price * 0.17}`);
  
  // In production, implement actual UPI transfer logic here
  
  return true;
};