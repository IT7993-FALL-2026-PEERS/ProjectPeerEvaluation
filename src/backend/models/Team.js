const mongoose = require('mongoose');

const TeamSchema = new mongoose.Schema({
  team_name: { type: String, required: true, trim: true }, // Group Name
  course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  student_count: { type: Number, default: 0 }, // System generated count
  team_status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  // The instructor's grade for the team's work (the Contribution Multiplier report, CICD-81). null: the report proposes one.
  team_grade: { type: Number, min: 0, max: 100, default: null },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Team', TeamSchema);