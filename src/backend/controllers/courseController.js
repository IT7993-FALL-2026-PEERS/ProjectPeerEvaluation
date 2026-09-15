const Course = require('../models/Course');
const mongoose = require('mongoose');

exports.listCourses = async (req, res, next) => {
	try {
		// Get search parameters from query
		const { 
			course_name, 
			course_number, 
			course_section, 
			semester, 
			course_status = 'Active' 
		} = req.query;

		// Build search filter
		const filter = { professor_id: req.user.id };
		
		if (course_name) {
			filter.course_name = { $regex: course_name, $options: 'i' };
		}
		if (course_number) {
			// Search both new course_number field and old course_code field
			filter.$or = [
				{ course_number: { $regex: course_number, $options: 'i' } },
				{ course_code: { $regex: course_number, $options: 'i' } }
			];
		}
		if (course_section) {
			filter.course_section = { $regex: course_section, $options: 'i' };
		}
		if (semester) {
			filter.semester = { $regex: semester, $options: 'i' };
		}
		if (course_status) {
			filter.course_status = course_status;
		}

		let courses = await Course.find(filter);

		// Get team counts for all courses in one query
		const Team = require('../models/Team');
		const courseIds = courses.map(c => c._id);
		const teamCounts = await Team.aggregate([
			{ $match: { course_id: { $in: courseIds } } },
			{ $group: { _id: '$course_id', count: { $sum: 1 } } }
		]);
		const teamCountMap = {};
		teamCounts.forEach(tc => { teamCountMap[tc._id.toString()] = tc.count; });

		// Migrate old course_code to new fields if needed and set team_count
		courses = courses.map(course => {
			const courseObj = course.toObject();
			if (courseObj.course_code && (!courseObj.course_number || !courseObj.course_section)) {
				// Simple migration: split course_code by space for course_number and section
				const parts = courseObj.course_code.split(' ');
				if (!courseObj.course_number) {
					courseObj.course_number = parts[0] || courseObj.course_code;
				}
				if (!courseObj.course_section && parts.length > 1) {
					courseObj.course_section = parts.slice(1).join(' ');
				}
			}
			// Always set team_count from actual Team collection
			courseObj.team_count = teamCountMap[courseObj._id.toString()] || 0;
			return courseObj;
		});
		
		res.status(200).json(courses);
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.createCourse = async (req, res, next) => {
	try {
			console.log('Received course creation request:', req.body);
			console.log('User from token:', req.user);
			const { course_name, course_number, course_section, semester } = req.body;
			console.log('Extracted fields:', { course_name, course_number, course_section, semester });
			if (!course_name || !course_number || !course_section || !semester) {
				console.log('Validation failed - missing fields');
				const err = new Error('Course name, number, section, and semester are required.');
				err.code = 'VALIDATION_ERROR';
				err.status = 400;
				return next(err);
			}
			// Check for inactive course with same details
			let course = await Course.findOne({
				course_name,
				course_number,
				course_section,
				semester,
				professor_id: req.user.id,
				course_status: 'Inactive'
			});
			if (course) {
				course.course_status = 'Active';
				course.markModified('course_status');
				await course.save();
				return res.status(200).json({ id: course._id, message: 'Course reactivated.' });
			}
			// Otherwise, create new
			course = new Course({
				course_name,
				course_number,
				course_section,
				semester,
				professor_id: req.user.id,
				course_status: 'Active'
			});
			await course.save();
			res.status(201).json({ id: course._id, message: 'Course created.' });
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.getCourse = async (req, res, next) => {
	try {
		const { course_id } = req.params;
		if (!mongoose.Types.ObjectId.isValid(course_id)) {
			const err = new Error('Invalid course ID.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
			let course = await Course.findById(course_id);
			if (!course) {
				const err = new Error('Course not found.');
				err.code = 'NOT_FOUND';
				err.status = 404;
				return next(err);
			}
			// Always get the latest student_count from the Student collection
			const Student = require('../models/Student');
			const studentCount = await Student.countDocuments({ course_id: course._id });
			// Debug log for diagnosis
			console.log('DEBUG getCourse:', { course_id, courseObjectId: course._id, studentCount });
			// Update the course object in memory (do not persist)
			course = course.toObject();
			course.student_count = studentCount;
			res.status(200).json(course);
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.updateCourse = async (req, res, next) => {
	try {
		const { course_id } = req.params;
		const updates = req.body;
		if (!mongoose.Types.ObjectId.isValid(course_id)) {
			const err = new Error('Invalid course ID.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		const course = await Course.findByIdAndUpdate(course_id, updates, { new: true });
		if (!course) {
			const err = new Error('Course not found.');
			err.code = 'NOT_FOUND';
			err.status = 404;
			return next(err);
		}
		res.status(200).json({ message: 'Course updated.' });
	} catch (err) {
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

exports.deleteCourse = async (req, res, next) => {
	try {
		const { course_id } = req.params;
		console.log('Delete course called for ID:', course_id);
		
		if (!mongoose.Types.ObjectId.isValid(course_id)) {
			const err = new Error('Invalid course ID.');
			err.code = 'VALIDATION_ERROR';
			err.status = 400;
			return next(err);
		}
		
		// Always cast course_id to ObjectId
		const courseObjectId = new mongoose.Types.ObjectId(course_id);
		
		// Set course_status to 'Inactive' instead of using is_active
		const course = await Course.findByIdAndUpdate(
			courseObjectId, 
			{ course_status: 'Inactive' }, 
			{ new: true }
		);
		
		if (!course) {
			const err = new Error('Course not found.');
			err.code = 'NOT_FOUND';
			err.status = 404;
			return next(err);
		}
		
		console.log('Course status updated to Inactive:', course.course_name);
		res.status(200).json({ message: 'Course deleted successfully.' });
	} catch (err) {
		console.error('Delete course error:', err);
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};

// Migration endpoint to update existing courses
exports.migrateCourses = async (req, res, next) => {
	try {
		console.log('Starting course migration...');
		
		// Find courses that need migration
		const coursesToMigrate = await Course.find({
			professor_id: req.user.id,
			$or: [
				{ course_code: { $exists: true } },
				{ course_number: { $exists: false } },
				{ course_section: { $exists: false } },
				{ course_status: { $exists: false } }
			]
		});

		console.log(`Found ${coursesToMigrate.length} courses to migrate`);
		let migratedCount = 0;

		for (const course of coursesToMigrate) {
			const updates = {};
			
			// Migrate course_code to course_number and course_section
			if (course.course_code && !course.course_number) {
				const parts = course.course_code.trim().split(' ').filter(Boolean);
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
				migratedCount++;
			}
		}

		res.status(200).json({ 
			message: 'Course migration completed successfully!',
			migratedCount: migratedCount,
			totalFound: coursesToMigrate.length
		});
	} catch (err) {
		console.error('Course migration failed:', err);
		err.code = err.code || 'SERVER_ERROR';
		err.status = err.status || 500;
		next(err);
	}
};