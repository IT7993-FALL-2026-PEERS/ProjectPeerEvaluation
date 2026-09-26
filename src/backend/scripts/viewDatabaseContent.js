const mongoose = require('mongoose');
const Professor = require('../models/Professor');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');

async function viewDatabaseContent() {
  try {
    // Connect to MongoDB
    await mongoose.connect(require('./mongoUri'), {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ Connected to MongoDB (peer-eval database)');

    // Get all professors
    const professors = await Professor.find({});
    console.log('\n📚 PROFESSORS:');
    professors.forEach(prof => {
      console.log(`- ${prof.name} (${prof.email}) - ID: ${prof._id}`);
    });

    // Get all courses
    const courses = await Course.find({}).populate('professor_id');
    console.log('\n🏫 COURSES:');
    courses.forEach(course => {
      console.log(`- ${course.course_name} (${course.course_number} ${course.course_section}) - ${course.semester}`);
      console.log(`  Professor: ${course.professor_id?.name || 'Unknown'} - Status: ${course.course_status}`);
      console.log(`  Students: ${course.student_count}, Teams: ${course.team_count}`);
    });

    // Get all students
    const students = await Student.find({});
    console.log(`\n👨‍🎓 STUDENTS: ${students.length} total`);

    // Get all teams
    const teams = await Team.find({});
    console.log(`\n👥 TEAMS: ${teams.length} total`);

    if (professors.length > 0) {
      console.log('\n🔑 First professor details for token reference:');
      console.log(`Professor ID: ${professors[0]._id}`);
      console.log(`Email: ${professors[0].email}`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

viewDatabaseContent();