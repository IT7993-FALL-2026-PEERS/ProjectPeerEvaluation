const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// Import models
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');

// Connect to MongoDB
mongoose.connect(require('./mongoUri'));

// Generate realistic student names
const firstNames = [
  'Emma', 'Liam', 'Olivia', 'Noah', 'Ava', 'Elijah', 'Charlotte', 'Oliver', 'Amelia', 'William',
  'Sophia', 'James', 'Isabella', 'Benjamin', 'Mia', 'Lucas', 'Harper', 'Henry', 'Evelyn', 'Alexander',
  'Abigail', 'Mason', 'Emily', 'Michael', 'Elizabeth', 'Ethan', 'Mila', 'Daniel', 'Ella', 'Jacob',
  'Avery', 'Logan', 'Sofia', 'Jackson', 'Camila', 'Levi', 'Aria', 'Sebastian', 'Scarlett', 'Mateo',
  'Victoria', 'Jack', 'Madison', 'Owen', 'Luna', 'Theodore', 'Grace', 'Aiden', 'Chloe', 'Samuel'
];

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts'
];

// Generate random student data
function generateStudent(index, teamNumber) {
  const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
  const studentId = `IT${String(index).padStart(3, '0')}`;
  const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@students.kennesaw.edu`;
  
  return {
    student_id: studentId,
    name: `${firstName} ${lastName}`,
    email: email,
    team_name: `Team ${teamNumber}`
  };
}

async function createITManagementTeams() {
  try {
    console.log('🔍 Finding IT Management course...');
    
    // Find the IT Management course
    const course = await Course.findOne({ 
      course_name: 'IT Management'
    });
    
    if (!course) {
      console.error('❌ IT Management course not found!');
      console.log('Available courses:');
      const courses = await Course.find({});
      courses.forEach(c => console.log(`  - ${c.course_name} (${c._id})`));
      return;
    }
    
    console.log(`✅ Found course: ${course.course_name} (${course._id})`);
    
    // Clear existing students and teams for this course
    console.log('🧹 Clearing existing students and teams...');
    await Student.deleteMany({ course_id: course._id });
    await Team.deleteMany({ course_id: course._id });
    
    // Generate 10 teams of 5 students each (50 total students)
    console.log('👥 Creating 10 teams with 5 students each...');
    
    const allStudents = [];
    const allTeams = [];
    
    for (let teamNum = 1; teamNum <= 10; teamNum++) {
      console.log(`Creating Team ${teamNum}...`);
      
      // Create team
      const team = new Team({
        team_name: `Team ${teamNum}`,
        course_id: course._id,
        student_count: 5
      });
      const savedTeam = await team.save();
      allTeams.push(savedTeam);
      
      // Create 5 students for this team
      for (let studentNum = 1; studentNum <= 5; studentNum++) {
        const studentIndex = (teamNum - 1) * 5 + studentNum;
        const studentData = generateStudent(studentIndex, teamNum);
        
        const student = new Student({
          student_id: studentData.student_id,
          name: studentData.name,
          email: studentData.email,
          course_id: course._id,
          team_id: savedTeam._id,
          group_assignment: studentData.team_name,
          evaluation_token: uuidv4(),
          evaluation_completed: false
        });
        
        const savedStudent = await student.save();
        allStudents.push(savedStudent);
      }
    }
    
    // Update course statistics
    console.log('📊 Updating course statistics...');
    await Course.findByIdAndUpdate(course._id, {
      student_count: allStudents.length,
      team_count: allTeams.length
    });
    
    console.log('\n🎉 IT Management teams created successfully!');
    console.log(`📈 Summary:`);
    console.log(`  - Course: ${course.course_name}`);
    console.log(`  - Teams created: ${allTeams.length}`);
    console.log(`  - Students created: ${allStudents.length}`);
    console.log(`  - Students per team: 5`);
    
    console.log('\n👥 Team breakdown:');
    for (let i = 1; i <= 10; i++) {
      const teamStudents = allStudents.filter(s => s.group_assignment === `Team ${i}`);
      console.log(`  Team ${i}: ${teamStudents.map(s => s.name).join(', ')}`);
    }
    
    console.log('\n✅ Script completed successfully!');
    
  } catch (error) {
    console.error('❌ Error creating IT Management teams:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the script
createITManagementTeams();