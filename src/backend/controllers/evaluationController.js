const Student = require('../models/Student');
const Course = require('../models/Course');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const EVALUATION_RUBRIC = require('../config/rubric');
const { sendEvaluationInvitation, sendEvaluationReminder } = require('../utils/emailUtils');
const { createEmailPacer } = require('../utils/emailPacer');

/**
 * Send evaluation invitations to all students in a specific team
 */
exports.sendTeamEvaluations = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    const { deadline, custom_message } = req.body;

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

    let emailsSent = 0;
    let failedEmails = [];

    console.log(`Starting to send evaluations to ${students.length} students for team ${team_id} in course ${course_id}`);

    // Send email to each student, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of students) {
      try {
        // Generate evaluation token if student doesn't have one
        if (!student.evaluation_token) {
          const evaluationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          await Student.findByIdAndUpdate(student._id, { evaluation_token: evaluationToken });
          student.evaluation_token = evaluationToken;
        }

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
    const { deadline, custom_message } = req.body;

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

    let emailsSent = 0;
    let failedEmails = [];

    console.log(`Starting to send evaluations to ${students.length} students for course ${course_id}`);

    // Send email to each student, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of students) {
      try {
        console.log(`Processing student: ${student.name} (${student.email})`);
        
        // Generate evaluation token if student doesn't have one
        if (!student.evaluation_token) {
          console.log(`Generating token for student: ${student.name}`);
          const evaluationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          await Student.findByIdAndUpdate(student._id, { evaluation_token: evaluationToken });
          student.evaluation_token = evaluationToken;
        }

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
      studentsToRemind = await Student.find({ 
        course_id, 
        _id: { $in: student_ids },
        _id: { $nin: completedEvaluations }
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

    let remindersSent = 0;
    let failedReminders = [];

    // Send reminders, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of studentsToRemind) {
      try {
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

    // Get teammates to evaluate (same team)
    let teammates = [];
    if (student.team_id) {
      teammates = await Student.find({ 
        team_id: student.team_id._id,
        _id: { $ne: student._id } // Exclude self
      }).select('_id name student_id');
    } else {
      // If no team, evaluate all other students in course
      teammates = await Student.find({ 
        course_id: student.course_id._id,
        _id: { $ne: student._id } // Exclude self
      }).select('_id name student_id');
    }

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

    for (const evaluation of newEvaluations) {
      await evaluation.save();
    }

    // Mark student as having completed evaluation
    await Student.findByIdAndUpdate(student._id, { evaluation_completed: true });

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