const mongoose = require('mongoose');
const Course = require('../models/Course');

// Sample data for generating random courses
const courseNames = [
  'Software Engineering',
  'Data Structures and Algorithms',
  'Database Management Systems',
  'Web Development',
  'Machine Learning',
  'Computer Networks',
  'Operating Systems',
  'Artificial Intelligence',
  'Cybersecurity',
  'Mobile App Development',
  'Computer Graphics',
  'Human-Computer Interaction',
  'Software Testing',
  'Distributed Systems',
  'Compiler Design',
  'Computer Architecture',
  'Digital Signal Processing',
  'Embedded Systems',
  'Cloud Computing',
  'DevOps Engineering'
];

const courseCodes = [
  'CS', 'CIS', 'IT', 'SE', 'EE', 'CE', 'IS', 'CSE', 'COMP', 'CSCE'
];

const sections = ['01', '02', '03', 'A', 'B', 'C', 'MWF', 'TTH', 'MW', 'TR'];

const semesters = [
  'Fall 2024', 'Spring 2025', 'Summer 2025', 'Fall 2025', 'Spring 2026'
];

// You'll need to replace this with an actual professor ID from your database
// For now, I'll use a placeholder - you should update this
const PROFESSOR_ID = '68c3af200bedadf10e07ba86'; // Replace with actual professor ID

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateRandomCourse() {
  const courseName = getRandomElement(courseNames);
  const courseCode = getRandomElement(courseCodes);
  const courseNumber = Math.floor(Math.random() * 9000) + 1000; // 1000-9999
  const section = getRandomElement(sections);
  const semester = getRandomElement(semesters);
  
  return {
    course_name: courseName,
    course_number: `${courseCode} ${courseNumber}`,
    course_section: section,
    semester: semester,
    professor_id: new mongoose.Types.ObjectId(PROFESSOR_ID),
    course_status: 'Active',
    student_count: Math.floor(Math.random() * 50) + 10, // 10-59 students
    team_count: Math.floor(Math.random() * 12) + 3, // 3-14 teams
    evaluation_status: {
      total: 0,
      completed: 0,
      pending: 0
    }
  };
}

async function addRandomCourses() {
  try {
    console.log('🚀 Connecting to MongoDB...');
    await mongoose.connect(require('./mongoUri'));
    console.log('✅ Connected to MongoDB');

    console.log('📚 Generating 10 random courses...');
    const courses = [];
    
    for (let i = 0; i < 10; i++) {
      courses.push(generateRandomCourse());
    }

    console.log('💾 Inserting courses into database...');
    const insertedCourses = await Course.insertMany(courses);
    
    console.log(`✅ Successfully added ${insertedCourses.length} courses:`);
    insertedCourses.forEach((course, index) => {
      console.log(`${index + 1}. ${course.course_name} (${course.course_number} - ${course.course_section}) - ${course.semester}`);
    });

  } catch (error) {
    console.error('❌ Error adding courses:', error);
  } finally {
    console.log('🔌 Disconnecting from MongoDB...');
    await mongoose.disconnect();
    console.log('👋 Script completed');
  }
}

// Run the script
addRandomCourses();