const mongoose = require('mongoose');
const Student = require('../models/Student');
const Course = require('../models/Course');
const Team = require('../models/Team');
const Evaluation = require('../models/Evaluation');
const EVALUATION_RUBRIC = require('../config/rubric');
const { sendEvaluationInvitation, sendEvaluationReminder } = require('../utils/emailUtils');
const { createEmailPacer, getEmailIntervalMs, getRecipientLimit } = require('../utils/emailPacer');
const { generateEvaluationToken, isLinkActive, isTokenExpired } = require('../utils/evaluationToken');
const { parseDeadline } = require('../utils/evaluationDeadline');
const evaluationStore = require('../utils/saveEvaluations');
const { rotateLink } = require('../utils/linkRotation');
const { loadSubmitters, hasSubmitted } = require('../utils/submitted');
const { countPeers, hasNobodyToRate } = require('../utils/peers');

// The students an evaluator rates: the rest of their team, and nobody when they have no team (CICD-79: the
// instructor is told about such a student, who is not sent a form). The form and the submission both use
// this, so a student can only submit for the people the form showed them.
function findTeammates(student) {
  if (!student.team_id) return [];
  return Student.find({ team_id: student.team_id._id || student.team_id, _id: { $ne: student._id } }).select('_id name student_id');
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
  const err = new Error('The deadline for this evaluation has passed. Ask your instructor for an extension.');
  err.code = 'EVALUATION_LINK_EXPIRED';
  err.status = 410;
  return err;
}

// Who a send reaches (CICD-67): students with no active link who have not submitted. A student with an
// active link keeps it, and its deadline, untouched; giving more time is a separate, deliberate action.
// A student with nobody to rate (alone on their team, CICD-72) is not invited: the form would be empty and
// could never be submitted. `students` is the whole course, or one whole team.
async function planInvitations(students, courseId, now = new Date()) {
  const submitters = await loadSubmitters(courseId);
  const peers = countPeers(students);
  const recipients = [];
  const noTeammates = [];
  let alreadyInvited = 0;
  let alreadySubmitted = 0;
  for (const student of students) {
    if (hasSubmitted(student, submitters)) alreadySubmitted += 1;
    else if (hasNobodyToRate(student, peers)) noTeammates.push(student.name);
    else if (isLinkActive(student, now)) alreadyInvited += 1;
    else recipients.push(student);
  }
  return { recipients, alreadyInvited, alreadySubmitted, noTeammates };
}

// A link is claimed first with one conditional update that needs the student to have no active link, so two
// sends at the same moment cannot both issue one. The email goes out with the claimed token; if it fails the
// claim is given back (only if it is still this token), so a later send reaches the student again.
async function claimLink(student, token, deadline, zone, now = new Date()) {
  // parseDeadline already checked both; written out here so the values that reach the query are
  // plainly a number and a string (CodeQL follows request data into queries)
  const expiresAt = new Date(Number(deadline));
  const zoneName = typeof zone === 'string' ? zone : 'UTC';
  const claimed = await Student.findOneAndUpdate(
    {
      _id: student._id,
      $or: [
        { evaluation_token: null },
        { evaluation_token_expires_at: null },
        { evaluation_token_expires_at: { $lte: now } }
      ]
    },
    { evaluation_token: token, evaluation_token_expires_at: expiresAt, evaluation_deadline_zone: zoneName }
  );
  return Boolean(claimed);
}

// Gives a claimed link back after its email failed, only if it is still this token. If that fails too the
// student keeps a link they never received until the deadline, so the answer says so.
async function releaseLink(student, token) {
  try {
    await Student.updateOne(
      { _id: student._id, evaluation_token: token },
      { evaluation_token: null, evaluation_token_expires_at: null, evaluation_deadline_zone: null }
    );
    return '';
  } catch (error) {
    console.error(`Could not reset the evaluation link of ${student.email}:`, error);
    return '; the link could not be reset, so a new send will skip this student until the deadline';
  }
}

