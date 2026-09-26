const mongoose = require('mongoose');

// Import models
const Course = require('../models/Course');

// Connect to MongoDB
mongoose.connect(require('./mongoUri'));

async function renameCourse() {
  try {
    console.log('🔍 Finding IT Managment course...');
    
    // Find the course with the typo
    const course = await Course.findOne({ 
      course_name: 'IT Managment'
    });
    
    if (!course) {
      console.error('❌ IT Managment course not found!');
      return;
    }
    
    console.log(`✅ Found course: ${course.course_name} (${course._id})`);
    
    // Update the course name
    await Course.findByIdAndUpdate(course._id, {
      course_name: 'IT Management'
    });
    
    console.log('✅ Course renamed successfully to "IT Management"');
    
  } catch (error) {
    console.error('❌ Error renaming course:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
renameCourse();