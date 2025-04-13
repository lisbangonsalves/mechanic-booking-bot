// utils/twilioClient.js
const twilio = require('twilio');
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

exports.sendMessage = async (to, body, mediaUrl = null) => {
  try {
    const messageOptions = {
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to,
      body: body
    };
    
    if (mediaUrl) {
      messageOptions.mediaUrl = [mediaUrl];
    }
    
    const message = await client.messages.create(messageOptions);
    return message;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
};