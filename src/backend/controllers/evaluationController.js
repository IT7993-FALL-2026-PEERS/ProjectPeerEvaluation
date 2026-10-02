const Student = require('../models/Student');
const Course = require('../models/Course');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const EVALUATION_RUBRIC = require('../config/rubric');
const { sendEvaluationInvitation, sendEvaluationReminder } = require('../utils/emailUtils');
const { createEmailPacer, getEmailIntervalMs, getRecipientLimit } = require('../utils/emailPacer');
const { refreshEvaluationToken, isTokenExpired } = require('../utils/evaluationToken');
const evaluationStore = require('../utils/saveEvaluations');

// Gives the student a working link before an invitation or reminder is sent:
// keeps a valid token, replaces a missing or expired one, and restarts the expiry.
async function issueEvaluationLink(student) {
  const { token, expiresAt } = refreshEvaluationToken(student);
  await Student.findByIdAndUpdate(student._id, {
    evaluation_token: token,
    evaluation_token_expires_at: expiresAt
  });
  student.evaluation_token = token;
  student.evaluation_token_expires_at = expiresAt;
}

// The students an evaluator rates: the rest of their team, or the rest of the
// course when they have no team. The form and the submission both use this, so
// a student can only submit for the people the form showed them.
function findTeammates(student) {
  const scope = student.team_id
    ? { team_id: student.team_id._id || student.team_id }
    : { course_id: student.course_id._id };
  return Student.find({ ...scope, _id: { $ne: student._id } }).select('_id name student_id');
}

function validationError(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  err.status = 400;
  return err;
}

// Refuses a send that cannot finish inside one request (see utils/emailPacer.js). Checked before any
// link is issued or email sent, so a refused request changes nothing. `what` names the recipients and
// `advice` says what to do instead, which differs for a course, a single team and a reminder.
function checkRecipientLimit(count, what, advice) {
  const limit = getRecipientLimit();
  if (count <= limit) return null;
  const intervalMs = getEmailIntervalMs();
  const every = intervalMs % 1000 === 0 ? `${intervalMs / 1000} seconds` : (intervalMs < 1000 ? `${intervalMs} milliseconds` : `${intervalMs / 1000} seconds`);
  const err = new Error(
    `This would email ${count} ${what}, but at the current sending speed (one email every ${every}) ` +
    `at most ${limit} can be emailed in one go. ${advice}`
  );
  err.code = 'TOO_MANY_RECIPIENTS';
  err.status = 400;
  return err;
}

function linkExpiredError() {
  const err = new Error('This evaluation link has expired. Ask your professor to send a new one.');
  err.code = 'EVALUATION_LINK_EXPIRED';
  err.status = 410;
  return err;
}

/**
 * Send evaluation invitations to all students in a specific team
 */
