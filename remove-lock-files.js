const fs = require('fs');
const path = require('path');

const services = ['booking-service', 'inventory-service', 'notification-service', 'pricing-service', 'search-service'];

services.forEach(service => {
  const lockFile = path.join(__dirname, service, 'package-lock.json');
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
      console.log(`Removed ${lockFile}`);
    }
  } catch (error) {
    console.log(`Could not remove ${lockFile}: ${error.message}`);
  }
});
