const Team = require('../models/Team');
const Student = require('../models/Student');
const mongoose = require('mongoose');

// A team request body is untrusted input: the URL's :course_id is checked by the
// course ownership middleware, but nothing in the body is. Only the team name and
// status are read (never course_id, members, counts or timestamps). Teams are created
// empty: members are added with the add-student endpoint, which checks the course and
// keeps Team.students and Student.team_id in step (CICD-45).
const TEAM_STATUSES = Team.schema.path('team_status').enumValues;

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.status = 400;
  return err;
}

// Returns { fields } with the allowed, validated fields that were present, or { error }.
function readTeamFields(input, { nameRequired }) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const fields = {};
  if (body.team_name !== undefined || nameRequired) {
    if (typeof body.team_name !== 'string' || body.team_name.trim() === '') {
      return { error: 'Team name is required.' };
    }
    fields.team_name = body.team_name.trim();
  }
  if (body.team_status !== undefined) {
    if (!TEAM_STATUSES.includes(body.team_status)) {
      return { error: `Team status must be one of: ${TEAM_STATUSES.join(', ')}.` };
    }
    fields.team_status = body.team_status;
  }
  return { fields };
}

exports.listTeams = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    // Members are shown without their evaluation link tokens (and expiry).
    const teams = await Team.find({ course_id }).populate({
      path: 'students',
      select: '-evaluation_token -evaluation_token_expires_at'
    });
    res.status(200).json(teams);
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.createTeams = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { teams } = req.body;
    if (!Array.isArray(teams) || teams.length === 0) {
      const err = new Error('Teams array required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    const docs = [];
    for (const t of teams) {
      const { fields, error } = readTeamFields(t, { nameRequired: true });
      if (error) return next(validationError(error));
      // A list of students here used to be saved as sent: it accepted students of
      // other courses and wrote only Team.students, never Student.team_id.
      const students = t.students;
      if (students !== undefined && !(Array.isArray(students) && students.length === 0)) {
        return next(validationError('Teams are created empty. Add students with POST /courses/:course_id/teams/:team_id/students/:student_id.'));
      }
      docs.push({ ...fields, course_id });
    }

    const created = await Team.insertMany(docs);
    
    // Update course team_count
    const Course = require('../models/Course');
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const teamCount = await Team.countDocuments({ course_id: courseObjectId });
    await Course.findByIdAndUpdate(courseObjectId, { team_count: teamCount });
    
    res.status(201).json({ message: 'Teams created.', teams: created.map(t => t._id) });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.updateTeam = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(team_id)) {
      const err = new Error('Invalid team ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    
    const { fields: updates, error: fieldError } = readTeamFields(req.body, { nameRequired: false });
    if (fieldError) return next(validationError(fieldError));

    // Get the current team before updating
    const currentTeam = await Team.findOne({ _id: team_id, course_id });
    if (!currentTeam) {
      const err = new Error('Team not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    const team = await Team.findOneAndUpdate({ _id: team_id, course_id }, updates, { new: true });
    
    // If team name was updated, update all students' group_assignment field
    if (updates.team_name && updates.team_name !== currentTeam.team_name) {
      await Student.updateMany(
        { team_id: team_id },
        { group_assignment: updates.team_name }
      );
      console.log(`Updated group_assignment for students from "${currentTeam.team_name}" to "${updates.team_name}"`);
    }
    
    console.log(`Team updated: ${team.team_name} (Status: ${team.team_status})`);
    
    res.status(200).json({ 
      message: `Team "${team.team_name}" updated successfully.`,
      team: team
    });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.deleteTeam = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(team_id)) {
      const err = new Error('Invalid team ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    
    // Find the team first to check if it has students
    const team = await Team.findOne({ _id: team_id, course_id });
    if (!team) {
      const err = new Error('Team not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Check if team has any students - if so, prevent deletion
    if (team.students.length > 0) {
      const err = new Error('Cannot delete team with students. Please remove all students from the team first.');
      err.code = 'CONSTRAINT_ERROR';
      err.status = 409;
      return next(err);
    }
    
    // Delete the team (no students to unlink)
    await Team.findOneAndDelete({ _id: team_id, course_id });
    
    console.log(`Deleted empty team: ${team.team_name}`);
    
    // Update course team_count
    const Course = require('../models/Course');
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const teamCount = await Team.countDocuments({ course_id: courseObjectId });
    await Course.findByIdAndUpdate(courseObjectId, { team_count: teamCount });
    
    res.status(200).json({ 
      message: `Team "${team.team_name}" deleted successfully.`
    });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.clearAllTeams = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(course_id)) {
      const err = new Error('Invalid course ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    
    // Remove all teams for this course
    const deleteResult = await Team.deleteMany({ course_id: courseObjectId });
    
    // Remove team_id and group_assignment from all students in this course
    const Student = require('../models/Student');
    await Student.updateMany(
      { course_id: courseObjectId },
      { $unset: { team_id: "", group_assignment: "" } }
    );
    
    // Update course team_count to 0
    const Course = require('../models/Course');
    await Course.findByIdAndUpdate(courseObjectId, { team_count: 0 });
    
    console.log(`Cleared ${deleteResult.deletedCount} teams from course ${course_id}`);
    
    res.status(200).json({ 
      message: `All teams cleared successfully. ${deleteResult.deletedCount} teams deleted.`,
      teams_deleted: deleteResult.deletedCount
    });
  } catch (err) {
    console.error('Error clearing teams:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.autoAssignTeams = async (req, res, next) => {
  // Placeholder for auto-assign logic
  const err = new Error('Auto-assign not implemented.');
  err.code = 'NOT_IMPLEMENTED';
  err.status = 501;
  next(err);
};

exports.addStudentToTeam = async (req, res, next) => {
  try {
    const { course_id, team_id, student_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id) || 
        !mongoose.Types.ObjectId.isValid(team_id) || 
        !mongoose.Types.ObjectId.isValid(student_id)) {
      const err = new Error('Invalid course, team, or student ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const teamObjectId = new mongoose.Types.ObjectId(team_id);
    const studentObjectId = new mongoose.Types.ObjectId(student_id);
    
    // Find the team
    const team = await Team.findOne({ _id: teamObjectId, course_id: courseObjectId });
    if (!team) {
      const err = new Error('Team not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Find the student
    const Student = require('../models/Student');
    const student = await Student.findOne({ _id: studentObjectId, course_id: courseObjectId });
    if (!student) {
      const err = new Error('Student not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Check if student is already in this team
    if (team.students.includes(studentObjectId)) {
      const err = new Error('Student is already in this team.');
      err.code = 'DUPLICATE';
      err.status = 409;
      return next(err);
    }
    
    // Remove student from any existing team in this course
    await Team.updateMany(
      { course_id: courseObjectId, students: studentObjectId },
      { $pull: { students: studentObjectId } }
    );
    
    // Add student to the new team
    team.students.push(studentObjectId);
    team.student_count = team.students.length;
    await team.save();
    
    // Update student's team_id and group_assignment
    student.team_id = teamObjectId;
    student.group_assignment = team.team_name;
    await student.save();
    
    // Update student counts for all teams in this course
    const allTeams = await Team.find({ course_id: courseObjectId });
    for (const t of allTeams) {
      t.student_count = t.students.length;
      await t.save();
    }
    
    res.status(200).json({ 
      message: `Student "${student.name}" added to team "${team.team_name}".`,
      team: team,
      student: student
    });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.removeStudentFromTeam = async (req, res, next) => {
  try {
    const { course_id, team_id, student_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(course_id) || 
        !mongoose.Types.ObjectId.isValid(team_id) || 
        !mongoose.Types.ObjectId.isValid(student_id)) {
      const err = new Error('Invalid course, team, or student ID.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }
    
    const courseObjectId = new mongoose.Types.ObjectId(course_id);
    const teamObjectId = new mongoose.Types.ObjectId(team_id);
    const studentObjectId = new mongoose.Types.ObjectId(student_id);
    
    // Find the team
    const team = await Team.findOne({ _id: teamObjectId, course_id: courseObjectId });
    if (!team) {
      const err = new Error('Team not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Find the student
    const Student = require('../models/Student');
    const student = await Student.findOne({ _id: studentObjectId, course_id: courseObjectId });
    if (!student) {
      const err = new Error('Student not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Check if student is in this team
    if (!team.students.includes(studentObjectId)) {
      const err = new Error('Student is not in this team.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }
    
    // Remove student from the team
    team.students.pull(studentObjectId);
    team.student_count = team.students.length;
    await team.save();
    
    // Update student's team_id and group_assignment
    student.team_id = null;
    student.group_assignment = '';
    await student.save();
    
    res.status(200).json({ 
      message: `Student "${student.name}" removed from team "${team.team_name}".`,
      team: team,
      student: student
    });
  } catch (err) {
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};