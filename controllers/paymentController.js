// controllers/paymentController.js
const Booking = require('../models/Booking');
const User = require('../models/User');
const twilioClient = require('../utils/twilioClient');
const { generateOTP } = require('../utils/helpers');

exports.handlePaymentCallback = async (req, res) => {
  try {
    const { booking_id, razorpay_payment_id, status } = req.query;
    
    if (!booking_id || status !== 'paid') {
      return res.status(400).send('Invalid payment');
    }
    
    const booking = await Booking.findById(booking_id)
      .populate('customer')
      .populate('mechanic')
      .populate('service');
    
    if (!booking) {
      return res.status(404).send('Booking not found');
    }
    
    // Update booking status
    booking.status = 'in_progress';
    booking.paymentId = razorpay_payment_id;
    await booking.save();
    
    // Send mechanic the customer's location
    await twilioClient.sendMessage(
      booking.mechanic.phoneNumber,
      `Payment received for ${booking.service.type} service. Please go to customer's location.`,
    );
    
    // Send location as a separate message
    await twilioClient.sendMessage(
      booking.mechanic.phoneNumber,
      `Customer location: https://www.google.com/maps?q=${booking.customerLocation.coordinates[1]},${booking.customerLocation.coordinates[0]}\n\nPlease confirm when you reach the customer's location by replying "I reached"`
    );
    
    // Notify customer
    await twilioClient.sendMessage(
      booking.customer.phoneNumber,
      `Your payment has been received. Mechanic ${booking.mechanic.name} is on the way to your location. Please confirm when the mechanic arrives by replying "Reached".`
    );
    
    return res.redirect(`${process.env.BASE_URL}/payment/success`);
  } catch (error) {
    console.error('Error handling payment callback:', error);
    return res.status(500).send('Internal Server Error');
  }
};

exports.handleMechanicArrival = async (req, res) => {
  try {
    const { Body, From } = req.body;
    const phoneNumber = From;
    
    const mechanic = await User.findOne({ phoneNumber });
    if (!mechanic || mechanic.userType !== 'mechanic') {
      return res.status(400).send('Not a registered mechanic');
    }
    
    // Find the active booking for this mechanic
    const booking = await Booking.findOne({
      mechanic: mechanic._id,
      status: 'in_progress'
    }).populate('customer');
    
    if (!booking) {
      await twilioClient.sendMessage(phoneNumber, 'No active booking found.');
      return res.status(200).send('OK');
    }
    
    if (Body.toLowerCase() === 'i reached') {
      // Check if customer has also confirmed
      if (booking.mechanicArrived) {
        // Generate OTP
        const otp = generateOTP();
        booking.otp = otp;
        await booking.save();
        
        // Send OTP to customer
        await twilioClient.sendMessage(
          booking.customer.phoneNumber,
          `Your OTP is ${otp}. Please share this with the mechanic once the service is completed.`
        );
        
        // Notify mechanic
        await twilioClient.sendMessage(
          phoneNumber,
          'Please ask the customer for the OTP once the service is completed. Reply with the OTP to complete the service.'
        );
      } else {
        booking.mechanicArrived = true;
        await booking.save();
        
        await twilioClient.sendMessage(
          phoneNumber,
          'Thank you for confirming your arrival. Waiting for customer confirmation.'
        );
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling mechanic arrival:', error);
    res.status(500).send('Internal Server Error');
  }
};

exports.handleCustomerConfirmation = async (req, res) => {
  try {
    const { Body, From } = req.body;
    const phoneNumber = From;
    
    const customer = await User.findOne({ phoneNumber });
    if (!customer || customer.userType !== 'customer') {
      return res.status(400).send('Not a registered customer');
    }
    
    // Find the active booking for this customer
    const booking = await Booking.findOne({
      customer: customer._id,
      status: 'in_progress'
    }).populate('mechanic');
    
    if (!booking) {
      await twilioClient.sendMessage(phoneNumber, 'No active booking found.');
      return res.status(200).send('OK');
    }
    
    if (Body.toLowerCase() === 'reached') {
      // Check if mechanic has also confirmed
      if (booking.mechanicArrived) {
        // Generate OTP
        const otp = generateOTP();
        booking.otp = otp;
        await booking.save();
        
        // Send OTP to customer
        await twilioClient.sendMessage(
            booking.customer.phoneNumber,
            `Your OTP is ${otp}. Please share this with the mechanic once the service is completed.`
          );
          
          // Notify mechanic
          await twilioClient.sendMessage(
            booking.mechanic.phoneNumber,
            'Please ask the customer for the OTP once the service is completed. Reply with the OTP to complete the service.'
          );
        } else {
          booking.customerConfirmed = true;
          await booking.save();
          
          await twilioClient.sendMessage(
            phoneNumber,
            'Thank you for confirming the mechanic\'s arrival. Waiting for mechanic confirmation.'
          );
        }
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling customer confirmation:', error);
      res.status(500).send('Internal Server Error');
    }
  };
  
  exports.completeService = async (req, res) => {
    try {
      const { Body, From } = req.body;
      const phoneNumber = From;
      
      const mechanic = await User.findOne({ phoneNumber });
      if (!mechanic || mechanic.userType !== 'mechanic') {
        return res.status(400).send('Not a registered mechanic');
      }
      
      // Find the active booking for this mechanic
      const booking = await Booking.findOne({
        mechanic: mechanic._id,
        status: 'in_progress'
      }).populate('customer').populate('service');
      
      if (!booking) {
        await twilioClient.sendMessage(phoneNumber, 'No active booking found.');
        return res.status(200).send('OK');
      }
      
      // Check if OTP matches
      if (booking.otp && Body === booking.otp) {
        // Complete the booking
        booking.status = 'completed';
        booking.completedAt = new Date();
        await booking.save();
        
        // Transfer money to mechanic (in a real implementation)
        const mechanicShare = Math.floor(booking.price * 0.83); // 83% to mechanic
        const platformFee = booking.price - mechanicShare; // 17% platform fee
        
        // In a real implementation, use a payment gateway to transfer funds
        console.log(`Transferring ₹${mechanicShare} to mechanic at UPI: ${mechanic.upiId}`);
        console.log(`Platform fee: ₹${platformFee}`);
        
        // Notify mechanic
        await twilioClient.sendMessage(
          mechanic.phoneNumber,
          `Service completed successfully! ₹${mechanicShare} has been transferred to your UPI ID. Thank you for your service.`
        );
        
        // Notify customer
        await twilioClient.sendMessage(
          booking.customer.phoneNumber,
          `Your ${booking.service.type} service has been completed successfully! Thank you for using our service.`
        );
        
        // Make mechanic available again
        mechanic.isAvailable = true;
        await mechanic.save();
      } else {
        await twilioClient.sendMessage(phoneNumber, 'Invalid OTP. Please try again.');
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error completing service:', error);
      res.status(500).send('Internal Server Error');
    }
  };