async function deliverInvitations(course, recipients, deadline, zone) {
  const waitTurn = createEmailPacer(); // spaced out so the mail provider doesn't reject a burst
  const failed = [];
  let emailsSent = 0;
  let lostRace = 0;
  for (const student of recipients) {
    // Wait first, then claim, so a link is never held while its email waits its turn
    await waitTurn();
    // Made here, not in claimLink: if the claim errors after the database applied it, the release
    // below still knows which token to take back.
    const token = generateEvaluationToken();
    let problem;
    try {
      if (!(await claimLink(student, token, deadline, zone))) {
        lostRace += 1;
        continue;
      }
      const result = await sendEvaluationInvitation(
        student, course, token, process.env.FRONTEND_URL || 'http://localhost:3000', deadline, zone
      );
      if (result.success) {
        emailsSent += 1;
        continue;
      }
      problem = result.error;
    } catch (error) {
      problem = error.message;
    }
    const held = await releaseLink(student, token);
    failed.push(`${student.name} (${student.email}): ${problem}${held}`);
  }
  return { emailsSent, failed, lostRace };
}

// Saved only after a send that emailed someone, to prefill the next send and to write reminders in the same zone.
async function rememberDeadline(course, result, deadline, zone) {
  if (result.emailsSent === 0) return;
  await Course.findByIdAndUpdate(course._id, {
    last_evaluation_deadline: new Date(Number(deadline)),
    last_evaluation_deadline_zone: typeof zone === 'string' ? zone : 'UTC'
  });
}

function sendAnswer(message, plan, result, deadline) {
  return {
    message,
    emails_sent: result.emailsSent,
    total_students: plan.recipients.length,
    failed: result.failed,
    deadline: deadline.toISOString(),
    already_invited: plan.alreadyInvited + result.lostRace,
    already_submitted: plan.alreadySubmitted,
    no_teammates: plan.noTeammates
  };
}

const NOBODY_MESSAGE = 'Nobody needs an invitation: every student already has an active link or has submitted.';
const NO_ONE_TO_INVITE_MESSAGE = 'Nobody was invited: the students left have nobody to rate.';
const nobodyMessage = (plan) => (plan.noTeammates.length ? NO_ONE_TO_INVITE_MESSAGE : NOBODY_MESSAGE);

function notFound(message) {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  err.status = 404;
  return err;
}

// What a send would do, without doing it (CICD-80): who it cannot reach (alone on their team, or no team: nobody
// to rate) and how many students it would email. The Send dialogs show this first, so the instructor can check
// the assignment before anything goes out. Same students and same rule (planInvitations) as the send itself;
// nothing is changed, no link is issued and no email is sent.
function previewAnswer(plan) {
  return { no_teammates: plan.noTeammates, will_invite: plan.recipients.length };
}

