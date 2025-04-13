// utils/initializeServices.js
const Service = require('../models/Service');

module.exports = async function initializeServices() {
  try {
    // Check if services already exist
    const count = await Service.countDocuments();
    if (count > 0) {
      console.log('Services already initialized');
      return;
    }
    
    // Create default services
    const services = [
      {
        type: 'Flat tire',
        price: 300,
        description: 'Flat tire repair service'
      },
      {
        type: 'Engine breakdown',
        price: 500,
        description: 'Engine breakdown diagnosis and basic repair'
      },
      {
        type: 'Oil leak',
        price: 300,
        description: 'Oil leak repair service'
      },
      {
        type: 'dont know',
        price: 500,
        description: 'General diagnosis and basic repair'
      }
    ];
    
    await Service.insertMany(services);
    console.log('Services initialized successfully');
  } catch (error) {
    console.error('Error initializing services:', error);
  }
};