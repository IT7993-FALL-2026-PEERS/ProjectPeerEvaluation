const mongoose = require('mongoose');
const Professor = require('../models/Professor');
const Course = require('../models/Course');

async function checkDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(require('./mongoUri'));
    console.log('✅ Connected to MongoDB');

    // Check all professors
    const professors = await Professor.find({});
    console.log(`📊 Found ${professors.length} professors:`);
    
    if (professors.length > 0) {
      professors.forEach((prof, index) => {
        console.log(`  ${index + 1}. ${prof.name} (${prof.email}) - Created: ${prof.created_at || prof.createdAt || 'Unknown'}`);
      });
    } else {
      console.log('  No professors found');
    }

    // Check courses
    const courses = await Course.find({});
    console.log(`\n📚 Found ${courses.length} courses:`);
    
    if (courses.length > 0) {
      courses.forEach((course, index) => {
        console.log(`  ${index + 1}. ${course.course_name} (${course.course_number}) - Professor ID: ${course.professor_id}`);
      });
    } else {
      console.log('  No courses found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

checkDatabase();