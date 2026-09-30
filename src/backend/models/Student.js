const mongoose = require('mongoose');


const StudentSchema = new mongoose.Schema({
	student_id: { type: String, required: true, trim: true }, // University ID
	name: { type: String, required: true, trim: true }, // Student Name
	email: { type: String, required: true, trim: true, lowercase: true }, // Student Email
	course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
	team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null }, // Reference to actual Team
	group_assignment: { type: String, trim: true, default: null }, // Group name from CSV (used to create/find team)
	evaluation_token: { type: String, default: null }, // Unique token for evaluation links (set when evaluations are sent)
	evaluation_token_expires_at: { type: Date, default: null }, // Link stops working after this; see utils/evaluationToken.js
	evaluation_completed: { type: Boolean, default: false },
	created_at: { type: Date, default: Date.now }
});

// Add unique index to prevent duplicate students in a course
StudentSchema.index({ student_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Student', StudentSchema);