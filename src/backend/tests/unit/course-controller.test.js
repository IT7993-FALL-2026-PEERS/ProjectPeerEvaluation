/**
 * controllers/courseController.js: listCourses, createCourse, getCourse,
 * updateCourse, deleteCourse, migrateCourses.
 *
 * Mocks the Course, Team, and Student models. migrateCourses in particular
 * gets heavy edge-case coverage (whitespace-only course_code, single- vs
 * multi-token codes, already-migrated records) since it parses legacy
 * `course_code` strings into `course_number`/`course_section` and has bitten
 * us with off-by-one branch coverage gaps before.
 */
jest.mock('../../models/Course', () => {
  const Course = jest.fn(function Course(data) {
    Object.assign(this, data);
    this._id = this._id || 'new-course';
    this.save = jest.fn().mockResolvedValue(this);
  });
  Course.find = jest.fn();
  Course.findOne = jest.fn();
  Course.findById = jest.fn();
  Course.findByIdAndUpdate = jest.fn();
  return Course;
});

jest.mock('../../models/Team', () => ({
  aggregate: jest.fn()
}));

jest.mock('../../models/Student', () => ({
  countDocuments: jest.fn()
}));

const Course = require('../../models/Course');
const Team = require('../../models/Team');
const Student = require('../../models/Student');
const courseController = require('../../controllers/courseController');

const validId = '507f1f77bcf86cd799439011';

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

function expectError(next, code, status, message) {
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code, status, message }));
}

