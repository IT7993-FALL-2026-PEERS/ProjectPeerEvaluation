const mongoose = require('mongoose');

const EvaluationSchema = new mongoose.Schema({
  course_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  student_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true }, // Student being evaluated
  evaluator_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true }, // Student doing the evaluation
  ratings: {
    professionalism: { type: Number, min: 1, max: 5, required: true },
    communication: { type: Number, min: 1, max: 5, required: true },
    work_ethic: { type: Number, min: 1, max: 5, required: true },
    content_knowledge_skills: { type: Number, min: 1, max: 5, required: true },
    overall_contribution: { type: Number, min: 1, max: 5, required: true },
    participation: { type: Number, min: 1, max: 4, required: true } // Note: 1-4 scale for participation
  },
  overall_feedback: { type: String, required: true }, // Written comment (required)
  submitted_at: { type: Date, default: Date.now },
  evaluation_token: { type: String, required: true } // Token used to access this evaluation
});

// Add index for efficient querying
EvaluationSchema.index({ course_id: 1, student_id: 1, evaluator_id: 1 });
EvaluationSchema.index({ evaluation_token: 1 });
// One rating per evaluator and person in a course (FR-16). The key order differs from the index
// above on purpose: MongoDB refuses to turn an existing index into a unique one, so this is a
// separate index. Run scripts/findDuplicateEvaluations.js before deploying to a database that
// already holds data: the index cannot be built while duplicates exist.
EvaluationSchema.index({ evaluator_id: 1, student_id: 1, course_id: 1 }, { unique: true });

module.exports = mongoose.model('Evaluation', EvaluationSchema);