const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const studentController = require('../controllers/studentController');

const teamController = require('../controllers/teamController');

const evaluationController = require('../controllers/evaluationController');

const reportController = require('../controllers/reportController');
const { authenticateToken } = require('../middleware/auth');
const { requireCourseOwner } = require('../middleware/courseOwner');

// Course management endpoints
router.get('/', authenticateToken, courseController.listCourses);
router.post('/', authenticateToken, courseController.createCourse);
router.post('/migrate', authenticateToken, courseController.migrateCourses); // Migration endpoint

// Everything below takes a course id: only the course's own professor gets through.
// Keep this after the fixed paths above ('/migrate' would otherwise match ':course_id').
router.use('/:course_id', authenticateToken, requireCourseOwner);

router.get('/:course_id', authenticateToken, courseController.getCourse);
router.put('/:course_id', authenticateToken, courseController.updateCourse);
router.delete('/:course_id', authenticateToken, courseController.deleteCourse);


// Student roster endpoints (subroutes)
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
router.post('/:course_id/roster', (req, res, next) => {
	console.log('--- /:course_id/roster route hit ---');
	next();
}, authenticateToken, upload.single('file'), studentController.uploadRoster);
router.get('/:course_id/students', authenticateToken, studentController.listStudents);
router.post('/:course_id/students', authenticateToken, studentController.addStudent); // Manual add
router.put('/:course_id/students/:student_id', authenticateToken, studentController.updateStudent);
router.delete('/:course_id/students/:student_id', authenticateToken, studentController.deleteStudent);
router.post('/:course_id/students/bulk-delete', authenticateToken, studentController.bulkDeleteStudents);
router.delete('/:course_id/students', authenticateToken, studentController.deleteAllStudents); // Delete ALL students

// Reporting endpoints (subroutes)
router.get('/:course_id/reports', authenticateToken, reportController.getCourseReport);
router.get('/:course_id/reports/download', authenticateToken, reportController.downloadReport);
router.get('/:course_id/reports/student/:student_id', authenticateToken, reportController.getStudentReport);
router.get('/:course_id/reports/team/:team_id', authenticateToken, reportController.getTeamReport);
router.post('/:course_id/reports/generate', authenticateToken, reportController.generateReport);
// Evaluation endpoints (subroutes)
router.post('/:course_id/evaluations/send', authenticateToken, evaluationController.sendEvaluations);
// Send evaluations to a specific team
router.post('/:course_id/teams/:team_id/evaluations/send', authenticateToken, evaluationController.sendTeamEvaluations);
router.get('/:course_id/evaluations/status', authenticateToken, evaluationController.evaluationStatus);
router.post('/:course_id/evaluations/remind', authenticateToken, evaluationController.remindEvaluations);
router.delete('/:course_id/evaluations/reset', authenticateToken, studentController.resetEvaluationState);
// Team management endpoints (subroutes)
router.get('/:course_id/teams', authenticateToken, teamController.listTeams);
router.post('/:course_id/teams', authenticateToken, teamController.createTeams);
router.put('/:course_id/teams/:team_id', authenticateToken, teamController.updateTeam);
router.delete('/:course_id/teams/:team_id', authenticateToken, teamController.deleteTeam);
router.delete('/:course_id/teams', authenticateToken, teamController.clearAllTeams); // Clear all teams
router.post('/:course_id/teams/auto-assign', authenticateToken, teamController.autoAssignTeams);
router.post('/:course_id/teams/:team_id/students/:student_id', authenticateToken, teamController.addStudentToTeam);
router.delete('/:course_id/teams/:team_id/students/:student_id', authenticateToken, teamController.removeStudentFromTeam);

module.exports = router;