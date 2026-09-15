jest.mock('../../models/Student', () => ({ find: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/Course', () => ({ findById: jest.fn() }));
jest.mock('../../models/Team', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../../models/Evaluation', () => ({ find: jest.fn() }));

const Student = require('../../models/Student');
const Course = require('../../models/Course');
const Team = require('../../models/Team');
const Evaluation = require('../../models/Evaluation');
const reportController = require('../../controllers/reportController');

const courseId = '507f1f77bcf86cd799439011';
const teamId = '507f1f77bcf86cd799439012';

function responseMock() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn(), send: jest.fn() };
}

function expectError(next, code, status, message) {
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code, status, message }));
}

function query(value) {
  return { populate: jest.fn().mockReturnThis(), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
}

function object(value) {
  return { ...value, toObject: () => ({ ...value }) };
}

describe('report controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getCourseReport', () => {
    test('assigns C and D letter grades', async () => {
      const students = [
        object({ _id: 's1', name: 'Casey' }),
        object({ _id: 's2', name: 'Drew' })
      ];
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query(students));
      Evaluation.find.mockResolvedValue([
        object({ student_id: 's1', ratings: { professionalism: 3.5 }, overall_feedback: '' }),
        object({ student_id: 's2', ratings: { professionalism: 3 }, overall_feedback: '' })
      ]);
      Team.find.mockResolvedValue([]);
      const res = responseMock();

      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());

      expect(res.json.mock.calls[0][0].students).toEqual(expect.arrayContaining([
        expect.objectContaining({ letterGrade: 'C' }),
        expect.objectContaining({ letterGrade: 'D' })
      ]));
    });

    test('validates IDs and reports missing courses', async () => {
      let next = jest.fn();
      await reportController.getCourseReport({ params: { course_id: 'bad' }, query: {} }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
      Course.findById.mockResolvedValue(null);
      next = jest.fn();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Course not found.');
    });

    test('returns empty student and evaluation states', async () => {
      const course = { course_name: 'Course' };
      Course.findById.mockResolvedValue(course);
      Student.find.mockReturnValueOnce(query([]));
      let res = responseMock();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ students: [], teams: [], message: 'No students found in this course' }));

      Student.find.mockReturnValueOnce(query([object({ _id: 's1', name: 'Ada' })]));
      Evaluation.find.mockResolvedValue([]);
      res = responseMock();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ students: [expect.objectContaining({ meanScore: 0, letterGrade: 'No evaluations' })], message: 'No evaluations found for this course' }));
    });

    test('builds mean report with flags, team statistics, and grade distribution', async () => {
      const students = [
        object({ _id: 's1', student_id: 'A', name: 'Ada', email: 'a@x', team_id: { toString: () => teamId, team_name: 'Alpha' } }),
        object({ _id: 's2', student_id: 'B', name: 'Lin', team_id: null })
      ];
      const evaluations = [
        object({ student_id: 's1', ratings: { professionalism: 5, communication: 5, work_ethic: 5, content_knowledge_skills: 5, overall_contribution: 5, participation: 4 }, overall_feedback: 'Excellent work' }),
        object({ student_id: 's1', ratings: { professionalism: 3 }, overall_feedback: 'unprofessional conflict' })
      ];
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query(students));
      Evaluation.find.mockResolvedValue(evaluations);
      Team.find.mockResolvedValue([object({ _id: { toString: () => teamId }, team_name: 'Alpha' })]);
      const res = responseMock();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());
      const report = res.json.mock.calls[0][0];
      expect(report.summary).toEqual(expect.objectContaining({ totalStudents: 2, studentsWithEvaluations: 1, gradeDistribution: expect.objectContaining({ A: 1 }) }));
      expect(report.students[0]).toEqual(expect.objectContaining({ originalScore: 94.29, finalScore: 94.29, letterGrade: 'A', evaluationsReceived: 2 }));
      expect(report.students[0].evaluationDetails[0].aiFlags).toEqual({ allFive: true, concerning: false, flagged: true });
      expect(report.teams[0]).toEqual(expect.objectContaining({ averageScore: 94.29, letterGrade: 'A' }));
    });

    test('ignores evaluations with missing IDs or ratings and handles ID comparison errors', async () => {
      const students = [object({ _id: 's1', name: 'Ada' })];
      const throwingId = { toString: () => { throw new Error('bad id'); } };
      const evaluations = [
        object({ _id: 'e1', student_id: null, ratings: { professionalism: 5 } }),
        object({ _id: 'e2', student_id: throwingId, ratings: { professionalism: 5 } }),
        object({ _id: 'e3', student_id: 's1', overall_feedback: '' })
      ];
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query(students));
      Evaluation.find.mockResolvedValue(evaluations);
      Team.find.mockResolvedValue([]);

      const res = responseMock();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        students: [expect.objectContaining({ originalScore: 0, evaluationsReceived: 1 })]
      }));
    });

    test('applies curved grading and forwards report errors', async () => {
      const students = [object({ _id: 's1', name: 'Ada' }), object({ _id: 's2', name: 'Lin' })];
      const evaluations = [
        object({ student_id: 's1', ratings: { professionalism: 2 }, overall_feedback: '' }),
        object({ student_id: 's2', ratings: { professionalism: 5 }, overall_feedback: '' })
      ];
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query(students));
      Evaluation.find.mockResolvedValue(evaluations);
      Team.find.mockResolvedValue([]);
      const res = responseMock();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: { gradingMethod: 'curved', boostFactor: '0.5', protectionThreshold: '80' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ gradingSettings: expect.objectContaining({ boostFactor: 0.5, protectionThreshold: 80, classStats: expect.any(Object) }) }));

      const error = new Error('report failed');
      Course.findById.mockRejectedValue(error);
      const next = jest.fn();
      await reportController.getCourseReport({ params: { course_id: courseId }, query: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
      expect(error).toMatchObject({ code: 'SERVER_ERROR', status: 500 });
    });

    test('covers curved no-match and empty team statistics branches', async () => {
      const students = [object({ _id: 's1', name: 'Ada' }), object({ _id: 's2', name: 'Lin' })];
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query(students));
      Evaluation.find.mockResolvedValue([
        object({ student_id: 's1', ratings: { professionalism: 2 }, overall_feedback: '' }),
        object({ student_id: 's2', ratings: { professionalism: 2 }, overall_feedback: '' })
      ]);
      Team.find.mockResolvedValue([object({ _id: 'unrelated-team', team_name: 'Empty' })]);
      const res = responseMock();

      await reportController.getCourseReport({ params: { course_id: courseId }, query: { gradingMethod: 'curved' } }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ teams: [expect.objectContaining({ averageScore: 0, letterGrade: 'No evaluations' })] }));
    });
  });

  describe('downloadReport', () => {
    test('serializes report rows to CSV', async () => {
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query([object({ _id: 's1', student_id: 'A', name: 'Ada', email: 'a@x', team_id: { team_name: 'Alpha' } })]));
      Evaluation.find.mockResolvedValue([object({ student_id: 's1', ratings: { professionalism: 4 }, overall_feedback: '' })]);
      Team.find.mockResolvedValue([]);
      const res = responseMock();
      await reportController.downloadReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Student ID,Name,Email,Team'));
      expect(res.send.mock.calls[0][0]).toContain('A,Ada,a@x,Alpha,80,80,B,1,0');
    });

    test('uses the no-team CSV fallback', async () => {
      Course.findById.mockResolvedValue({ course_name: 'Course' });
      Student.find.mockReturnValueOnce(query([object({ _id: 's1', student_id: 'A', name: 'Ada', email: 'a@x', team_id: null })]));
      Evaluation.find.mockResolvedValue([object({ student_id: 's1', ratings: { professionalism: 4 }, overall_feedback: '' })]);
      Team.find.mockResolvedValue([]);
      const res = responseMock();

      await reportController.downloadReport({ params: { course_id: courseId }, query: {} }, res, jest.fn());

      expect(res.send).toHaveBeenCalledWith(expect.stringContaining('A,Ada,a@x,No Team,80,80,B,1,0'));
    });

    test('forwards report generation errors', async () => {
      Course.findById.mockRejectedValue(new Error('download failed'));
      const next = jest.fn();
      await reportController.downloadReport({ params: { course_id: courseId }, query: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'download failed' }));
    });

    test('forwards errors thrown while generating the download report', async () => {
      const error = new Error('download generation failed');
      const spy = jest.spyOn(reportController, 'getCourseReport').mockRejectedValue(error);
      const next = jest.fn();

      await reportController.downloadReport({ params: { course_id: courseId }, query: {} }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'download generation failed', code: 'SERVER_ERROR', status: 500 }));
      spy.mockRestore();
    });
  });

  describe('individual and team reports', () => {
    test('gets student report through validation, not-found, and success paths', async () => {
      let next = jest.fn();
      await reportController.getStudentReport({ params: { course_id: 'bad', student_id: 'A' } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
      Student.findOne.mockReturnValue(query(null));
      next = jest.fn();
      await reportController.getStudentReport({ params: { course_id: courseId, student_id: 'A' } }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Student not found.');

      const student = object({ _id: 's1', student_id: 'A' });
      Student.findOne.mockReturnValue(query(student));
      Evaluation.find.mockResolvedValueOnce([{ ratings: { professionalism: 4 } }]).mockResolvedValueOnce([{ _id: 'e2' }]);
      const res = responseMock();
      await reportController.getStudentReport({ params: { course_id: courseId, student_id: 'A' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meanScore: 80, letterGrade: 'B', evaluationsReceived: 1, evaluationsGiven: 1 }));
    });

    test('gets team report through validation, not-found, and success paths', async () => {
      let next = jest.fn();
      await reportController.getTeamReport({ params: { course_id: 'bad', team_id: teamId } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID or team ID.');
      Team.findById.mockResolvedValue(null);
      next = jest.fn();
      await reportController.getTeamReport({ params: { course_id: courseId, team_id: teamId } }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Team not found.');

      const member = object({ _id: 's1', name: 'Ada' });
      Team.findById.mockResolvedValue({ _id: teamId });
      Student.find.mockResolvedValue([member]);
      Evaluation.find.mockResolvedValue([{ student_id: 's1', ratings: { participation: 4 } }]);
      const res = responseMock();
      await reportController.getTeamReport({ params: { course_id: courseId, team_id: teamId } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ teamAverage: 100, teamLetterGrade: 'A', members: [expect.objectContaining({ meanScore: 100 })] }));
    });

    test('uses no-evaluation grades for students and teams without scores', async () => {
      const student = object({ _id: 's1', student_id: 'A', name: 'Ada' });
      Student.findOne.mockReturnValue(query(student));
      Evaluation.find.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      let res = responseMock();
      await reportController.getStudentReport({ params: { course_id: courseId, student_id: 'A' } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ meanScore: 0, letterGrade: 'No evaluations' }));

      Team.findById.mockResolvedValue({ _id: teamId, team_name: 'Alpha' });
      Student.find.mockResolvedValue([student]);
      Evaluation.find.mockResolvedValue([]);
      res = responseMock();
      await reportController.getTeamReport({ params: { course_id: courseId, team_id: teamId } }, res, jest.fn());
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ teamAverage: 0, teamLetterGrade: 'No evaluations', members: [expect.objectContaining({ letterGrade: 'No evaluations' })] }));
    });

    test('forwards individual and team lookup errors and aliases generateReport', async () => {
      const studentError = new Error('student report failed');
      Student.findOne.mockReturnValue({ populate: jest.fn().mockRejectedValue(studentError) });
      let next = jest.fn();
      await reportController.getStudentReport({ params: { course_id: courseId, student_id: 'A' } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(studentError);
      const teamError = new Error('team report failed');
      Team.findById.mockRejectedValue(teamError);
      next = jest.fn();
      await reportController.getTeamReport({ params: { course_id: courseId, team_id: teamId } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(teamError);
      const spy = jest.spyOn(reportController, 'getCourseReport').mockResolvedValue('done');
      await expect(reportController.generateReport({ params: {}, query: {} }, {}, jest.fn())).resolves.toBe('done');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});