exports.previewTeamSend = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    const team = await Team.findById(team_id);
    if (!team || String(team.course_id) !== String(course_id)) {
      return next(notFound('Team not found or does not belong to this course.'));
    }
    const students = await Student.find({ course_id, team_id });
    res.status(200).json(previewAnswer(await planInvitations(students, course_id)));
  } catch (err) {
    console.error('Error previewing a team send:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

exports.previewCourseSend = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const students = await Student.find({ course_id }).populate('team_id');
    res.status(200).json(previewAnswer(await planInvitations(students, course_id)));
  } catch (err) {
    console.error('Error previewing a course send:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

/**
 * Send evaluation invitations to the students of one team (CICD-67: with a deadline)
 */
exports.sendTeamEvaluations = async (req, res, next) => {
  try {
    const { course_id, team_id } = req.params;
    // Checked first, so a bad request changes nothing
    const { deadline, zone } = parseDeadline(req.body);

    const course = await Course.findById(course_id);
    if (!course) return next(notFound('Course not found.'));
    const team = await Team.findById(team_id);
    if (!team || String(team.course_id) !== String(course_id)) {
      return next(notFound('Team not found or does not belong to this course.'));
    }
    const students = await Student.find({ course_id, team_id });
    if (students.length === 0) return next(notFound('No students found in this team.'));

    const plan = await planInvitations(students, course_id);
    const tooMany = checkRecipientLimit(plan.recipients.length, 'team members',
      'Ask an administrator to raise the sending speed, or split this team into smaller ones.');
    if (tooMany) return next(tooMany);

    const result = await deliverInvitations(course, plan.recipients, deadline, zone);
    await rememberDeadline(course, result, deadline, zone);
    res.status(200).json(sendAnswer(
      plan.recipients.length === 0 ? nobodyMessage(plan) : 'Evaluation invitations sent to team successfully.',
      plan, result, deadline
    ));
  } catch (err) {
    console.error('Error sending team evaluations:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};
/**
 * Send evaluation invitations to the students of a course (CICD-67: with a deadline)
 */
exports.sendEvaluations = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { deadline, zone } = parseDeadline(req.body);

    const course = await Course.findById(course_id);
    if (!course) return next(notFound('Course not found.'));
    const students = await Student.find({ course_id }).populate('team_id');
    if (students.length === 0) return next(notFound('No students found in this course.'));

    const plan = await planInvitations(students, course_id);
    const tooMany = checkRecipientLimit(plan.recipients.length, 'students', 'Send to each team instead.');
    if (tooMany) return next(tooMany);

    const result = await deliverInvitations(course, plan.recipients, deadline, zone);
    await rememberDeadline(course, result, deadline, zone);
    res.status(200).json(sendAnswer(
      plan.recipients.length === 0 ? nobodyMessage(plan) : 'Evaluation invitations sent successfully.',
      plan, result, deadline
    ));
  } catch (err) {
    console.error('Error sending evaluations:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

const EXTEND_INTRO = 'Your instructor extended your deadline. Use this new link; the old one no longer works.';
const EXTEND_SCOPES = ['student', 'team', 'unsubmitted'];

// Who an extension covers (CICD-68): one student, one team, or everyone in the course. Ids are checked and
// cast before they reach a query, and every lookup is limited to this course.
async function studentsInScope(courseId, body) {
  const scope = body.scope;
  if (!EXTEND_SCOPES.includes(scope)) {
    throw validationError('Choose who to extend: one student, one team, or everyone who has not submitted.');
  }
  if (scope === 'unsubmitted') return Student.find({ course_id: courseId });
  const id = scope === 'student' ? body.student_id : body.team_id;
  if (typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
    throw validationError(scope === 'student' ? 'Choose the student to extend.' : 'Choose the team to extend.');
  }
  const objectId = new mongoose.Types.ObjectId(id);
  const students = scope === 'student'
    ? await Student.find({ _id: objectId, course_id: courseId })
    : await Student.find({ team_id: objectId, course_id: courseId });
  if (students.length === 0) {
    throw notFound(scope === 'student' ? 'Student not found in this course.' : 'Team not found in this course, or it has no students.');
  }
  return students;
}

/**
 * Extend the deadline with a new link (CICD-68): one student, one team, or everyone who has not submitted.
 * Students who submitted are never touched; students never invited are skipped (they need a send). Each new
 * link is emailed first and only then swapped in, so a failed email leaves the old link working.
 */
exports.extendEvaluations = async (req, res, next) => {
  try {
    const { course_id } = req.params;
    const { deadline, zone } = parseDeadline(req.body);
    const course = await Course.findById(course_id);
    if (!course) return next(notFound('Course not found.'));
    const students = await studentsInScope(course_id, req.body);

    const submitters = await loadSubmitters(course_id);
    // CICD-72: counted over the whole course, whatever the scope (one student alone in a list looks alone)
    const peers = countPeers(await Student.find({ course_id }));
    const skipped = { submitted: 0, not_invited: 0, changed: 0, no_teammates: 0 };
    const recipients = [];
    for (const student of students) {
      if (hasSubmitted(student, submitters)) skipped.submitted += 1;
      else if (hasNobodyToRate(student, peers)) skipped.no_teammates += 1;
      else if (!student.evaluation_token) skipped.not_invited += 1;
      else recipients.push(student);
    }
    const tooMany = checkRecipientLimit(recipients.length, 'students', 'Extend team by team instead.');
    if (tooMany) return next(tooMany);

    const waitTurn = createEmailPacer();
    const extended = [];
    const failed = [];
    for (const student of recipients) {
      await waitTurn();
      const token = generateEvaluationToken();
      try {
        const result = await sendEvaluationInvitation(
          student, course, token, process.env.FRONTEND_URL || 'http://localhost:3000', deadline, zone, { intro: EXTEND_INTRO }
        );
        if (!result.success) {
          failed.push(`${student.name} (${student.email}): ${result.error}`);
          continue;
        }
        const swapped = await rotateLink(student, token, deadline, zone, { filter: { evaluation_completed: { $ne: true } } });
        if (swapped) extended.push(student.name);
        else skipped.changed += 1;
      } catch (error) {
        failed.push(`${student.name} (${student.email}): ${error.message}`);
      }
    }
    await rememberDeadline(course, { emailsSent: extended.length }, deadline, zone);
    res.status(200).json({
      message: extended.length ? 'Deadline extended.' : 'Nobody was extended.',
      extended,
      failed,
      skipped,
      deadline: deadline.toISOString()
    });
  } catch (err) {
    console.error('Error extending evaluations:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};

const RESUBMIT_INTRO = 'Your instructor has allowed you to submit your evaluation again. Use this new link; the old one no longer works. Your new answers will replace your earlier ones.';

/**
 * Allow one student who has submitted to submit again (CICD-68). A new link is emailed first and only then
 * swapped in, with the approval; the old link dies. Their next submission replaces the earlier evaluations.
 */
exports.allowResubmission = async (req, res, next) => {
  try {
    const { course_id, student_id } = req.params;
    const { deadline, zone } = parseDeadline(req.body);
    if (!mongoose.Types.ObjectId.isValid(student_id)) return next(validationError('Invalid student id.'));
    const course = await Course.findById(course_id);
    if (!course) return next(notFound('Course not found.'));
    const student = await Student.findOne({ _id: new mongoose.Types.ObjectId(student_id), course_id });
    if (!student) return next(notFound('Student not found in this course.'));
    if (!hasSubmitted(student, await loadSubmitters(course_id))) {
      const err = new Error('This student has not submitted yet; send or extend instead.');
      err.code = 'NOT_SUBMITTED';
      err.status = 409;
      return next(err);
    }
    // CICD-72: a new link would open a form with nobody to rate
    if (hasNobodyToRate(student, countPeers(await Student.find({ course_id })))) {
      const err = new Error('This student has no one to rate (alone on their team, or no team assigned), so a new link would be of no use. Add a teammate or assign a team first.');
      err.code = 'NO_TEAMMATES';
      err.status = 409;
      return next(err);
    }
    const token = generateEvaluationToken();
    const result = await sendEvaluationInvitation(
      student, course, token, process.env.FRONTEND_URL || 'http://localhost:3000', deadline, zone, { intro: RESUBMIT_INTRO }
    );
    if (!result.success) {
      const err = new Error(`The email to ${student.name} could not be sent (${result.error}). Nothing was changed.`);
      err.code = 'EMAIL_FAILED';
      err.status = 502;
      return next(err);
    }
    // Only while they are still marked as submitted: a reset meanwhile clears that, and stops this swap
    const swapped = await rotateLink(student, token, deadline, zone, {
      filter: { evaluation_completed: true },
      set: { resubmission_allowed: true }
    });
    if (!swapped) {
      const err = new Error('The student\'s link changed while the email was going out. The new link was not activated; try again.');
      err.code = 'LINK_CHANGED';
      err.status = 409;
      return next(err);
    }
    res.status(200).json({ message: `${student.name} can submit again until the new deadline.`, deadline: deadline.toISOString() });
  } catch (err) {
    console.error('Error allowing a resubmission:', err);
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
    // A round has been sent when a student holds a link, or is marked as submitted (a reset clears both): a course whose students all carry a stale mark but no link must still list them (CICD-70)
    const submitters = await loadSubmitters(course_id);
    const hasStudentsWithTokens = students.length > 0 && students.some((s) => s.evaluation_token || hasSubmitted(s, submitters));
    
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
      // CICD-72: say who a send cannot invite (alone on their team), so an all-skipped course is not a mystery
      const notSentPeers = countPeers(students);
      return res.status(200).json({
        total_count: 0,
        completed_count: 0,
        pending_count: 0,
        completion_rate: 0,
        evaluations_sent: false,
        no_teammates: students.filter((student) => hasNobodyToRate(student, notSentPeers)).map((student) => student.name),
        students: []
      });
    }

    // Who has submitted: the same rule as send and reminders (CICD-70), and the counts come from the rows, so
    // an evaluator who is no longer in the course cannot push the count above the number of students

    // A student alone on their team has nobody to rate (CICD-72): listed, but not counted as pending
    const peers = countPeers(students);

    // Get detailed student status
    const studentStatus = await Promise.all(students.map(async (student) => {
      const hasCompleted = hasSubmitted(student, submitters);
      const ratingsOnFile = submitters.has(student._id.toString());

      // Get the actual submission date if completed
      let lastActivity = null;
      if (ratingsOnFile) {
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
        // false for a student marked as submitted whose evaluations are gone (CICD-70)
        ratings_on_file: hasCompleted ? ratingsOnFile : true,
        // CICD-68: the status dialog's Extend and Allow resubmission buttons need these
        id: student._id.toString(),
        team_id: student.team_id ? String(student.team_id._id || student.team_id) : null,
        resubmission_allowed: Boolean(student.resubmission_allowed),
        // CICD-72: true only for a student who has not submitted and has nobody to rate
        nobody_to_rate: !hasCompleted && hasNobodyToRate(student, peers),
        evaluation_token: student.evaluation_token,
        last_activity: lastActivity              // Show actual submission date
      };
    }));

    // The counts are over the students who can submit, so the course can reach 100%
    const counted = studentStatus.filter((row) => !row.nobody_to_rate);
    const countedTotal = counted.length;
    const completed = counted.filter((row) => row.completed).length;
    const pending = countedTotal - completed;

    res.status(200).json({
      total_count: countedTotal,       // Match frontend expectation
      completed_count: completed,      // Match frontend expectation
      pending_count: pending,
      completion_rate: countedTotal > 0 ? Math.round((completed / countedTotal) * 100) : 0,
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

    // A student marked as submitted is not reminded even when their evaluations are gone (CICD-70)
    const submitters = new Set(completedEvaluations.map(String));
    studentsToRemind = studentsToRemind.filter((student) => !hasSubmitted(student, submitters));

    // A student with nobody to rate (alone on their team, CICD-72) cannot submit, so a reminder cannot help;
    // they are named instead, and are not counted as "not invited" (Send cannot invite them either).
    const peers = countPeers(await Student.find({ course_id }));
    const noTeammates = studentsToRemind.filter((student) => hasNobodyToRate(student, peers)).map((student) => student.name);
    studentsToRemind = studentsToRemind.filter((student) => !hasNobodyToRate(student, peers));

    if (studentsToRemind.length === 0) {
      return res.status(200).json({
        message: noTeammates.length
          ? 'No reminders sent: nobody with an unfinished evaluation can be reminded.'
          : 'No students need reminders - all evaluations completed.',
        reminders_sent: 0,
        no_teammates: noTeammates
      });
    }

    // A reminder only goes to students whose link still works, and never changes a link or a deadline (CICD-67).
    const now = new Date();
    const active = [];
    const deadlinePassed = [];
    let notInvited = 0;
    for (const student of studentsToRemind) {
      if (isLinkActive(student, now)) active.push(student);
      else if (student.evaluation_token) deadlinePassed.push(student.name);
      else notInvited += 1;
    }
    if (active.length === 0) {
      return res.status(200).json({
        message: 'No reminders sent: no student with an unfinished evaluation has an active link. Students whose deadline has passed need an extension first.',
        reminders_sent: 0,
        total_reminded: 0,
        failed: [],
        deadline_passed: deadlinePassed,
        not_invited: notInvited,
        no_teammates: noTeammates
      });
    }

    const tooMany = checkRecipientLimit(active.length, 'students',
      'Remind fewer students at a time by choosing them, or remind team by team.');
    if (tooMany) return next(tooMany);

    let remindersSent = 0;
    let failedReminders = [];

    // Send reminders, spaced out so the mail provider doesn't reject a burst
    const waitTurn = createEmailPacer();
    for (const student of active) {
      try {
        await waitTurn();
        // Checked again after waiting: a deadline can pass while the reminders go out
        if (!isLinkActive(student)) {
          deadlinePassed.push(student.name);
          continue;
        }
        const result = await sendEvaluationReminder(
          student,
          course,
          student.evaluation_token,
          process.env.FRONTEND_URL || 'http://localhost:3000',
          student.evaluation_token_expires_at,
          student.evaluation_deadline_zone || course.last_evaluation_deadline_zone || 'UTC'
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
      total_reminded: active.length,
      failed: failedReminders,
      deadline_passed: deadlinePassed,
      not_invited: notInvited,
      no_teammates: noTeammates
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

    if (existingEvaluation && !student.resubmission_allowed) {
      return res.status(200).json({
        message: 'Evaluation already completed.',
        completed: true,
        submitted_at: existingEvaluation.submitted_at,
        deadline: new Date(student.evaluation_token_expires_at).toISOString()
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
      token: token,
      deadline: new Date(student.evaluation_token_expires_at).toISOString() // CICD-67: shown on the student page
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

    if (existingEvaluation && !student.resubmission_allowed) {
      const err = new Error('Evaluation already completed.');
      err.code = 'ALREADY_COMPLETED';
      err.status = 409;
      return next(err);
    }

    // CICD-72: nobody to rate (alone on a team): the form was empty, so say so instead of "array is required"
    if ((await findTeammates(student)).length === 0) {
      const err = new Error('You have no teammates to rate yet. Ask your instructor to check your team.');
      err.code = 'NO_TEAMMATES';
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
        // The form sends whole numbers; Mongoose alone would also save 4.5 and cast true to 1.
        if (!Number.isInteger(evalData.ratings[rating])) {
          return next(validationError(`The rating for ${rating} must be a whole number.`));
        }
      }

      if (typeof evalData.overall_feedback !== 'string' || evalData.overall_feedback.trim().length < 10) {
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

      const schemaError = evaluation.validateSync();
      if (schemaError) {
        const err = new Error(schemaError.message);
        err.code = 'VALIDATION_ERROR';
        err.status = 400;
        return next(err);
      }
      newEvaluations.push(evaluation);
    }

    // All or nothing, and once only: a second request at the same moment hits the unique
    // index and is told the evaluation is already complete.
    try {
      // An approved resubmission replaces the earlier evaluations; otherwise one submission per student
      const save = student.resubmission_allowed ? evaluationStore.replaceEvaluations : evaluationStore.saveEvaluations;
      await save(newEvaluations, student._id, { token });
    } catch (saveError) {
      if (saveError.code === 'LINK_CHANGED') {
        const err = new Error('This link changed while you were submitting (a new link or deadline). Nothing was saved; use the latest link from your email.');
        err.code = 'LINK_CHANGED';
        err.status = 409;
        return next(err);
      }
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
      completed: !!completed && !student.resubmission_allowed,
      student_name: student.name,
      course_name: student.course_id.course_name,
      deadline: new Date(student.evaluation_token_expires_at).toISOString()
    });

  } catch (err) {
    console.error('Error checking token status:', err);
    err.code = err.code || 'SERVER_ERROR';
    err.status = err.status || 500;
    next(err);
  }
};