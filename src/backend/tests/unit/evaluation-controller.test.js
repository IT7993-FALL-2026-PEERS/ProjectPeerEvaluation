jest.mock('../../models/Student', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../models/Course', () => ({ findById: jest.fn() }));
jest.mock('../../models/Team', () => ({ findById: jest.fn() }));
jest.mock('../../models/Evaluation', () => {
  const Evaluation = jest.fn(function Evaluation(data) {
    Object.assign(this, data);
    this.save = jest.fn().mockResolvedValue(this);
  });
  Evaluation.find = jest.fn();
  Evaluation.findOne = jest.fn();
  Evaluation.exists = jest.fn();
  return Evaluation;
});
jest.mock('../../utils/emailUtils', () => ({
  sendEvaluationInvitation: jest.fn(),
  sendEvaluationReminder: jest.fn()
}));

const Student = require('../../models/Student');
const Course = require('../../models/Course');
const Team = require('../../models/Team');
const Evaluation = require('../../models/Evaluation');
const { sendEvaluationInvitation, sendEvaluationReminder } = require('../../utils/emailUtils');
const evaluationController = require('../../controllers/evaluationController');

const courseId = 'course-1';
const teamId = 'team-1';
const studentId = 'student-1';

function responseMock() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function expectError(next, code, status, message) {
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code, status, message }));
}

function populate(value) {
  const query = { populate: jest.fn(), select: jest.fn().mockResolvedValue(value) };
  query.populate.mockReturnValue(query);
  query.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return query;
}

