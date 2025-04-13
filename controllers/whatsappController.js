// controllers/whatsappController.js
const User = require('../models/User');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const twilioClient = require('../utils/twilioClient');
const { generateOTP, findNearbyMechanics, sendPaymentLink } = require('../utils/helpers');
const userSessions = require('../utils/userSessions');

exports.handleIncomingMessage = async (req, res) => {
  try {
    const { Body, From, Latitude, Longitude } = req.body;
    const phoneNumber = From; // Format: whatsapp:+1234567890
    
    // Find or initialize user session
    let session = userSessions.getSession(phoneNumber) || userSessions.createSession(phoneNumber);
    
    // Process incoming message based on current state
    let response = await processMessage(Body, phoneNumber, session, Latitude, Longitude);
    
    // Send response to WhatsApp
    await twilioClient.sendMessage(phoneNumber, response.message, response.media);
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling WhatsApp message:', error);
    res.status(500).send('Internal Server Error');
  }
};

async function processMessage(message, phoneNumber, session, latitude, longitude) {
  // Check if message is location
  const isLocation = latitude && longitude;
  
  // Initial greeting
  if (!session.state && (message.toLowerCase() === 'hi' || message.toLowerCase() === 'hello')) {
    session.state = 'INITIAL_GREETING';
    return {
      message: 'Welcome to Mechanic Booking, how can I help you?\n\n1. Register as a mechanic\n2. Get a service'
    };
  }
  
  // Process based on current state
  switch (session.state) {
    case 'INITIAL_GREETING':
      if (message === '1' || message.toLowerCase() === 'register as a mechanic') {
        session.state = 'MECHANIC_NAME';
        session.data.userType = 'mechanic';
        return { message: 'What is your name?' };
      } else if (message === '2' || message.toLowerCase() === 'get a service') {
        // Check if user exists
        const existingUser = await User.findOne({ phoneNumber });
        
        if (existingUser && existingUser.userType === 'customer') {
          session.state = 'SERVICE_SELECTION';
          session.data.userId = existingUser._id;
          return { 
            message: 'What kind of service are you looking for?\n\n1. Flat tire (₹300)\n2. Engine breakdown (₹500+)\n3. Oil leak (₹300)\n4. Don\'t know (₹500+)'
          };
        } else {
          session.state = 'CUSTOMER_NAME';
          session.data.userType = 'customer';
          return { message: 'What is your name?' };
        }
      } else {
        return { message: 'Please select one of the options:\n\n1. Register as a mechanic\n2. Get a service' };
      }
    
    case 'MECHANIC_NAME':
      session.data.name = message;
      session.state = 'MECHANIC_LOCATION';
      return { message: 'Please share your current location.' };
    
    case 'MECHANIC_LOCATION':
      if (isLocation) {
        session.data.location = {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        };
        session.state = 'MECHANIC_UPI';
        return { message: 'What is your UPI ID?' };
      } else {
        return { message: 'Please share your location using WhatsApp\'s location feature.' };
      }
    
    case 'MECHANIC_UPI':
      session.data.upiId = message;
      session.state = 'REGISTRATION_COMPLETE';
      
      // Save mechanic to database
      try {
        await new User({
          phoneNumber,
          name: session.data.name,
          userType: 'mechanic',
          location: session.data.location,
          upiId: session.data.upiId,
          isAvailable: true
        }).save();
        
        return { message: 'Registration complete! You will be notified when customers nearby need your services.' };
      } catch (error) {
        console.error('Error saving mechanic:', error);
        return { message: 'There was an error completing your registration. Please try again.' };
      }
    
    case 'CUSTOMER_NAME':
      session.data.name = message;
      
      // Save customer to database
      try {
        const newUser = await new User({
          phoneNumber,
          name: session.data.name,
          userType: 'customer'
        }).save();
        
        session.data.userId = newUser._id;
        session.state = 'SERVICE_SELECTION';
        
        return { 
          message: 'What kind of service are you looking for?\n\n1. Flat tire (₹300)\n2. Engine breakdown (₹500+)\n3. Oil leak (₹300)\n4. Don\'t know (₹500+)'
        };
      } catch (error) {
        console.error('Error saving customer:', error);
        return { message: 'There was an error completing your registration. Please try again.' };
      }
    
    case 'SERVICE_SELECTION':
      let serviceType, price;
      
      if (message === '1' || message.toLowerCase().includes('flat tire')) {
        serviceType = 'Flat tire';
        price = 300;
      } else if (message === '2' || message.toLowerCase().includes('engine')) {
        serviceType = 'Engine breakdown';
        price = 500;
      } else if (message === '3' || message.toLowerCase().includes('oil')) {
        serviceType = 'Oil leak';
        price = 300;
      } else if (message === '4' || message.toLowerCase().includes('dont know') || message.toLowerCase().includes("don't know")) {
        serviceType = 'dont know';
        price = 500;
      } else {
        return { 
          message: 'Please select a valid service option:\n\n1. Flat tire (₹300)\n2. Engine breakdown (₹500+)\n3. Oil leak (₹300)\n4. Don\'t know (₹500+)'
        };
      }
      
      session.data.serviceType = serviceType;
      session.data.price = price;
      session.state = 'CONFIRM_SERVICE';
      
      return { 
        message: `${serviceType} will cost you ₹${price}${price === 500 ? '+ (additional for parts)' : ''}. Would you like to proceed?\n\n1. Yes\n2. No`
      };
    
    case 'CONFIRM_SERVICE':
      if (message === '1' || message.toLowerCase() === 'yes') {
        session.state = 'CUSTOMER_LOCATION';
        return { message: 'Please share your current location so we can find mechanics nearby.' };
      } else if (message === '2' || message.toLowerCase() === 'no') {
        session.state = null;
        return { message: 'Sorry to hear that. Let me know if I can help you with something else.' };
      } else {
        return { message: 'Please reply with "1" for Yes or "2" for No.' };
      }
    
    case 'CUSTOMER_LOCATION':
      if (isLocation) {
        // Get the service details
        const service = await Service.findOne({ type: session.data.serviceType });
        if (!service) {
          return { message: 'Service not found. Please try again.' };
        }
        
        // Create a new booking
        const booking = await new Booking({
          customer: session.data.userId,
          service: service._id,
          status: 'pending',
          customerLocation: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          price: session.data.price
        }).save();
        
        session.data.bookingId = booking._id;
        
        // Find nearby mechanics
        const nearbyMechanics = await findNearbyMechanics(
          [parseFloat(longitude), parseFloat(latitude)],
          5000 // 5km radius
        );
        
        if (nearbyMechanics.length === 0) {
          session.state = null;
          await Booking.findByIdAndUpdate(booking._id, { status: 'cancelled' });
          return { message: 'Sorry, no mechanics are available in your area at the moment. Please try again later.' };
        }
        
        // Notify mechanics about the job
        session.data.notifiedMechanics = nearbyMechanics.map(mechanic => mechanic._id.toString());
        
        // Send job notification to all nearby mechanics
        for (const mechanic of nearbyMechanics) {
          await twilioClient.sendMessage(
            mechanic.phoneNumber,
            `There is a repair required for ${session.data.serviceType} (₹${session.data.price}). Would you like to take it?\n\n1. Yes\n2. No`,
          );
        }
        
        session.state = 'WAITING_FOR_MECHANIC';
        return { message: 'We are looking for mechanics in your area. Please wait for confirmation.' };
      } else {
        return { message: 'Please share your location using WhatsApp\'s location feature.' };
      }
    
    // Additional states for the mechanic flow will be handled in separate handlers
    default:
      return { message: 'Hi! To start over, please type "hi"' };
  }
}

