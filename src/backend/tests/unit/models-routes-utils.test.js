const mockTransport = { sendMail: jest.fn() };
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransport)
}));

jest.mock('../../middleware/auth', () => ({ authenticateToken: jest.fn((req, res, next) => next()) }));
jest.mock('../../controllers/courseController', () => ({
  listCourses: jest.fn(), createCourse: jest.fn(), migrateCourses: jest.fn(), getCourse: jest.fn(), updateCourse: jest.fn(), deleteCourse: jest.fn()
}));
jest.mock('../../controllers/studentController', () => ({
  uploadRoster: jest.fn(), listStudents: jest.fn(), addStudent: jest.fn(), updateStudent: jest.fn(), deleteStudent: jest.fn(), bulkDeleteStudents: jest.fn(), deleteAllStudents: jest.fn(), resetEvaluationState: jest.fn()
}));
jest.mock('../../controllers/teamController', () => ({
  listTeams: jest.fn(), createTeams: jest.fn(), updateTeam: jest.fn(), deleteTeam: jest.fn(), clearAllTeams: jest.fn(), autoAssignTeams: jest.fn(), addStudentToTeam: jest.fn(), removeStudentFromTeam: jest.fn()
}));
jest.mock('../../controllers/evaluationController', () => ({
  sendEvaluations: jest.fn(), sendTeamEvaluations: jest.fn(), evaluationStatus: jest.fn(), remindEvaluations: jest.fn()
}));
jest.mock('../../controllers/reportController', () => ({
  getCourseReport: jest.fn(), downloadReport: jest.fn(), getStudentReport: jest.fn(), getTeamReport: jest.fn(), generateReport: jest.fn()
}));

const nodemailer = require('nodemailer');
const Course = require('../../models/Course');
const Report = require('../../models/Report');
const coursesRouter = require('../../routes/courses');
const emailUtils = require('../../utils/emailUtils');

function routeMiddleware(path) {
  const layer = coursesRouter.stack.find(item => item.route && item.route.path === path);
  return layer.route.stack[0].handle;
}

describe('model defaults, route middleware, and email utility paths', () => {
  beforeEach(() => jest.clearAllMocks());

  test('applies Course and Report schema defaults', () => {
    const course = new Course({
      course_name: 'Software', course_number: 'CS 4850', course_section: '01', semester: 'Fall', professor_id: '507f1f77bcf86cd799439011'
    });
    const report = new Report({ course_id: '507f1f77bcf86cd799439011' });

    expect(course.student_count).toBe(0);
    expect(course.team_count).toBe(0);
    expect(course.course_status).toBe('Active');
    expect(course.evaluation_status.toObject()).toEqual({ total: 0, completed: 0, pending: 0 });
    expect(course.created_at).toBeInstanceOf(Date);
    expect(report.generated_at).toBeInstanceOf(Date);
    expect(report.team_reports).toEqual([]);
    expect(report.student_reports).toEqual([]);
  });

  test('runs the roster route logging callback', () => {
    const next = jest.fn();
    routeMiddleware('/:course_id/roster')({ params: { course_id: 'course-1' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('sends evaluation invitation with and without a deadline', async () => {
    mockTransport.sendMail.mockResolvedValue({ messageId: 'invite-1' });
    const student = { name: 'Ada', email: 'ada@example.com' };
    const course = { course_name: 'Software', course_number: 'CS 4850', course_section: '01', semester: 'Fall' };

    await expect(emailUtils.sendEvaluationInvitation(student, course, 'token', 'https://app.example', new Date('2026-09-15')))
      .resolves.toEqual({ success: true, messageId: 'invite-1' });
    await expect(emailUtils.sendEvaluationInvitation(student, course, 'token', 'https://app.example'))
      .resolves.toEqual({ success: true, messageId: 'invite-1' });
  });

  test('returns email invitation, reminder, and reset failures', async () => {
    mockTransport.sendMail.mockRejectedValue(new Error('SMTP unavailable'));
    const student = { name: 'Ada', email: 'ada@example.com' };
    const course = { course_name: 'Software', course_number: 'CS 4850', course_section: '01', semester: 'Fall' };

    await expect(emailUtils.sendEvaluationInvitation(student, course, 'token')).resolves.toEqual({ success: false, error: 'SMTP unavailable' });
    await expect(emailUtils.sendEvaluationReminder(student, course, 'token')).resolves.toEqual({ success: false, error: 'SMTP unavailable' });
    await expect(emailUtils.sendPasswordResetEmail('ada@example.com', 'reset-token')).resolves.toEqual({ success: false, error: 'SMTP unavailable' });
  });

  test('sends reminder and password reset emails successfully', async () => {
    mockTransport.sendMail.mockResolvedValue({ messageId: 'mail-1' });
    const student = { name: 'Ada', email: 'ada@example.com' };
    const course = { course_name: 'Software' };

    await expect(emailUtils.sendEvaluationReminder(student, course, 'token')).resolves.toEqual({ success: true, messageId: 'mail-1' });
    await expect(emailUtils.sendPasswordResetEmail('ada@example.com', 'reset-token')).resolves.toEqual({ success: true, messageId: 'mail-1' });
  });

  test('loads SMTP service and host/port configuration branches', () => {
    const originalService = process.env.SMTP_SERVICE;
    const originalHost = process.env.SMTP_HOST;
    const originalPort = process.env.SMTP_PORT;

    process.env.SMTP_SERVICE = 'gmail';
    process.env.SMTP_PORT = '465';
    jest.isolateModules(() => {
      require('../../utils/emailUtils');
    });
    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({
      service: 'gmail', host: undefined, port: undefined, secure: true
    }));

    delete process.env.SMTP_SERVICE;
    delete process.env.SMTP_HOST;
    process.env.SMTP_PORT = '2525';
    jest.isolateModules(() => {
      require('../../utils/emailUtils');
    });
    expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({
      service: undefined, host: 'localhost', port: 2525, secure: false
    }));

    if (originalService === undefined) delete process.env.SMTP_SERVICE;
    else process.env.SMTP_SERVICE = originalService;
    if (originalHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = originalHost;
    if (originalPort === undefined) delete process.env.SMTP_PORT;
    else process.env.SMTP_PORT = originalPort;
  });
});
