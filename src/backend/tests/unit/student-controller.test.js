jest.mock('../../models/Student', () => {
  const Student = jest.fn(function Student(data) {
    Object.assign(this, data);
    this._id = 'new-student';
    this.save = jest.fn().mockResolvedValue(this);
  });
  Student.find = jest.fn();
  Student.findOne = jest.fn();
  Student.findOneAndUpdate = jest.fn();
  Student.findOneAndDelete = jest.fn();
  Student.findByIdAndUpdate = jest.fn();
  Student.countDocuments = jest.fn();
  Student.deleteMany = jest.fn();
  Student.updateMany = jest.fn();
  Student.insertMany = jest.fn();
  return Student;
});
jest.mock('../../models/Course', () => ({ findByIdAndUpdate: jest.fn(), findById: jest.fn() }));
jest.mock('../../models/Team', () => {
  const Team = jest.fn(function Team(data) {
    Object.assign(this, data);
    this._id = 'new-team';
    this.save = jest.fn().mockResolvedValue(this);
  });
  Team.findOne = jest.fn();
  Team.findByIdAndUpdate = jest.fn();
  Team.countDocuments = jest.fn();
  Team.deleteMany = jest.fn();
  return Team;
});
jest.mock('../../models/Evaluation', () => ({ deleteMany: jest.fn() }));
jest.mock('csv-parser', () => jest.fn());
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(),
  unlinkSync: jest.fn()
}));

const Student = require('../../models/Student');
const Course = require('../../models/Course');
const Team = require('../../models/Team');
const Evaluation = require('../../models/Evaluation');
const studentController = require('../../controllers/studentController');
const csv = require('csv-parser');
const fs = require('fs');

const courseId = '507f1f77bcf86cd799439011';
const studentId = '507f1f77bcf86cd799439012';

function responseMock() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function expectError(next, code, status, message) {
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code, status, message }));
}

function rosterStream(rows, streamError) {
  const handlers = {};
  const parser = {
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
      return parser;
    })
  };
  csv.mockReturnValue(parser);
  fs.createReadStream.mockReturnValue({ pipe: jest.fn(() => parser) });
  process.nextTick(() => {
    rows.forEach(row => handlers.data(row));
    if (streamError) handlers.error(streamError);
    else handlers.end();
  });
  return parser;
}

