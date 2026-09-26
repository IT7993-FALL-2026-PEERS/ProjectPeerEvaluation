const mongoose = require('mongoose');
const Professor = require('../models/Professor');

async function getCurrentProfessor() {
  try {
    // Connect to MongoDB
    await mongoose.connect(require('./mongoUri'));
    console.log('✅ Connected to MongoDB');

    // Find the most recently created professor (assuming that's you)
    const professor = await Professor.findOne().sort({ created_at: -1 });
    
    if (professor) {
      console.log('👤 Found professor:');
      console.log(`   Name: ${professor.name}`);
      console.log(`   Email: ${professor.email}`);
      console.log(`   Created: ${professor.created_at || professor.createdAt}`);
      return professor.email;
    } else {
      console.log('❌ No professors found in database');
      return null;
    }
  } catch (error) {
    console.error('❌ Error:', error);
    return null;
  } finally {
    await mongoose.disconnect();
  }
}

// If run directly
if (require.main === module) {
  getCurrentProfessor()
    .then(email => {
      if (email) {
        console.log(`\n🎯 To generate test data, run:`);
        console.log(`node generateTestData.js ${email}`);
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

module.exports = { getCurrentProfessor };