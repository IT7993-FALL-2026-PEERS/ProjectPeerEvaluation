const Course = require('../models/Course');

/**
 * Migration script to update existing courses from old schema to new schema
 * Run this script once to migrate existing data
 */
async function migrateCourses() {
  try {
    console.log('Starting course migration...');
    
    // Find courses that have the old course_code field but missing new fields
    const coursesToMigrate = await Course.find({
      $or: [
        { course_code: { $exists: true } },
        { course_number: { $exists: false } },
        { course_section: { $exists: false } },
        { course_status: { $exists: false } }
      ]
    });

    console.log(`Found ${coursesToMigrate.length} courses to migrate`);

    for (const course of coursesToMigrate) {
      const updates = {};
      
      // Migrate course_code to course_number and course_section
      if (course.course_code && !course.course_number) {
        // Split course_code like "CS 4850" into course_number "CS" and course_section "4850"
        const parts = course.course_code.split(' ');
        updates.course_number = parts[0] || course.course_code;
        if (parts.length > 1 && !course.course_section) {
          updates.course_section = parts.slice(1).join(' ');
        } else if (!course.course_section) {
          updates.course_section = '01'; // Default section
        }
      }

      // Set default course_status if missing
      if (!course.course_status) {
        updates.course_status = 'Active';
      }

      // Ensure student_count and team_count exist
      if (course.student_count === undefined) {
        updates.student_count = 0;
      }
      if (course.team_count === undefined) {
        updates.team_count = 0;
      }

      // Update the course
      if (Object.keys(updates).length > 0) {
        await Course.findByIdAndUpdate(course._id, updates);
        console.log(`Migrated course: ${course.course_name} (${course.course_code || course.course_number})`);
      }
    }

    console.log('Course migration completed successfully!');
    return { success: true, migratedCount: coursesToMigrate.length };
  } catch (error) {
    console.error('Course migration failed:', error);
    return { success: false, error: error.message };
  }
}

module.exports = { migrateCourses };

// If running this file directly
if (require.main === module) {
  const connectDB = require('../config/db');
  
  async function runMigration() {
    try {
      await connectDB();
      await migrateCourses();
      process.exit(0);
    } catch (error) {
      console.error('Migration script failed:', error);
      process.exit(1);
    }
  }
  
  runMigration();
}