// Handle mechanic accepting a job
exports.handleMechanicResponse = async (req, res) => {
  try {
    const { Body, From } = req.body;
    const phoneNumber = From;
    
    const mechanic = await User.findOne({ phoneNumber });
    if (!mechanic || mechanic.userType !== 'mechanic') {
      return res.status(400).send('Not a registered mechanic');
    }
    
    // Find relevant booking with 'pending' status
    const booking = await Booking.findOne({ 
      status: 'pending',
      // Check if this mechanic was notified
      // This would require storing notified mechanics in the booking or in the session
    });
    
    if (!booking) {
      await twilioClient.sendMessage(phoneNumber, 'Sorry, this job is no longer available.');
      return res.status(200).send('OK');
    }
    
    if (Body === '1' || Body.toLowerCase() === 'yes') {
      // Update booking with selected mechanic
      await Booking.findByIdAndUpdate(booking._id, {
        mechanic: mechanic._id,
        status: 'accepted'
      });
      
      // Notify customer
      const customer = await User.findById(booking.customer);
      const paymentLink = await sendPaymentLink(booking);
      
      await twilioClient.sendMessage(
        customer.phoneNumber,
        `Your service request has been accepted! Please complete the payment of ₹${booking.price} to proceed.`,
        paymentLink
      );
      
      // Notify all other mechanics that job is taken
      // This would require retrieval of all notified mechanics
      
      await twilioClient.sendMessage(phoneNumber, 'You have accepted the job. Please wait for customer payment confirmation.');
    } else {
      await twilioClient.sendMessage(phoneNumber, 'You have declined the job. You will be notified of future requests.');
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling mechanic response:', error);
    res.status(500).send('Internal Server Error');
  }
};

// Additional handlers for payment confirmation, mechanic arrival, service completion, etc.
// controllers/whatsappController.js - Add to the existing file

// Handle OTP verification
exports.handleOTPVerification = async (req, res) => {
    try {
      const { Body, From } = req.body;
      
      // Check if this is from a mechanic
      const mechanic = await User.findOne({ phoneNumber: From, userType: 'mechanic' });
      if (mechanic) {
        // Check if message is an OTP
        if (/^\d{6}$/.test(Body)) {
          // This looks like an OTP, handle service completion
          return await paymentController.completeService(req, res);
        }
        
        // Check if message is arrival confirmation
        if (Body.toLowerCase() === 'i reached') {
          return await paymentController.handleMechanicArrival(req, res);
        }
        
        // Check if this is a response to a job offer
        if (Body === '1' || Body.toLowerCase() === 'yes' || Body === '2' || Body.toLowerCase() === 'no') {
          return await this.handleMechanicResponse(req, res);
        }
      }
      
      // Check if this is from a customer
      const customer = await User.findOne({ phoneNumber: From, userType: 'customer' });
      if (customer) {
        // Check if message is arrival confirmation
        if (Body.toLowerCase() === 'reached') {
          return await paymentController.handleCustomerConfirmation(req, res);
        }
      }
      
      // If not a special message, process normally
      return await this.handleIncomingMessage(req, res);
    } catch (error) {
      console.error('Error handling WhatsApp message:', error);
      res.status(500).send('Internal Server Error');
    }
  };