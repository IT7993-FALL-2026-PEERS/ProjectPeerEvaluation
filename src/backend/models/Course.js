const mongoose = require('mongoose');

const EvaluationStatusSchema = new mongoose.Schema({
	total: { type: Number, default: 0 },
	completed: { type: Number, default: 0 },
	pending: { type: Number, default: 0 }
}, { _id: false });

const CourseSchema = new mongoose.Schema({
	course_name: { type: String, required: true, trim: true },
	course_number: { type: String, required: true, trim: true }, // e.g., "CS 4850"
	course_section: { type: String, required: true, trim: true }, // e.g., "01", "A", "MWF"
	semester: { type: String, required: true, trim: true }, // e.g., "Fall 2025"
	professor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Professor', required: true },
	student_count: { type: Number, default: 0 }, // System generated
	team_count: { type: Number, default: 0 }, // System generated  
	course_status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
	evaluation_status: { type: EvaluationStatusSchema, default: () => ({}) },
	// The deadline of the last send, to prefill the send dialog and to write reminders in the same zone (CICD-67)
	last_evaluation_deadline: { type: Date, default: null },
	last_evaluation_deadline_zone: { type: String, default: null },
	created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Course', CourseSchema);