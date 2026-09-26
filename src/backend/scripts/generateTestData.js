const mongoose = require('mongoose');
const Professor = require('../models/Professor');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');

// KSU-style test data
const KSU_COURSES = [
  { name: 'Software Engineering', number: 'CS 4850', section: '01', semester: 'Fall 2025' },
  { name: 'Database Systems', number: 'CS 4420', section: '01', semester: 'Fall 2025' },
  { name: 'Computer Networks', number: 'CS 4720', section: '02', semester: 'Fall 2025' },
  { name: 'Cybersecurity Fundamentals', number: 'CS 4722', section: '01', semester: 'Fall 2025' },
  { name: 'Web Development', number: 'CS 3030', section: '03', semester: 'Fall 2025' },
  { name: 'Data Structures', number: 'CS 2302', section: '01', semester: 'Fall 2025' },
  { name: 'Computer Organization', number: 'CS 2400', section: '02', semester: 'Fall 2025' },
  { name: 'Algorithms', number: 'CS 3305', section: '01', semester: 'Fall 2025' },
  { name: 'Mobile App Development', number: 'CS 4490', section: '01', semester: 'Fall 2025' },
  { name: 'Machine Learning', number: 'CS 4267', section: '01', semester: 'Fall 2025' }
];

const FIRST_NAMES = [
  'Emily', 'Michael', 'Sarah', 'David', 'Jessica', 'Christopher', 'Ashley', 'Matthew', 
  'Amanda', 'Joshua', 'Brittany', 'Andrew', 'Samantha', 'Daniel', 'Elizabeth', 'Anthony',
  'Lauren', 'Ryan', 'Megan', 'Tyler', 'Nicole', 'Justin', 'Stephanie', 'Brandon',
  'Rachel', 'Kevin', 'Hannah', 'Zachary', 'Alexis', 'Jonathan', 'Taylor', 'Nicholas'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young'
];

function generateStudentId() {
  return `900${Math.floor(100000 + Math.random() * 900000)}`;
}

function generateEmail(firstName, lastName) {
  return `${firstName.toLowerCase()}${lastName.toLowerCase()}${Math.floor(10 + Math.random() * 90)}@students.kennesaw.edu`;
}

function getRandomName() {
  const firstName = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const lastName = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return { firstName, lastName };
}

async function generateTestData(professorEmail) {
  try {
    console.log('🔍 Finding professor...');
    const professor = await Professor.findOne({ email: professorEmail });
    if (!professor) {
      console.error('❌ Professor not found with email:', professorEmail);
      return;
    }
    console.log(`✅ Found professor: ${professor.name} (${professor.email})`);

    console.log('🗑️ Cleaning existing test data...');
    // Clean up existing test data for this professor
    const existingCourses = await Course.find({ professor_id: professor._id });
    for (const course of existingCourses) {
      await Student.deleteMany({ course_id: course._id });
      await Team.deleteMany({ course_id: course._id });
    }
    await Course.deleteMany({ professor_id: professor._id });
    console.log('✅ Cleaned existing data');

    console.log('📚 Creating courses...');
    const createdCourses = [];
    
    for (const courseData of KSU_COURSES) {
      const course = new Course({
        course_name: courseData.name,
        course_number: courseData.number,
        course_section: courseData.section,
        semester: courseData.semester,
        professor_id: professor._id,
        course_status: 'Active'
      });
      await course.save();
      createdCourses.push(course);
      console.log(`  ✅ Created: ${course.course_number} ${course.course_section} - ${course.course_name}`);
    }

    console.log('👥 Creating students and teams...');
    let totalStudents = 0;
    let totalTeams = 0;

    for (const course of createdCourses) {
      console.log(`\n📖 Processing ${course.course_number} - ${course.course_name}:`);
      
      // Create 24-32 students per course (3-4 students per team)
      const numStudents = 24 + Math.floor(Math.random() * 9); // 24-32 students
      const studentsPerTeam = 3 + Math.floor(Math.random() * 2); // 3-4 students per team
      const numTeams = Math.ceil(numStudents / studentsPerTeam);
      
      console.log(`  👥 Creating ${numStudents} students in ${numTeams} teams`);
      
      // Create teams (Team 01 - Team 32)
      const teams = [];
      for (let i = 1; i <= numTeams && i <= 32; i++) {
        const teamName = `Team ${i.toString().padStart(2, '0')}`;
        const team = new Team({
          team_name: teamName,
          course_id: course._id,
          students: [],
          student_count: 0,
          team_status: 'Active'
        });
        await team.save();
        teams.push(team);
        totalTeams++;
      }

      // Create students
      const students = [];
      const usedNames = new Set();
      
      for (let i = 0; i < numStudents; i++) {
        let name;
        let attempts = 0;
        do {
          const { firstName, lastName } = getRandomName();
          name = `${firstName} ${lastName}`;
          attempts++;
        } while (usedNames.has(name) && attempts < 50);
        
        usedNames.add(name);
        const [firstName, lastName] = name.split(' ');
        
        const student = new Student({
          student_id: generateStudentId(),
          name: name,
          email: generateEmail(firstName, lastName),
          course_id: course._id
        });
        
        students.push(student);
      }

      // Assign students to teams
      let teamIndex = 0;
      let studentsInCurrentTeam = 0;
      
      for (const student of students) {
        const team = teams[teamIndex];
        student.team_id = team._id;
        student.group_assignment = team.team_name;
        await student.save();
        
        // Update team
        team.students.push(student._id);
        team.student_count++;
        
        studentsInCurrentTeam++;
        
        // Move to next team when current team is full
        if (studentsInCurrentTeam >= studentsPerTeam && teamIndex < teams.length - 1) {
          await team.save();
          teamIndex++;
          studentsInCurrentTeam = 0;
        }
      }
      
      // Save the last team
      if (teams.length > 0) {
        await teams[teamIndex].save();
      }

      // Update course counts
      course.student_count = numStudents;
      course.team_count = teams.length;
      await course.save();
      
      totalStudents += numStudents;
      console.log(`  ✅ Created ${numStudents} students in ${teams.length} teams`);
    }

    console.log('\n🎉 Test data generation complete!');
    console.log(`📊 Summary:`);
    console.log(`  - Courses: ${createdCourses.length}`);
    console.log(`  - Students: ${totalStudents}`);
    console.log(`  - Teams: ${totalTeams}`);
    console.log(`  - Professor: ${professor.name} (${professor.email})`);
    
  } catch (error) {
    console.error('❌ Error generating test data:', error);
  }
}

module.exports = { generateTestData };

// If run directly
if (require.main === module) {
  const professorEmail = process.argv[2];
  if (!professorEmail) {
    console.error('❌ Please provide professor email as argument');
    console.log('Usage: node generateTestData.js professor@email.com');
    process.exit(1);
  }

  // Connect to MongoDB
  
  mongoose.connect(require('./mongoUri'))
    .then(() => {
      console.log('✅ Connected to MongoDB');
      return generateTestData(professorEmail);
    })
    .then(() => {
      console.log('✅ Test data generation completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}