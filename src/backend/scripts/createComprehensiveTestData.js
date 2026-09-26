const mongoose = require('mongoose');
const crypto = require('crypto');
const Professor = require('../models/Professor');
const Course = require('../models/Course');
const Student = require('../models/Student');
const Team = require('../models/Team');

async function createTestData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(require('./mongoUri'));
    console.log('✅ Connected to MongoDB (peer-eval database)');

    // Use Preston Jordan's account (pbj2711@gmail.com)
    const professor = await Professor.findOne({ email: 'pbj2711@gmail.com' });
    if (!professor) {
      console.log('❌ Professor not found with email pbj2711@gmail.com');
      return;
    }
    
    console.log(`📚 Using professor: ${professor.name} (${professor.email})`);
    console.log(`🔑 Professor ID: ${professor._id}`);

    // Create test courses
    const coursesToCreate = [
      {
        course_name: 'Software Engineering II',
        course_number: 'CS 4860',
        course_section: '01',
        semester: 'Fall 2025',
        professor_id: professor._id,
        course_status: 'Active'
      },
      {
        course_name: 'Database Systems',
        course_number: 'CS 3440',
        course_section: '02', 
        semester: 'Fall 2025',
        professor_id: professor._id,
        course_status: 'Active'
      },
      {
        course_name: 'Web Development',
        course_number: 'CS 3850',
        course_section: '01',
        semester: 'Fall 2025',
        professor_id: professor._id,
        course_status: 'Active'
      },
      {
        course_name: 'Computer Networks',
        course_number: 'CS 4740',
        course_section: '01',
        semester: 'Fall 2025',
        professor_id: professor._id,
        course_status: 'Active'
      }
    ];

    console.log('\n🏫 Creating courses...');
    const createdCourses = [];
    
    for (const courseData of coursesToCreate) {
      // Check if course already exists
      const existingCourse = await Course.findOne({
        course_number: courseData.course_number,
        course_section: courseData.course_section,
        semester: courseData.semester,
        professor_id: professor._id
      });
      
      if (existingCourse) {
        console.log(`⚠️  Course ${courseData.course_number} ${courseData.course_section} already exists`);
        createdCourses.push(existingCourse);
      } else {
        const course = new Course(courseData);
        await course.save();
        console.log(`✅ Created course: ${course.course_name} (${course.course_number} ${course.course_section})`);
        createdCourses.push(course);
      }
    }

    // For the main course (Software Engineering II), create comprehensive test data
    const mainCourse = createdCourses.find(c => c.course_number === 'CS 4860');
    if (mainCourse) {
      console.log(`\n👥 Creating teams for ${mainCourse.course_name}...`);
      
      // Create Teams 01-32
      const teamsToCreate = [];
      for (let i = 1; i <= 32; i++) {
        const teamNumber = i.toString().padStart(2, '0');
        const teamData = {
          team_name: `Team ${teamNumber}`,
          course_id: mainCourse._id,
          team_status: 'Active',
          students: [],
          student_count: 0
        };
        
        // Check if team already exists
        const existingTeam = await Team.findOne({
          team_name: teamData.team_name,
          course_id: mainCourse._id
        });
        
        if (!existingTeam) {
          teamsToCreate.push(teamData);
        }
      }
      
      if (teamsToCreate.length > 0) {
        const createdTeams = await Team.insertMany(teamsToCreate);
        console.log(`✅ Created ${createdTeams.length} teams (Team 01 - Team ${teamsToCreate.length.toString().padStart(2, '0')})`);
      } else {
        console.log('⚠️  All teams already exist');
      }

      // Create test students
      console.log(`\n👨‍🎓 Creating students for ${mainCourse.course_name}...`);
      
      const studentNames = [
        'Alex Johnson', 'Emily Davis', 'Michael Brown', 'Sarah Wilson', 'David Miller',
        'Jessica Garcia', 'Christopher Martinez', 'Ashley Anderson', 'Matthew Taylor', 'Amanda Thomas',
        'Joshua Jackson', 'Stephanie White', 'Andrew Harris', 'Lauren Martin', 'Daniel Thompson',
        'Rachel Garcia', 'Ryan Rodriguez', 'Nicole Lewis', 'Brandon Lee', 'Samantha Walker',
        'Justin Hall', 'Megan Allen', 'Kevin Young', 'Kimberly Hernandez', 'Eric King',
        'Michelle Wright', 'Tyler Lopez', 'Christina Hill', 'Jason Scott', 'Elizabeth Green',
        'Nathan Adams', 'Jennifer Baker', 'Aaron Gonzalez', 'Heather Nelson', 'Jeremy Carter',
        'Crystal Mitchell', 'Sean Perez', 'Vanessa Roberts', 'Marcus Turner', 'Danielle Phillips',
        'Trevor Campbell', 'Monica Parker', 'Carl Evans', 'Patricia Edwards', 'Keith Collins',
        'Diana Stewart', 'Tony Sanchez', 'Linda Morris', 'Shane Rogers', 'Carolyn Reed',
        'Blake Cook', 'Tiffany Bailey', 'Grant Cooper', 'Andrea Richardson', 'Preston Ward',
        'Melissa Cox', 'Jake Howard', 'Angela Ward', 'Caleb Torres', 'Brittany Peterson',
        'Cole Gray', 'Jasmine Ramirez', 'Garrett James', 'Destiny Watson', 'Drake Brooks',
        'Alexis Kelly', 'Ian Sanders', 'Sophia Price', 'Landon Bennett', 'Maya Wood',
        'Ethan Barnes', 'Zoe Ross', 'Owen Henderson', 'Chloe Coleman', 'Noah Jenkins',
        'Ava Perry', 'Liam Powell', 'Emma Long', 'Mason Patterson', 'Olivia Hughes',
        'Lucas Flores', 'Isabella Washington', 'Jackson Butler', 'Mia Simmons', 'Aiden Foster',
        'Abigail Gonzales', 'Carter Bryant', 'Emily Alexander', 'Connor Russell', 'Madison Griffin',
        'Wyatt Diaz', 'Grace Hayes', 'Hunter Myers', 'Lily Ford', 'Cooper Hamilton',
        'Ella Graham', 'Parker Sullivan', 'Chloe Wallace', 'Easton Woods', 'Zoey Cole',
        'Nolan West', 'Natalie Jordan', 'Grayson Warren', 'Leah Stevens', 'Bentley Mason',
        'Haley Gibson', 'Ryder Wells', 'Addison Reid', 'Jaxon Spencer', 'Layla Holmes',
        'Lincoln Fuller', 'Anna Crawford', 'Maverick Sharp', 'Ellie Berry', 'Roman McCarthy'
      ];

      // Get all teams for this course
      const allTeams = await Team.find({ course_id: mainCourse._id });
      console.log(`Found ${allTeams.length} teams for student assignment`);

      const studentsToCreate = [];
      for (let i = 0; i < 96; i++) { // 96 students for 32 teams (3 per team)
        const studentName = studentNames[i % studentNames.length];
        const studentId = `900${(100000 + i).toString()}`.substring(1); // Generate student IDs like 900100001
        const email = `${studentName.toLowerCase().replace(' ', '.')}.${studentId}@students.kennesaw.edu`;
        
        // Assign to team (3 students per team)
        const teamIndex = Math.floor(i / 3);
        const assignedTeam = allTeams[teamIndex];
        
        const studentData = {
          student_id: studentId,
          name: `${studentName} ${i + 1}`, // Add number to make unique
          email: email,
          course_id: mainCourse._id,
          team_id: assignedTeam ? assignedTeam._id : null,
          group_assignment: assignedTeam ? assignedTeam.team_name : '',
          evaluation_token: crypto.randomBytes(32).toString('hex'), // Generate unique token
          evaluation_completed: false
        };

        // Check if student already exists
        const existingStudent = await Student.findOne({
          student_id: studentData.student_id,
          course_id: mainCourse._id
        });
        
        if (!existingStudent) {
          studentsToCreate.push(studentData);
        }
      }

      if (studentsToCreate.length > 0) {
        const createdStudents = await Student.insertMany(studentsToCreate);
        console.log(`✅ Created ${createdStudents.length} students`);

        // Update team student counts and student arrays
        console.log('\n🔄 Updating team student counts...');
        for (const team of allTeams) {
          const teamStudents = await Student.find({ team_id: team._id });
          
          // Update team with student IDs and count
          team.students = teamStudents.map(s => s._id);
          team.student_count = teamStudents.length;
          await team.save();
        }

        // Update course counts
        const totalStudents = await Student.countDocuments({ course_id: mainCourse._id });
        const totalTeams = await Team.countDocuments({ course_id: mainCourse._id });
        
        await Course.findByIdAndUpdate(mainCourse._id, {
          student_count: totalStudents,
          team_count: totalTeams
        });

        console.log(`✅ Updated course counts: ${totalStudents} students, ${totalTeams} teams`);
      } else {
        console.log('⚠️  All students already exist');
      }
    }

    console.log('\n🎉 Test data creation completed!');
    console.log('\n📊 Summary:');
    console.log(`- Professor: ${professor.name} (${professor.email})`);
    console.log(`- Professor ID: ${professor._id}`);
    console.log('- Created/Verified courses with comprehensive test data');
    console.log('- Teams: Team 01 through Team 32');
    console.log('- Students: ~96 students (3 per team)');
    console.log('\n🔑 Use this professor account to log in and see the test data!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

createTestData();