describe('evaluation controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe.each([
    ['sendTeamEvaluations', { course_id: courseId, team_id: teamId }],
    ['sendEvaluations', { course_id: courseId }]
  ])('%s', (method, params) => {
    test('handles missing course, team constraints, and empty student lists', async () => {
      Course.findById.mockResolvedValue(null);
      let next = jest.fn();
      await evaluationController[method]({ params, body: {} }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Course not found.');

      Course.findById.mockResolvedValue({ _id: courseId });
      if (method === 'sendTeamEvaluations') {
        Team.findById.mockResolvedValue({ course_id: 'other-course' });
        next = jest.fn();
        await evaluationController[method]({ params, body: {} }, responseMock(), next);
        expectError(next, 'NOT_FOUND', 404, 'Team not found or does not belong to this course.');
        Team.findById.mockResolvedValue({ course_id: courseId });
      } else {
        Student.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });
        next = jest.fn();
        await evaluationController[method]({ params, body: {} }, responseMock(), next);
      }

      if (method === 'sendTeamEvaluations') {
        Student.find.mockResolvedValue([]);
        next = jest.fn();
        await evaluationController[method]({ params, body: {} }, responseMock(), next);
      }
      expectError(next, 'NOT_FOUND', 404, expect.stringContaining('No students found'));
    });

    test('sends successful, failed, and throwing email results', async () => {
      Course.findById.mockResolvedValue({ _id: courseId, course_name: 'Course' });
      Team.findById.mockResolvedValue({ _id: teamId, course_id: courseId });
      const students = [
        { _id: 's1', name: 'Ada', email: 'ada@example.com', evaluation_token: 'token-1' },
        { _id: 's2', name: 'Lin', email: 'lin@example.com' },
        { _id: 's3', name: 'Sam', email: 'sam@example.com', evaluation_token: 'token-3' }
      ];
      Student.find.mockReturnValue(method === 'sendEvaluations'
        ? { populate: jest.fn().mockResolvedValue(students) }
        : Promise.resolve(students));
      Student.findByIdAndUpdate.mockResolvedValue({});
      sendEvaluationInvitation
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'rejected' })
        .mockRejectedValueOnce(new Error('mailer down'));
      const res = responseMock();

      await evaluationController[method]({ params, body: { deadline: 'tomorrow' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        emails_sent: 1,
        total_students: 3,
        failed: [
          'Lin (lin@example.com): rejected',
          'Sam (sam@example.com): mailer down'
        ],
        deadline: 'tomorrow'
      }));
      expect(Student.findByIdAndUpdate).toHaveBeenCalledWith('s2', { evaluation_token: expect.any(String) });
    });

    test('forwards lookup errors', async () => {
      const error = new Error('lookup failed');
      Course.findById.mockRejectedValue(error);
      const next = jest.fn();
      await evaluationController[method]({ params, body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
      expect(error).toMatchObject({ code: 'SERVER_ERROR', status: 500 });
    });
  });

  describe('evaluationStatus', () => {
    test.each([
      [[], { total_count: 0, evaluations_sent: false }],
      [[{ _id: 's1' }], { total_count: 0, evaluations_sent: false }]
    ])('returns empty status for %p', async (students, expected) => {
      Student.find.mockResolvedValue(students);
      const res = responseMock();
      await evaluationController.evaluationStatus({ params: { course_id: courseId } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining(expected));
    });

    test('returns completed and pending student details', async () => {
      const submittedAt = new Date('2026-01-01');
      const students = [
        { _id: { toString: () => 's1' }, student_id: 'A', name: 'Ada', email: 'a@x', group_assignment: 'Alpha', evaluation_token: 't1' },
        { _id: { toString: () => 's2' }, evaluation_token: 't2' }
      ];
      Student.find.mockResolvedValue(students);
      Evaluation.find.mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue([students[0]._id]) });
      Evaluation.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue({ submitted_at: submittedAt }) });
      const res = responseMock();
      await evaluationController.evaluationStatus({ params: { course_id: courseId } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        total_count: 2, completed_count: 1, pending_count: 1, completion_rate: 50,
        students: [expect.objectContaining({ student_id: 'A', completed: true, last_activity: submittedAt }), expect.objectContaining({ student_id: 's2', name: 'Unknown Student' })]
      }));
    });

    test('handles completed students without a latest evaluation and zero completion rate', async () => {
      const student = { _id: { toString: () => 's1' }, evaluation_token: 't1' };
      Student.find.mockResolvedValue([student]);
      Evaluation.find.mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue(['s1']) });
      Evaluation.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
      const res = responseMock();

      await evaluationController.evaluationStatus({ params: { course_id: courseId } }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ completion_rate: 100, students: [expect.objectContaining({ last_activity: null })] }));

      Student.find.mockResolvedValue([{ _id: { toString: () => 's2' }, evaluation_token: 't2' }]);
      Evaluation.find.mockReturnValueOnce({ distinct: jest.fn().mockResolvedValue([]) });
      await evaluationController.evaluationStatus({ params: { course_id: courseId } }, res, jest.fn());
      expect(res.json).toHaveBeenLastCalledWith(expect.objectContaining({ completion_rate: 0, completed_count: 0 }));
    });

    test('forwards status errors', async () => {
      const error = new Error('status failed');
      Student.find.mockRejectedValue(error);
      const next = jest.fn();
      await evaluationController.evaluationStatus({ params: { course_id: courseId } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('remindEvaluations', () => {
    test('handles missing course and completed students', async () => {
      Course.findById.mockResolvedValue(null);
      let next = jest.fn();
      await evaluationController.remindEvaluations({ params: { course_id: courseId }, body: {} }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Course not found.');
      Course.findById.mockResolvedValue({ _id: courseId });
      Evaluation.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });
      Student.find.mockResolvedValue([]);
      const res = responseMock();
      await evaluationController.remindEvaluations({ params: { course_id: courseId }, body: { student_ids: [] } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith({ message: 'No students need reminders - all evaluations completed.', reminders_sent: 0 });
    });

    test('reminds selected students and collects failures', async () => {
      Course.findById.mockResolvedValue({ _id: courseId });
      Evaluation.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(['done']) });
      const students = [{ _id: 's1', name: 'Ada', email: 'a@x', evaluation_token: 't1' }, { _id: 's2', name: 'Lin', email: 'l@x', evaluation_token: 't2' }];
      Student.find.mockResolvedValue(students);
      sendEvaluationReminder.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, error: 'bad address' });
      const res = responseMock();
      await evaluationController.remindEvaluations({ params: { course_id: courseId }, body: { student_ids: ['s1', 's2'] } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reminders_sent: 1, total_reminded: 2, failed: ['Lin (l@x): bad address'] }));
    });

    test('records thrown reminder errors', async () => {
      Course.findById.mockResolvedValue({ _id: courseId });
      Evaluation.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });
      Student.find.mockResolvedValue([{ _id: 's1', name: 'Ada', email: 'a@x', evaluation_token: 't1' }]);
      sendEvaluationReminder.mockRejectedValue(new Error('mailer down'));
      const res = responseMock();

      await evaluationController.remindEvaluations({ params: { course_id: courseId }, body: {} }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        reminders_sent: 0,
        failed: ['Ada (a@x): mailer down']
      }));
    });

    test('forwards reminder errors', async () => {
      Course.findById.mockResolvedValue({ _id: courseId });
      Evaluation.find.mockReturnValue({ distinct: jest.fn().mockRejectedValue(new Error('distinct failed')) });
      const next = jest.fn();
      await evaluationController.remindEvaluations({ params: { course_id: courseId }, body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'distinct failed', code: 'SERVER_ERROR', status: 500 }));
    });
  });

  describe('public evaluation handlers', () => {
    const validRatings = { professionalism: 4, communication: 4, work_ethic: 4, content_knowledge_skills: 4, overall_contribution: 4, participation: 4 };

    test('gets an evaluation form for team and no-team students', async () => {
      const course = { _id: courseId, course_name: 'Course', course_number: 'CS1', course_section: '01', semester: 'Fall' };
      const student = { _id: studentId, name: 'Ada', student_id: 'A', course_id: course, team_id: { _id: teamId, team_name: 'Alpha' } };
      Student.findOne.mockReturnValue(populate(student));
      Evaluation.findOne.mockResolvedValue(null);
      Student.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ _id: 's2', name: 'Lin', student_id: 'L' }]) });
      const res = responseMock();
      await evaluationController.getEvaluationForm({ params: { token: 'token' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ evaluator: expect.objectContaining({ team: 'Alpha' }), teammates: expect.any(Array) }));

      Student.findOne.mockReturnValue(populate({ ...student, team_id: null }));
      await evaluationController.getEvaluationForm({ params: { token: 'token' } }, res, jest.fn());
      expect(Student.find).toHaveBeenLastCalledWith({ course_id: courseId, _id: { $ne: studentId } });
    });

    test('handles missing and completed evaluation forms', async () => {
      Student.findOne.mockReturnValue(populate(null));
      let next = jest.fn();
      await evaluationController.getEvaluationForm({ params: { token: 'bad' } }, responseMock(), next);
      expectError(next, 'EVALUATION_CANCELLED', 404, expect.stringContaining('cancelled'));
      const completed = { submitted_at: new Date() };
      Student.findOne.mockReturnValue(populate({ _id: studentId, course_id: { _id: courseId } }));
      Evaluation.findOne.mockResolvedValue(completed);
      const res = responseMock();
      await evaluationController.getEvaluationForm({ params: { token: 'done' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith({ message: 'Evaluation already completed.', completed: true, submitted_at: completed.submitted_at });
    });

    test('forwards evaluation form lookup errors', async () => {
      const error = new Error('form lookup failed');
      const lookup = { populate: jest.fn() };
      lookup.populate.mockReturnValueOnce(lookup).mockReturnValueOnce(Promise.reject(error));
      Student.findOne.mockReturnValue(lookup);
      const next = jest.fn();

      await evaluationController.getEvaluationForm({ params: { token: 'broken' } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'form lookup failed', code: 'SERVER_ERROR', status: 500 }));
    });

    test('submits valid evaluations and rejects validation, duplicate, and missing-token cases', async () => {
      const student = { _id: studentId, course_id: { _id: courseId } };
      Student.findOne.mockReturnValue(populate(null));
      let next = jest.fn();
      await evaluationController.submitEvaluation({ params: { token: 'bad' }, body: {} }, responseMock(), next);
      expectError(next, 'EVALUATION_CANCELLED', 404, expect.stringContaining('cancelled'));

      Student.findOne.mockReturnValue(populate(student));
      Evaluation.findOne.mockResolvedValue({});
      next = jest.fn();
      await evaluationController.submitEvaluation({ params: { token: 'done' }, body: { evaluations: [] } }, responseMock(), next);
      expectError(next, 'ALREADY_COMPLETED', 409, 'Evaluation already completed.');

      Evaluation.findOne.mockResolvedValue(null);
      next = jest.fn();
      await evaluationController.submitEvaluation({ params: { token: 't' }, body: { evaluations: [] } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Evaluations array is required.');

      next = jest.fn();
      await evaluationController.submitEvaluation({ params: { token: 't' }, body: { evaluations: [{ ratings: {}, overall_feedback: 'long enough feedback' }] } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Missing rating for professionalism.');

      next = jest.fn();
      await evaluationController.submitEvaluation({ params: { token: 't' }, body: { evaluations: [{ ratings: validRatings, overall_feedback: 'short' }] } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Overall feedback is required (minimum 10 characters).');

      Student.findByIdAndUpdate.mockResolvedValue({});
      const res = responseMock();
      await evaluationController.submitEvaluation({ params: { token: 't' }, body: { evaluations: [{ student_id: 'peer', ratings: validRatings, overall_feedback: 'Excellent work.' }] } }, res, jest.fn());
      expect(Evaluation).toHaveBeenCalledWith(expect.objectContaining({ student_id: 'peer', evaluation_token: 't' }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ evaluations_count: 1 }));
    });

    test('forwards evaluation save errors', async () => {
      const error = new Error('save failed');
      const student = { _id: studentId, course_id: { _id: courseId } };
      Student.findOne.mockReturnValue(populate(student));
      Evaluation.findOne.mockResolvedValue(null);
      Evaluation.mockImplementationOnce(function FailedEvaluation() {
        this.save = jest.fn().mockRejectedValue(error);
      });
      const next = jest.fn();

      await evaluationController.submitEvaluation({
        params: { token: 't' },
        body: { evaluations: [{ student_id: 'peer', ratings: validRatings, overall_feedback: 'Excellent work.' }] }
      }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'save failed', code: 'SERVER_ERROR', status: 500 }));
    });

    test('reports token status and errors', async () => {
      Student.findOne.mockReturnValue(populate(null));
      let next = jest.fn();
      await evaluationController.evaluationTokenStatus({ params: { token: 'bad' } }, responseMock(), next);
      expectError(next, 'INVALID_TOKEN', 404, 'Invalid evaluation token.');
      const student = { _id: studentId, name: 'Ada', course_id: { _id: courseId, course_name: 'Course' } };
      Student.findOne.mockReturnValue(populate(student));
      Evaluation.exists.mockResolvedValue(true);
      const res = responseMock();
      await evaluationController.evaluationTokenStatus({ params: { token: 't' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith({ valid: true, completed: true, student_name: 'Ada', course_name: 'Course' });
      Evaluation.exists.mockRejectedValue(new Error('status failed'));
      next = jest.fn();
      await evaluationController.evaluationTokenStatus({ params: { token: 't' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'status failed' }));
    });
  });
});