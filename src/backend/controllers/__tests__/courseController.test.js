jest.mock('../../models/Course', () => {
  const mockSave = jest.fn().mockResolvedValue();
  const instances = [];
  function Course(data) {
    Object.assign(this, data);
    this.save = mockSave;
    instances.push(this);
  }
  Course.findOne = jest.fn();
  Course.__mockSave = mockSave;
  Course.__instances = instances;
  return Course;
});

const Course = require('../../models/Course');
const courseController = require('../courseController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
  Course.__instances.length = 0;
});

describe('courseController.createCourse', () => {
  const baseBody = {
    course_name: 'Capstone',
    course_number: 'CIS 501',
    course_section: 'A',
    semester: 'Fall 2026',
  };

  it('rejects when a required field is missing', async () => {
    const req = { body: { ...baseBody, semester: undefined }, user: { id: 'prof1' } };
    const res = mockRes();
    const next = jest.fn();

    await courseController.createCourse(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(Course.findOne).not.toHaveBeenCalled();
  });

  it('reactivates a matching inactive course instead of creating a duplicate', async () => {
    const existingSave = jest.fn().mockResolvedValue();
    const existingCourse = {
      _id: 'course123',
      course_status: 'Inactive',
      markModified: jest.fn(),
      save: existingSave,
    };
    Course.findOne.mockResolvedValue(existingCourse);
    const req = { body: baseBody, user: { id: 'prof1' } };
    const res = mockRes();
    const next = jest.fn();

    await courseController.createCourse(req, res, next);

    expect(existingCourse.course_status).toBe('Active');
    expect(existingSave).toHaveBeenCalledTimes(1);
    expect(Course.__instances).toHaveLength(0); // no new course constructed
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'course123', message: 'Course reactivated.' })
    );
  });

  it('creates a new active course when no inactive match exists', async () => {
    Course.findOne.mockResolvedValue(null);
    const req = { body: baseBody, user: { id: 'prof1' } };
    const res = mockRes();
    const next = jest.fn();

    await courseController.createCourse(req, res, next);

    expect(Course.__instances).toHaveLength(1);
    const created = Course.__instances[0];
    expect(created.course_status).toBe('Active');
    expect(created.professor_id).toBe('prof1');
    expect(Course.__mockSave).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Course created.' })
    );
  });

  it('forwards database errors to next()', async () => {
    Course.findOne.mockRejectedValue(new Error('connection lost'));
    const req = { body: baseBody, user: { id: 'prof1' } };
    const res = mockRes();
    const next = jest.fn();

    await courseController.createCourse(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.message).toBe('connection lost');
    expect(err.status).toBe(500);
  });
});