describe('course controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('listCourses', () => {
    test('returns filtered courses with migrated fields and team counts', async () => {
      const course = {
        _id: validId,
        course_code: 'CS 4850 01',
        toObject: () => ({ _id: validId, course_code: 'CS 4850 01' })
      };
      Course.find.mockResolvedValue([course]);
      Team.aggregate.mockResolvedValue([{ _id: validId, count: 3 }]);
      const res = responseMock();

      await courseController.listCourses({
        user: { id: 'prof-1' },
        query: { course_name: 'software', course_number: '4850', course_section: '01', semester: 'Fall' }
      }, res, jest.fn());

      expect(Course.find).toHaveBeenCalledWith(expect.objectContaining({
        professor_id: 'prof-1',
        course_name: { $regex: 'software', $options: 'i' },
        course_section: { $regex: '01', $options: 'i' },
        semester: { $regex: 'Fall', $options: 'i' },
        course_status: 'Active'
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({
        course_number: 'CS',
        course_section: '4850 01',
        team_count: 3
      })]);
    });

    test('forwards database errors', async () => {
      const error = new Error('find failed');
      Course.find.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.listCourses({ user: { id: 'prof-1' }, query: {} }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
      expect(error).toMatchObject({ code: 'SERVER_ERROR', status: 500 });
    });

    test('handles default filters, existing fields, and courses without team counts', async () => {
      const course = {
        _id: validId,
        course_number: '4850',
        course_section: '01',
        toObject: () => ({ _id: validId, course_number: '4850', course_section: '01' })
      };
      Course.find.mockResolvedValue([course]);
      Team.aggregate.mockResolvedValue([]);
      const res = responseMock();

      await courseController.listCourses({ user: { id: 'prof-1' }, query: {} }, res, jest.fn());

      expect(Course.find).toHaveBeenCalledWith({ professor_id: 'prof-1', course_status: 'Active' });
      expect(res.json).toHaveBeenCalledWith([{ _id: validId, course_number: '4850', course_section: '01', team_count: 0 }]);
    });

    test('covers missing filters and partial legacy course fields', async () => {
      const course = {
        _id: validId,
        course_code: 'CS 4850',
        course_number: '4850',
        toObject: () => ({ _id: validId, course_code: 'CS 4850', course_number: '4850' })
      };
      Course.find.mockResolvedValue([course]);
      Team.aggregate.mockResolvedValue([]);
      const res = responseMock();

      await courseController.listCourses({ user: { id: 'prof-1' }, query: { course_status: '' } }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ course_section: '4850', team_count: 0 })]);
    });

    test('falls back to the raw course_code when it has no leading token', async () => {
      const course = {
        _id: validId,
        course_code: ' CS4850',
        toObject: () => ({ _id: validId, course_code: ' CS4850' })
      };
      Course.find.mockResolvedValue([course]);
      Team.aggregate.mockResolvedValue([]);
      const res = responseMock();

      await courseController.listCourses({ user: { id: 'prof-1' }, query: {} }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ course_number: ' CS4850' })]);
    });

    test('leaves an existing course_section untouched when migrating course_number', async () => {
      const course = {
        _id: validId,
        course_code: 'CS 4850',
        course_section: '01',
        toObject: () => ({ _id: validId, course_code: 'CS 4850', course_section: '01' })
      };
      Course.find.mockResolvedValue([course]);
      Team.aggregate.mockResolvedValue([]);
      const res = responseMock();

      await courseController.listCourses({ user: { id: 'prof-1' }, query: {} }, res, jest.fn());

      expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ course_number: 'CS', course_section: '01' })]);
    });
  });

  describe('createCourse', () => {
    test('validates required fields', async () => {
      const next = jest.fn();

      await courseController.createCourse({ body: { course_name: 'Software' }, user: { id: 'prof-1' } }, responseMock(), next);

      expectError(next, 'VALIDATION_ERROR', 400, 'Course name, number, section, and semester are required.');
    });

    test('reactivates an inactive course', async () => {
      const course = {
        _id: validId,
        course_status: 'Inactive',
        markModified: jest.fn(),
        save: jest.fn().mockResolvedValue(undefined)
      };
      Course.findOne.mockResolvedValue(course);
      const res = responseMock();

      await courseController.createCourse({
        body: { course_name: 'Software', course_number: '4850', course_section: '01', semester: 'Fall' },
        user: { id: 'prof-1' }
      }, res, jest.fn());

      expect(course.course_status).toBe('Active');
      expect(course.save).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ id: validId, message: 'Course reactivated.' });
    });

    test('creates a new course', async () => {
      Course.findOne.mockResolvedValue(null);
      const res = responseMock();

      await courseController.createCourse({
        body: { course_name: 'Software', course_number: '4850', course_section: '01', semester: 'Fall' },
        user: { id: 'prof-1' }
      }, res, jest.fn());

      expect(Course).toHaveBeenCalledWith(expect.objectContaining({ professor_id: 'prof-1', course_status: 'Active' }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 'new-course', message: 'Course created.' });
    });

    test('forwards save errors', async () => {
      const error = new Error('save failed');
      Course.findOne.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.createCourse({ body: { course_name: 'Software', course_number: '4850', course_section: '01', semester: 'Fall' }, user: { id: 'prof-1' } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('getCourse', () => {
    test('rejects an invalid course ID', async () => {
      const next = jest.fn();

      await courseController.getCourse({ params: { course_id: 'bad-id' } }, responseMock(), next);

      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    });

    test('returns a course with its current student count', async () => {
      Course.findById.mockResolvedValue({ _id: validId, toObject: () => ({ _id: validId, course_name: 'Software' }) });
      Student.countDocuments.mockResolvedValue(4);
      const res = responseMock();

      await courseController.getCourse({ params: { course_id: validId } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ _id: validId, course_name: 'Software', student_count: 4 });
    });

    test('returns not found when the course is missing', async () => {
      Course.findById.mockResolvedValue(null);
      const next = jest.fn();

      await courseController.getCourse({ params: { course_id: validId } }, responseMock(), next);

      expectError(next, 'NOT_FOUND', 404, 'Course not found.');
    });

    test('forwards student count errors', async () => {
      Course.findById.mockResolvedValue({ _id: validId });
      const error = new Error('count failed');
      Student.countDocuments.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.getCourse({ params: { course_id: validId } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateCourse', () => {
    test('updates a course', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({ _id: validId });
      const res = responseMock();

      await courseController.updateCourse({ params: { course_id: validId }, body: { semester: 'Spring' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, { semester: 'Spring' }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Course updated.' });
    });

    test.each([
      ['bad-id', 'VALIDATION_ERROR', 400, 'Invalid course ID.'],
      [validId, 'NOT_FOUND', 404, 'Course not found.']
    ])('handles %s course', async (courseId, code, status, message) => {
      if (courseId === validId) Course.findByIdAndUpdate.mockResolvedValue(null);
      const next = jest.fn();

      await courseController.updateCourse({ params: { course_id: courseId }, body: {} }, responseMock(), next);

      expectError(next, code, status, message);
    });

    test('forwards update errors', async () => {
      const error = new Error('update failed');
      Course.findByIdAndUpdate.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.updateCourse({ params: { course_id: validId }, body: {} }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteCourse', () => {
    test('marks a course inactive', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({ course_name: 'Software' });
      const res = responseMock();

      await courseController.deleteCourse({ params: { course_id: validId } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), { course_status: 'Inactive' }, { new: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Course deleted successfully.' });
    });

    test('handles invalid and missing courses', async () => {
      const invalidNext = jest.fn();
      await courseController.deleteCourse({ params: { course_id: 'bad-id' } }, responseMock(), invalidNext);
      expectError(invalidNext, 'VALIDATION_ERROR', 400, 'Invalid course ID.');

      Course.findByIdAndUpdate.mockResolvedValue(null);
      const missingNext = jest.fn();
      await courseController.deleteCourse({ params: { course_id: validId } }, responseMock(), missingNext);
      expectError(missingNext, 'NOT_FOUND', 404, 'Course not found.');
    });

    test('forwards delete errors', async () => {
      const error = new Error('delete failed');
      Course.findByIdAndUpdate.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.deleteCourse({ params: { course_id: validId } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('migrateCourses', () => {
    test('migrates legacy fields and reports counts', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({});
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_code: 'CS 4850',
        student_count: undefined,
        team_count: undefined
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, {
        course_number: 'CS',
        course_section: '4850',
        course_status: 'Active',
        student_count: 0,
        team_count: 0
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ migratedCount: 1, totalFound: 1 }));
    });

    test('forwards migration errors', async () => {
      const error = new Error('migration failed');
      Course.find.mockRejectedValue(error);
      const next = jest.fn();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });

    test('leaves already migrated courses unchanged', async () => {
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_number: '4850',
        course_section: '01',
        course_status: 'Active',
        student_count: 2,
        team_count: 1
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ migratedCount: 0, totalFound: 1 }));
    });

    test('uses the default section for a course code without a section', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({});
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_code: 'CS4850',
        student_count: 1,
        team_count: 1
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, {
        course_number: 'CS4850', course_section: '01', course_status: 'Active'
      });
    });

    test('uses fallback course values when migrating incomplete records', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({});
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_code: ' CS4850',
        course_status: 'Active',
        student_count: 1,
        team_count: 1
      }, {
        _id: 'other-course',
        course_name: 'Networks',
        course_number: 'CS 4860',
        student_count: undefined,
        team_count: 1
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, { course_number: 'CS4850', course_section: '01' });
      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith('other-course', { course_status: 'Active', student_count: 0 });
    });

    test('falls back to the raw course_code when it contains no usable tokens', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({});
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_code: '   ',
        student_count: 1,
        team_count: 1
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, {
        course_number: '   ', course_section: '01', course_status: 'Active'
      });
    });

    test('does not overwrite an existing course_section when only course_number is missing', async () => {
      Course.findByIdAndUpdate.mockResolvedValue({});
      Course.find.mockResolvedValue([{
        _id: validId,
        course_name: 'Software',
        course_code: 'CS4850',
        course_section: 'B',
        student_count: 1,
        team_count: 1
      }]);
      const res = responseMock();

      await courseController.migrateCourses({ user: { id: 'prof-1' } }, res, jest.fn());

      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(validId, {
        course_number: 'CS4850', course_status: 'Active'
      });
    });
  });
});