describe('student controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    [Student.findOne, Student.find, Student.findOneAndUpdate, Student.findOneAndDelete,
      Student.countDocuments, Student.deleteMany, Student.updateMany, Student.insertMany,
      Student.findByIdAndUpdate, Evaluation.deleteMany, Team.findOne, Team.find,
      Team.findByIdAndUpdate, Team.countDocuments, Team.deleteMany, Course.findByIdAndUpdate]
      .filter(Boolean)
      .forEach((mock) => mock.mockReset());
  });

  test('addStudent validates, detects duplicates, and creates a student', async () => {
    let next = jest.fn();
    await studentController.addStudent({ params: { course_id: 'bad' }, body: {} }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    next = jest.fn();
    await studentController.addStudent({ params: { course_id: courseId }, body: {} }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Missing required fields: student_id, name, email.');
    Student.findOne.mockResolvedValue({ _id: 'existing' });
    next = jest.fn();
    await studentController.addStudent({ params: { course_id: courseId }, body: { student_id: 'A', name: 'Ada', email: 'a@x' } }, responseMock(), next);
    expectError(next, 'DUPLICATE', 409, 'Student with this ID already exists in this course.');

    Student.findOne.mockResolvedValue(null);
    Student.countDocuments.mockResolvedValue(1);
    const res = responseMock();
    await studentController.addStudent({ params: { course_id: courseId }, body: { student_id: 'A', name: 'Ada', email: 'a@x' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Student added.', student: expect.any(Object) }));
  });

  test('adds students to new and existing teams', async () => {
    Student.findOne.mockResolvedValue(null);
    Team.findOne.mockResolvedValue(null);
    Team.countDocuments.mockResolvedValue(1);
    Student.countDocuments.mockReturnValueOnce(2).mockReturnValueOnce(3);
    const createdRes = responseMock();
    await studentController.addStudent({
      params: { course_id: courseId },
      body: { student_id: 'A', name: 'Ada', email: 'a@x', group_assignment: 'Alpha' }
    }, createdRes, jest.fn());
    expect(Team).toHaveBeenCalledWith(expect.objectContaining({ team_name: 'Alpha' }));
    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('new-team', { $addToSet: { students: 'new-student' } });

    const existingTeam = { _id: 'existing-team' };
    Team.findOne.mockResolvedValue(existingTeam);
    Student.countDocuments.mockReturnValueOnce(4).mockReturnValueOnce(5);
    const existingRes = responseMock();
    await studentController.addStudent({
      params: { course_id: courseId },
      body: { student_id: 'B', name: 'Lin', email: 'b@x', group_assignment: 'Alpha' }
    }, existingRes, jest.fn());
    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('existing-team', { student_count: 4 });
  });

  test('lists students and handles validation/database errors', async () => {
    let next = jest.fn();
    await studentController.listStudents({ params: { course_id: 'bad' } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    const error = new Error('list failed');
    Student.find.mockRejectedValue(error);
    next = jest.fn();
    await studentController.listStudents({ params: { course_id: courseId } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(error);
    Student.find.mockResolvedValue([{ student_id: 'A' }]);
    const res = responseMock();
    await studentController.listStudents({ params: { course_id: courseId } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith([{ student_id: 'A' }]);
  });

  test('updates and deletes students through guard and success paths', async () => {
    let next = jest.fn();
    await studentController.updateStudent({ params: { course_id: courseId, student_id: 'bad' }, body: {} }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid student ID.');
    Student.findOne.mockResolvedValue(null);
    next = jest.fn();
    await studentController.updateStudent({ params: { course_id: courseId, student_id: studentId }, body: {} }, responseMock(), next);
    expectError(next, 'NOT_FOUND', 404, 'Student not found.');
    Student.findOne.mockResolvedValue({ _id: studentId, team_id: null });
    Student.findOneAndUpdate.mockResolvedValue({ _id: studentId });
    let res = responseMock();
    await studentController.updateStudent({ params: { course_id: courseId, student_id: studentId }, body: { name: 'Ada' } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: 'Student updated.' });

    next = jest.fn();
    await studentController.deleteStudent({ params: { course_id: courseId, student_id: 'bad' } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid student ID.');
    Student.findOneAndDelete.mockResolvedValue(null);
    next = jest.fn();
    await studentController.deleteStudent({ params: { course_id: courseId, student_id: studentId } }, responseMock(), next);
    expectError(next, 'NOT_FOUND', 404, 'Student not found.');
    Student.findOneAndDelete.mockResolvedValue({ _id: studentId, team_id: null });
    Student.countDocuments.mockResolvedValue(0);
    Course.findById.mockResolvedValue({});
    res = responseMock();
    await studentController.deleteStudent({ params: { course_id: courseId, student_id: studentId } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: 'Student deleted.' });
  });

  test('forwards CRUD persistence errors', async () => {
    const updateError = new Error('update failed');
    Student.findOne.mockRejectedValue(updateError);
    let next = jest.fn();
    await studentController.updateStudent({ params: { course_id: courseId, student_id: studentId }, body: {} }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(updateError);

    const deleteError = new Error('delete failed');
    Student.findOneAndDelete.mockRejectedValue(deleteError);
    next = jest.fn();
    await studentController.deleteStudent({ params: { course_id: courseId, student_id: studentId }, body: {} }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(deleteError);
  });

  test('handles new team creation and team-linked deletion', async () => {
    Student.findOne.mockResolvedValue({ _id: studentId, team_id: 'old-team' });
    Team.findOne.mockResolvedValue(null);
    Team.countDocuments.mockResolvedValue(2);
    Student.findOneAndUpdate.mockResolvedValue({ _id: studentId });
    Student.countDocuments.mockReturnValue(1);
    let res = responseMock();
    await studentController.updateStudent({
      params: { course_id: courseId, student_id: studentId },
      body: { group_assignment: 'Created Team' }
    }, res, jest.fn());
    expect(Team).toHaveBeenCalledWith(expect.objectContaining({ team_name: 'Created Team' }));

    Student.findOneAndDelete.mockResolvedValue({ _id: studentId, team_id: 'old-team' });
    Student.countDocuments.mockResolvedValue(0);
    Course.findById.mockResolvedValue({});
    res = responseMock();
    await studentController.deleteStudent({ params: { course_id: courseId, student_id: studentId } }, res, jest.fn());
    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('old-team', { $pull: { students: studentId } });
  });

  test('forwards add and update team setup errors', async () => {
    Student.findOne.mockResolvedValue(null);
    Team.findOne.mockRejectedValue(new Error('team lookup failed'));
    let next = jest.fn();
    await studentController.addStudent({ params: { course_id: courseId }, body: { student_id: 'A', name: 'Ada', email: 'a@x', group_assignment: 'Alpha' } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'team lookup failed' }));

    Student.findOne.mockResolvedValue({ _id: studentId, team_id: null });
    Team.findOne.mockRejectedValue(new Error('new team lookup failed'));
    next = jest.fn();
    await studentController.updateStudent({ params: { course_id: courseId, student_id: studentId }, body: { group_assignment: 'Alpha' } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'new team lookup failed' }));
  });

  test('moves a student between teams and clears a team assignment', async () => {
    const oldTeam = { _id: 'old-team' };
    const newTeam = { _id: 'new-team', save: jest.fn() };
    Student.findOne.mockResolvedValue({ _id: studentId, team_id: oldTeam._id });
    Team.findOne.mockResolvedValue(newTeam);
    Student.findOneAndUpdate.mockResolvedValue({ _id: studentId });
    Student.countDocuments.mockReturnValue(1);
    let res = responseMock();
    await studentController.updateStudent({
      params: { course_id: courseId, student_id: studentId },
      body: { group_assignment: 'New Team' }
    }, res, jest.fn());
    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith(oldTeam._id, { $pull: { students: studentId } });
    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith(newTeam._id, { $addToSet: { students: studentId } });

    Student.findOne.mockResolvedValue({ _id: studentId, team_id: newTeam._id });
    Student.findOneAndUpdate.mockResolvedValue({ _id: studentId });
    await studentController.updateStudent({
      params: { course_id: courseId, student_id: studentId },
      body: { group_assignment: '' }
    }, responseMock(), jest.fn());
    expect(Student.findOneAndUpdate).toHaveBeenLastCalledWith(
      { _id: studentId, course_id: courseId },
      { group_assignment: null, team_id: null },
      { new: true }
    );
  });

  test('bulk deletes students and validates the request', async () => {
    let next = jest.fn();
    await studentController.bulkDeleteStudents({ params: { course_id: courseId }, body: { student_ids: [] } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'student_ids array required.');
    Student.find.mockResolvedValue([]);
    Student.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Student.countDocuments.mockResolvedValue(0);
    Course.findById.mockResolvedValue({});
    const res = responseMock();
    await studentController.bulkDeleteStudents({ params: { course_id: courseId }, body: { student_ids: [studentId] } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: 'Students deleted.', deleted_count: 2 });
  });

  test('bulk deletes students and updates affected teams', async () => {
    Student.find.mockResolvedValue([{ team_id: { toString: () => 'team-1' } }]);
    Student.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Student.countDocuments.mockResolvedValue(0);
    Course.findById.mockResolvedValue({});
    const res = responseMock();

    await studentController.bulkDeleteStudents({ params: { course_id: courseId }, body: { student_ids: [studentId] } }, res, jest.fn());

    expect(Team.findByIdAndUpdate).toHaveBeenCalledWith('team-1', { $pull: { students: { $in: [studentId] } } });
    expect(res.json).toHaveBeenCalledWith({ message: 'Students deleted.', deleted_count: 1 });
  });

  test('bulk delete ignores students without teams', async () => {
    Student.find.mockResolvedValue([{ _id: studentId, team_id: null }]);
    Student.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Student.countDocuments.mockResolvedValue(0);
    Course.findById.mockResolvedValue({});
    const res = responseMock();

    await studentController.bulkDeleteStudents({ params: { course_id: courseId }, body: { student_ids: [studentId] } }, res, jest.fn());

    expect(Team.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ message: 'Students deleted.', deleted_count: 1 });
  });

  test('forwards bulk-delete lookup errors', async () => {
    const error = new Error('bulk lookup failed');
    Student.find.mockRejectedValue(error);
    const next = jest.fn();

    await studentController.bulkDeleteStudents({ params: { course_id: courseId }, body: { student_ids: [studentId] } }, responseMock(), next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('forwards roster stream setup and delete-all errors', async () => {
    const streamError = new Error('stream setup failed');
    fs.createReadStream.mockImplementation(() => { throw streamError; });
    let next = jest.fn();
    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/fail.csv' } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'stream setup failed', code: 'SERVER_ERROR', status: 500 }));

    Student.countDocuments.mockRejectedValue(new Error('delete all failed'));
    next = jest.fn();
    await studentController.deleteAllStudents({ params: { course_id: courseId } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'delete all failed', code: 'SERVER_ERROR', status: 500 }));
  });

  test('uploadRoster validates files and clears all students safely', async () => {
    let next = jest.fn();
    await studentController.uploadRoster({ params: { course_id: courseId } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'No file uploaded.');
    next = jest.fn();
    await studentController.deleteAllStudents({ params: { course_id: 'bad' } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    Student.countDocuments.mockResolvedValue(0);
    const res = responseMock();
    await studentController.deleteAllStudents({ params: { course_id: courseId } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: 'No students to delete.', deleted_count: 0 });
  });

  test('uploadRoster parses rows, creates teams, links students, and resets counts', async () => {
    const rows = [
      { student_id: ' A ', name: ' Ada ', email: ' ada@x ', team_name: ' Alpha ' },
      { student_id: 'B', name: 'Lin', email: 'lin@x', group_assignment: 'Beta' },
      { student_id: 'C', name: 'No Team', email: 'none@x', group: '' },
      { student_id: 'missing', name: 'Missing Email' }
    ];
    Student.updateMany.mockResolvedValue({});
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Student.find.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce([
        { _id: 'student-a', student_id: 'A' },
        { _id: 'student-b', student_id: 'B' },
        { _id: 'student-c', student_id: 'C' }
      ]);
    Team.findOne.mockResolvedValue(null);
    Team.findByIdAndUpdate.mockResolvedValue({});
    Team.countDocuments.mockResolvedValue(2);
    Student.insertMany.mockResolvedValue([{ student_id: 'A' }, { student_id: 'B' }, { student_id: 'C' }]);
    Student.findByIdAndUpdate.mockResolvedValue({});
    Student.countDocuments.mockResolvedValue(3);
    Course.findByIdAndUpdate.mockResolvedValue({});
    const res = responseMock();

    rosterStream(rows);
    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/roster.csv' } }, res, jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(Student.insertMany).toHaveBeenCalledWith([
      { student_id: 'A', name: 'Ada', email: 'ada@x', group_assignment: 'Alpha', course_id: courseId },
      { student_id: 'B', name: 'Lin', email: 'lin@x', group_assignment: 'Beta', course_id: courseId },
      { student_id: 'C', name: 'No Team', email: 'none@x', group_assignment: null, course_id: courseId }
    ], { ordered: false });
    expect(Team).toHaveBeenCalledTimes(2);
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/roster.csv');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      students: ['A', 'B', 'C'], teams_created: 2, evaluations_cleared: 2,
      errors: ['Missing required fields in row: {"student_id":"missing","name":"Missing Email"}']
    }));
  });

  test('uploadRoster reports when no valid new rows remain', async () => {
    Student.updateMany.mockResolvedValue({});
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Student.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    const res = responseMock();
    rosterStream([{ student_id: 'A', name: 'Ada' }]);

    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/duplicate.csv' } }, res, jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'No new students added.', students: [],
      errors: expect.arrayContaining(['All students in the file already exist in this course.'])
    }));
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/duplicate.csv');
  });

  test('uploadRoster returns a partial-insert error response', async () => {
    Student.updateMany.mockResolvedValue({});
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Student.find.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) });
    Team.findOne.mockResolvedValue(null);
    Student.insertMany.mockRejectedValue(new Error('duplicate key'));
    Student.find.mockResolvedValueOnce([{ student_id: 'A' }]);
    const res = responseMock();
    rosterStream([{ student_id: 'A', name: 'Ada', email: 'a@x' }]);

    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/broken.csv' } }, res, jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Roster uploaded with some errors.',
      errors: ['Some students could not be added (possible duplicates or DB error).']
    }));
  });

  test('reports team creation and linking errors during upload', async () => {
    Student.updateMany.mockResolvedValue({});
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Student.find.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) })
      .mockResolvedValueOnce([{ _id: 'student-a', student_id: 'A' }]);
    Team.findOne.mockRejectedValue(new Error('team create failed'));
    Student.insertMany.mockResolvedValue([{ student_id: 'A' }]);
    Student.countDocuments.mockResolvedValue(1);
    Team.countDocuments.mockResolvedValue(0);
    Course.findByIdAndUpdate.mockResolvedValue({});
    const res = responseMock();
    rosterStream([{ student_id: 'A', name: 'Ada', email: 'a@x', team_name: 'Alpha' }]);

    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/team-error.csv' } }, res, jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ errors: expect.arrayContaining(['Failed to create team: Alpha']) }));
  });

  test('handles existing teams, link errors, and duplicate upload reporting', async () => {
    Student.updateMany.mockResolvedValue({});
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Student.find.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([{ student_id: 'A' }]) })
      .mockResolvedValueOnce([{ _id: 'student-a', student_id: 'A' }]);
    Team.findOne.mockResolvedValue({ _id: 'existing-team' });
    Student.findByIdAndUpdate.mockRejectedValue(new Error('link failed'));
    Student.countDocuments.mockResolvedValue(1);
    Team.countDocuments.mockResolvedValue(1);
    Course.findByIdAndUpdate.mockResolvedValue({});
    const res = responseMock();
    rosterStream([{ student_id: 'A', name: 'Ada', email: 'a@x', team_name: 'Alpha' }]);

    await studentController.uploadRoster({ params: { course_id: courseId }, file: { path: '/tmp/existing-team.csv' } }, res, jest.fn());
    await new Promise(resolve => setImmediate(resolve));

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      students_updated: ['A'],
      errors: expect.arrayContaining(['Failed to link student A to team', 'Some students were not added because they already exist in this course.'])
    }));
  });

  test('deletes all data and resets evaluation state', async () => {
    Student.countDocuments.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    Student.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 3 });
    Team.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Student.updateMany.mockResolvedValue({ modifiedCount: 2 });
    Course.findById.mockResolvedValue({});
    Course.findByIdAndUpdate.mockResolvedValue({});
    let res = responseMock();
    await studentController.deleteAllStudents({ params: { course_id: courseId } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ deleted_students: 2, deleted_evaluations: 3, deleted_teams: 1 }));
    Evaluation.deleteMany.mockResolvedValue({ deletedCount: 4 });
    res = responseMock();
    await studentController.resetEvaluationState({ params: { course_id: courseId } }, res, jest.fn());
    expect(res.json).toHaveBeenCalledWith({ message: 'Evaluation state reset successfully.', tokens_cleared: 2, evaluations_deleted: 4 });
  });

  test('resetEvaluationState validates IDs and forwards errors', async () => {
    let next = jest.fn();
    await studentController.resetEvaluationState({ params: { course_id: 'bad' } }, responseMock(), next);
    expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    Student.updateMany.mockRejectedValue(new Error('reset failed'));
    next = jest.fn();
    await studentController.resetEvaluationState({ params: { course_id: courseId } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'reset failed', code: 'SERVER_ERROR', status: 500 }));
  });

  test('forwards delete-all and reset course update errors', async () => {
    Student.countDocuments.mockResolvedValue(1);
    Student.deleteMany.mockRejectedValue(new Error('delete students failed'));
    let next = jest.fn();
    await studentController.deleteAllStudents({ params: { course_id: courseId } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'delete students failed' }));

    Student.deleteMany.mockResolvedValue({ deletedCount: 1 });
    Student.updateMany.mockResolvedValue({ modifiedCount: 1 });
    const EvaluationModel = require('../../models/Evaluation');
    EvaluationModel.deleteMany.mockRejectedValue(new Error('reset evaluation failed'));
    next = jest.fn();
    await studentController.resetEvaluationState({ params: { course_id: courseId } }, responseMock(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'reset evaluation failed' }));
  });
});