exports.sendTeamEvaluations = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    const { deadline } = req.body;

    // Get course details
    const course = await Course.findById(course_id);
    if (!course) {
      const err = new Error('Course not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get team details
    const team = await Team.findById(team_id);
    if (!team || String(team.course_id) !== String(course_id)) {
      const err = new Error('Team not found or does not belong to this course.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get all students in the team
    const students = await Student.find({ course_id, team_id });
    if (students.length === 0) {
      const err = new Error('No students found in this team.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    const tooMany = checkRecipientLimit(students.length, 'team members',
      'Ask an administrator to raise the sending speed, or split this team into smaller ones.');
    if (tooMany) return next(tooMany);

    let emailsSent = 0;
    let failedEmails = [];

    console.log(`Starting to send evaluations to ${students.length} students for team ${team_id} in course ${course_id}`);

    // Send email to each student, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of students) {
      try {
        await issueEvaluationLink(student);

        await waitTurn();
        const result = await sendEvaluationInvitation(
          student,
          course,
          student.evaluation_token,
          process.env.FRONTEND_URL || 'http://localhost:3000',
          deadline
        );
        if (result.success) {
          emailsSent++;
        } else {
          failedEmails.push(`${student.name} (${student.email}): ${result.error}`);
        }
      } catch (error) {
        failedEmails.push(`${student.name} (${student.email}): ${error.message}`);
      }
    }

    res.status(200).json({
      message: `Evaluation invitations sent to team successfully.`,
      emails_sent: emailsSent,
      total_students: students.length,
      failed: failedEmails,
      deadline: deadline
    });

  } catch (err) {
    console.error('Error sending team evaluations:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};
/**
 * Send evaluation invitations to all students in a course
 */
exports.sendEvaluations = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { deadline } = req.body;

    // Get course details
    const course = await Course.findById(course_id);
    if (!course) {
      const err = new Error('Course not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get all students in the course
    const students = await Student.find({ course_id }).populate('team_id');
    
    if (students.length === 0) {
      const err = new Error('No students found in this course.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    const tooMany = checkRecipientLimit(students.length, 'students', 'Send to each team instead.');
    if (tooMany) return next(tooMany);

    let emailsSent = 0;
    let failedEmails = [];

    console.log(`Starting to send evaluations to ${students.length} students for course ${course_id}`);

    // Send email to each student, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of students) {
      try {
        console.log(`Processing student: ${student.name} (${student.email})`);
        
        await issueEvaluationLink(student);

        console.log(`Sending email to: ${student.email}`);
        await waitTurn();
        const result = await sendEvaluationInvitation(
          student, 
          course, 
          student.evaluation_token,
          process.env.FRONTEND_URL || 'http://localhost:3000',
          deadline
        );
        
        console.log(`Email result for ${student.email}:`, result.success ? 'SUCCESS' : `FAILED - ${result.error}`);
        
        if (result.success) {
          emailsSent++;
        } else {
          failedEmails.push(`${student.name} (${student.email}): ${result.error}`);
        }
      } catch (error) {
        failedEmails.push(`${student.name} (${student.email}): ${error.message}`);
      }
    }

    console.log(`Evaluation sending completed. Sent: ${emailsSent}/${students.length}, Failed: ${failedEmails.length}`);

    res.status(200).json({
      message: `Evaluation invitations sent successfully.`,
      emails_sent: emailsSent,
      total_students: students.length,
      failed: failedEmails,
      deadline: deadline
    });

  } catch (err) {
    console.error('Error sending evaluations:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Get evaluation status for a course
 */
exports.evaluationStatus = async (req, res, next) => {
  try {
    const { course_id } = req.params;

    // Get all students in the course
    const students = await Student.find({ course_id });
    const total = students.length;

    // Check if evaluations have been sent by looking for students with evaluation tokens
    // (tokens are only generated when evaluations are actually sent)
    const hasStudentsWithTokens = students.length > 0 && students.some(s => s.evaluation_token);
    
    // If no students exist, return empty state
    if (total === 0) {
      return res.status(200).json({
        total_count: 0,
        completed_count: 0,
        pending_count: 0,
        completion_rate: 0,
        evaluations_sent: false,
        students: []
      });
    }
    
    // If students don't have tokens, evaluations haven't been sent
    if (!hasStudentsWithTokens) {
      return res.status(200).json({
        total_count: 0,
        completed_count: 0,
        pending_count: 0,
        completion_rate: 0,
        evaluations_sent: false,
        students: []
      });
    }

    // Get completed evaluations
    const completedEvaluations = await Evaluation.find({ course_id }).distinct('evaluator_id');
    const completed = completedEvaluations.length;
    const pending = total - completed;

    // Get detailed student status
    const studentStatus = await Promise.all(students.map(async (student) => {
      // Convert both to strings for proper comparison
      const studentIdStr = student._id.toString();
      const hasCompleted = completedEvaluations.some(evalId => evalId.toString() === studentIdStr);
      
      // Get the actual submission date if completed
      let lastActivity = null;
      if (hasCompleted) {
        const evaluation = await Evaluation.findOne({ 
          course_id, 
          evaluator_id: student._id 
        }).sort({ submitted_at: -1 }); // Get the most recent submission
        lastActivity = evaluation ? evaluation.submitted_at : null;
      }
      
      return {
        student_id: student.student_id || student._id.toString(),  // Fallback to _id if student_id is missing
        name: student.name || 'Unknown Student',              // Fallback if name is missing
        email: student.email || 'No Email',            // Fallback if email is missing
        team: student.group_assignment || 'No Team',  // Match frontend expectation
        completed: hasCompleted,         // Match frontend expectation
        evaluation_token: student.evaluation_token,
        last_activity: lastActivity              // Show actual submission date
      };
    }));

    res.status(200).json({
      total_count: total,              // Match frontend expectation
      completed_count: completed,      // Match frontend expectation
      pending_count: pending,
      completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      evaluations_sent: true,         // Evaluations have been sent
      students: studentStatus
    });

  } catch (err) {
    console.error('Error getting evaluation status:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Send reminder emails to students who haven't completed evaluations
 */
exports.remindEvaluations = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { student_ids } = req.body; // Optional: specific students to remind

    // Get course details
    const course = await Course.findById(course_id);
    if (!course) {
      const err = new Error('Course not found.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      return next(err);
    }

    // Get students who haven't completed evaluations
    const completedEvaluations = await Evaluation.find({ course_id }).distinct('evaluator_id');
    
    let studentsToRemind;
    if (student_ids && student_ids.length > 0) {
      // Remind specific students
      // One _id condition: a second `_id` key would silently replace the first (API-8)
      studentsToRemind = await Student.find({ 
        course_id, 
        _id: { $in: student_ids, $nin: completedEvaluations }
      });
    } else {
      // Remind all students who haven't completed
      studentsToRemind = await Student.find({ 
        course_id,
        _id: { $nin: completedEvaluations }
      });
    }

    if (studentsToRemind.length === 0) {
      return res.status(200).json({
        message: 'No students need reminders - all evaluations completed.',
        reminders_sent: 0
      });
    }

    const tooMany = checkRecipientLimit(studentsToRemind.length, 'students',
      'Remind fewer students at a time by choosing them, or remind team by team.');
    if (tooMany) return next(tooMany);

    let remindersSent = 0;
    let failedReminders = [];

    // Send reminders, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of studentsToRemind) {
      try {
        await issueEvaluationLink(student);
        await waitTurn();
        const result = await sendEvaluationReminder(
          student,
          course,
          student.evaluation_token,
          process.env.FRONTEND_URL || 'http://localhost:3000'
        );
        
        if (result.success) {
          remindersSent++;
        } else {
          failedReminders.push(`${student.name} (${student.email}): ${result.error}`);
        }
      } catch (error) {
        failedReminders.push(`${student.name} (${student.email}): ${error.message}`);
      }
    }

    res.status(200).json({
      message: `Reminder emails sent successfully.`,
      reminders_sent: remindersSent,
      total_reminded: studentsToRemind.length,
      failed: failedReminders
    });

  } catch (err) {
    console.error('Error sending reminders:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Get evaluation form for a student (public endpoint - no auth required)
 */
exports.getEvaluationForm = async (req, res, next) => {
  try {
    const { token } = req.params;

    // Find student by evaluation token
    const student = await Student.findOne({ evaluation_token: token }).populate('course_id').populate('team_id');
    
    if (!student) {
      const err = new Error('This evaluation has been cancelled or is no longer available.');
      err.code = 'EVALUATION_CANCELLED';
      err.status = 404;
      return next(err);
    }

    if (isTokenExpired(student)) {
      return next(linkExpiredError());
    }

    // Check if student has already completed evaluation
    const existingEvaluation = await Evaluation.findOne({ 
      course_id: student.course_id._id,
      evaluator_id: student._id 
    });

    if (existingEvaluation) {
      return res.status(200).json({
        message: 'Evaluation already completed.',
        completed: true,
        submitted_at: existingEvaluation.submitted_at
      });
    }

    const teammates = await findTeammates(student);

    // Prepare evaluation form data
    const evaluationForm = {
      evaluator: {
        name: student.name,
        student_id: student.student_id,
        team: student.team_id ? student.team_id.team_name : 'No Team'
      },
      course: {
        name: student.course_id.course_name,
        number: student.course_id.course_number,
        section: student.course_id.course_section,
        semester: student.course_id.semester
      },
      teammates: teammates,
      rubric: EVALUATION_RUBRIC,
      token: token
    };

    res.status(200).json(evaluationForm);

  } catch (err) {
    console.error('Error getting evaluation form:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Submit evaluation (public endpoint - no auth required)
 */
exports.submitEvaluation = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { evaluations } = req.body;

    // Find student by evaluation token
    const student = await Student.findOne({ evaluation_token: token }).populate('course_id');
    
    if (!student) {
      const err = new Error('This evaluation has been cancelled or is no longer available.');
      err.code = 'EVALUATION_CANCELLED';
      err.status = 404;
      return next(err);
    }

    if (isTokenExpired(student)) {
      return next(linkExpiredError());
    }

    // Check if already completed
    const existingEvaluation = await Evaluation.findOne({ 
      course_id: student.course_id._id,
      evaluator_id: student._id 
    });

    if (existingEvaluation) {
      const err = new Error('Evaluation already completed.');
      err.code = 'ALREADY_COMPLETED';
      err.status = 409;
      return next(err);
    }

    // Validate evaluations array
    if (!evaluations || !Array.isArray(evaluations) || evaluations.length === 0) {
      const err = new Error('Evaluations array is required.');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      return next(err);
    }

    // API-2: the evaluations must cover exactly the evaluator's teammates, each
    // once. Checked before anything is saved; a partial submission could never be
    // completed later, because the duplicate guard above would refuse it.
    const teammateIds = new Set((await findTeammates(student)).map((mate) => String(mate._id)));
    const ratedIds = new Set();
    for (const evalData of evaluations) {
      // Only a plain string ID counts; String(['<id>']) would otherwise pass.
      const targetId = evalData && typeof evalData.student_id === 'string' ? evalData.student_id : null;
      if (targetId === String(student._id)) {
        return next(validationError('You cannot rate yourself.'));
      }
      if (!teammateIds.has(targetId)) {
        return next(validationError('You can only rate your current teammates. Reload the page and try again.'));
      }
      if (ratedIds.has(targetId)) {
        return next(validationError('Each teammate can only be rated once.'));
      }
      ratedIds.add(targetId);
    }
    if (ratedIds.size !== teammateIds.size) {
      return next(validationError('Rate every teammate before submitting. Reload the page if your team has changed.'));
    }

    // Validate every evaluation before saving any, so a bad one later in the list
    // cannot leave a partial submission that the duplicate check then locks in.
    const newEvaluations = [];
    for (const evalData of evaluations) {
      // Validate required fields
      const requiredRatings = ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution', 'participation'];
      
      for (const rating of requiredRatings) {
        if (!evalData.ratings || evalData.ratings[rating] === undefined) {
          const err = new Error(`Missing rating for ${rating}.`);
          err.code = 'VALIDATION_ERROR';
          err.status = 400;
          return next(err);
        }
      }

      if (!evalData.overall_feedback || evalData.overall_feedback.trim().length < 10) {
        const err = new Error('Overall feedback is required (minimum 10 characters).');
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        return next(err);
      }

      // Create evaluation
      const evaluation = new Evaluation({
        course_id: student.course_id._id,
        student_id: evalData.student_id,
        evaluator_id: student._id,
        ratings: {
          professionalism: evalData.ratings.professionalism,
          communication: evalData.ratings.communication,
          work_ethic: evalData.ratings.work_ethic,
          content_knowledge_skills: evalData.ratings.content_knowledge_skills,
          overall_contribution: evalData.ratings.overall_contribution,
          participation: evalData.ratings.participation
        },
        overall_feedback: evalData.overall_feedback.trim(),
        evaluation_token: token
      });

      const validationError = evaluation.validateSync();
      if (validationError) {
        const err = new Error(validationError.message);
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        return next(err);
      }
      newEvaluations.push(evaluation);
    }

    // All or nothing, and once only: a second request at the same moment hits the unique
    // index and is told the evaluation is already complete.
    try {
      await evaluationStore.saveEvaluations(newEvaluations, student._id);
    } catch (saveError) {
      if (saveError.code !== 11000) throw saveError;
      const err = new Error('Evaluation already completed.');
      err.code = 'ALREADY_COMPLETED';
      err.status = 409;
      return next(err);
    }

    res.status(201).json({
      message: 'Evaluation submitted successfully.',
      evaluations_count: newEvaluations.length,
      submitted_at: new Date()
    });

  } catch (err) {
    console.error('Error submitting evaluation:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Check evaluation token status (public endpoint - no auth required)
 */
exports.evaluationTokenStatus = async (req, res, next) => {
  try {
    const { token } = req.params;

    // Find student by evaluation token
    const student = await Student.findOne({ evaluation_token: token }).populate('course_id');
    
    if (!student) {
      const err = new Error('Invalid evaluation token.');
      err.code = 'INVALID_TOKEN';
      err.status = 404;
      return next(err);
    }

    if (isTokenExpired(student)) {
      return next(linkExpiredError());
    }

    // Check if evaluation completed
    const completed = await Evaluation.exists({ 
      course_id: student.course_id._id,
      evaluator_id: student._id 
    });

    res.status(200).json({
      valid: true,
      completed: !!completed,
      student_name: student.name,
      course_name: student.course_id.course_name
    });

  } catch (err) {
    console.error('Error checking token status:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};