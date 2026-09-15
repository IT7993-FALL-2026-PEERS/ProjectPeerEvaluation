jest.mock('../../models/Team', () => {
  const Team = jest.fn();
  Team.find = jest.fn();
  Team.findOne = jest.fn();
  Team.findOneAndUpdate = jest.fn();
  Team.findOneAndDelete = jest.fn();
  Team.insertMany = jest.fn();
  Team.countDocuments = jest.fn();
  Team.deleteMany = jest.fn();
  Team.updateMany = jest.fn();
  return Team;
});

jest.mock('../../models/Course', () => ({
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../../models/Student', () => ({
  findOne: jest.fn(),
  updateMany: jest.fn()
}));

const Team = require('../../models/Team');
const Course = require('../../models/Course');
const Student = require('../../models/Student');
const teamController = require('../../controllers/teamController');

const validId = '507f1f77bcf86cd799439011';
const secondId = '507f1f77bcf86cd799439012';

function responseMock() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
}

function expectError(next, code, status, message) {
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ code, status, message }));
}

function findChain(value) {
  return { populate: jest.fn().mockResolvedValue(value) };
}

describe('team controller', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('listTeams', () => {
    test('validates the course ID', async () => {
      const next = jest.fn();
      await teamController.listTeams({ params: { course_id: 'bad-id' } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    });

    test('returns populated teams', async () => {
      const teams = [{ _id: validId }];
      Team.find.mockReturnValue(findChain(teams));
      const res = responseMock();
      await teamController.listTeams({ params: { course_id: validId } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(teams);
    });

    test('forwards lookup errors', async () => {
      const error = new Error('lookup failed');
      Team.find.mockReturnValue({ populate: jest.fn().mockRejectedValue(error) });
      const next = jest.fn();
      await teamController.listTeams({ params: { course_id: validId } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('createTeams', () => {
    test('validates the teams array', async () => {
      const next = jest.fn();
      await teamController.createTeams({ params: { course_id: validId }, body: { teams: [] } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Teams array required.');
    });

    test('creates teams and updates the course count', async () => {
      const created = [{ _id: validId }, { _id: secondId }];
      Team.insertMany.mockResolvedValue(created);
      Team.countDocuments.mockResolvedValue(2);
      const res = responseMock();
      await teamController.createTeams({ params: { course_id: validId }, body: { teams: [{ team_name: 'A' }, { team_name: 'B' }] } }, res, jest.fn());
      expect(Team.insertMany).toHaveBeenCalledWith([
        { team_name: 'A', course_id: validId },
        { team_name: 'B', course_id: validId }
      ]);
      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), { team_count: 2 });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Teams created.', teams: [validId, secondId] });
    });

    test('forwards insert errors', async () => {
      const error = new Error('insert failed');
      Team.insertMany.mockRejectedValue(error);
      const next = jest.fn();
      await teamController.createTeams({ params: { course_id: validId }, body: { teams: [{ team_name: 'A' }] } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('updateTeam', () => {
    test('rejects an invalid team ID', async () => {
      const next = jest.fn();
      await teamController.updateTeam({ params: { course_id: validId, team_id: 'bad-id' }, body: {} }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid team ID.');
    });

    test('returns not found for a missing team', async () => {
      Team.findOne.mockResolvedValue(null);
      const next = jest.fn();
      await teamController.updateTeam({ params: { course_id: validId, team_id: secondId }, body: {} }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Team not found.');
    });

    test('updates the team and student group assignments', async () => {
      const currentTeam = { team_name: 'Old' };
      const updatedTeam = { team_name: 'New', team_status: 'Active' };
      Team.findOne.mockResolvedValue(currentTeam);
      Team.findOneAndUpdate.mockResolvedValue(updatedTeam);
      const res = responseMock();
      await teamController.updateTeam({ params: { course_id: validId, team_id: secondId }, body: { team_name: 'New' } }, res, jest.fn());
      expect(Student.updateMany).toHaveBeenCalledWith({ team_id: secondId }, { group_assignment: 'New' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Team "New" updated successfully.', team: updatedTeam });
    });

    test('updates a team without renaming students', async () => {
      const team = { team_name: 'Same', team_status: 'Inactive' };
      Team.findOne.mockResolvedValue(team);
      Team.findOneAndUpdate.mockResolvedValue(team);
      const res = responseMock();

      await teamController.updateTeam({ params: { course_id: validId, team_id: secondId }, body: { team_status: 'Inactive' } }, res, jest.fn());

      expect(Student.updateMany).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    test('forwards update errors', async () => {
      const error = new Error('update failed');
      Team.findOne.mockRejectedValue(error);
      const next = jest.fn();
      await teamController.updateTeam({ params: { course_id: validId, team_id: secondId }, body: {} }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('deleteTeam', () => {
    test.each([
      ['bad-id', [], 'VALIDATION_ERROR', 400, 'Invalid team ID.'],
      [secondId, undefined, 'NOT_FOUND', 404, 'Team not found.'],
      [secondId, [validId], 'CONSTRAINT_ERROR', 409, 'Cannot delete team with students. Please remove all students from the team first.']
    ])('handles team deletion guard %s', async (teamId, students, code, status, message) => {
      const next = jest.fn();
      if (teamId === secondId) Team.findOne.mockResolvedValue(students === undefined ? null : { students });
      await teamController.deleteTeam({ params: { course_id: validId, team_id: teamId } }, responseMock(), next);
      expectError(next, code, status, message);
    });

    test('deletes an empty team and updates the course count', async () => {
      Team.findOne.mockResolvedValue({ team_name: 'Empty', students: [] });
      Team.findOneAndDelete.mockResolvedValue({});
      Team.countDocuments.mockResolvedValue(0);
      const res = responseMock();
      await teamController.deleteTeam({ params: { course_id: validId, team_id: secondId } }, res, jest.fn());
      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), { team_count: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Team "Empty" deleted successfully.' });
    });

    test('forwards errors while updating the course count', async () => {
      Team.findOne.mockResolvedValue({ team_name: 'Empty', students: [] });
      Team.findOneAndDelete.mockResolvedValue({});
      Team.countDocuments.mockRejectedValue(new Error('count failed'));
      const next = jest.fn();

      await teamController.deleteTeam({ params: { course_id: validId, team_id: secondId } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'count failed' }));
    });
  });

  describe('clearAllTeams', () => {
    test('validates the course ID', async () => {
      const next = jest.fn();
      await teamController.clearAllTeams({ params: { course_id: 'bad-id' } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course ID.');
    });

    test('clears teams, unlinks students, and resets the course count', async () => {
      Team.deleteMany.mockResolvedValue({ deletedCount: 2 });
      const res = responseMock();
      await teamController.clearAllTeams({ params: { course_id: validId } }, res, jest.fn());
      expect(Student.updateMany).toHaveBeenCalledWith(expect.anything(), { $unset: { team_id: '', group_assignment: '' } });
      expect(Course.findByIdAndUpdate).toHaveBeenCalledWith(expect.anything(), { team_count: 0 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'All teams cleared successfully. 2 teams deleted.', teams_deleted: 2 });
    });

    test('forwards cleanup errors', async () => {
      const error = new Error('cleanup failed');
      Team.deleteMany.mockRejectedValue(error);
      const next = jest.fn();
      await teamController.clearAllTeams({ params: { course_id: validId } }, responseMock(), next);
      expect(next).toHaveBeenCalledWith(error);
    });

    test('forwards student cleanup errors', async () => {
      Team.deleteMany.mockResolvedValue({ deletedCount: 1 });
      const error = new Error('student cleanup failed');
      Student.updateMany.mockRejectedValue(error);
      const next = jest.fn();

      await teamController.clearAllTeams({ params: { course_id: validId } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  test('autoAssignTeams reports that it is not implemented', async () => {
    const next = jest.fn();
    await teamController.autoAssignTeams({}, {}, next);
    expectError(next, 'NOT_IMPLEMENTED', 501, 'Auto-assign not implemented.');
  });

  describe.each([
    ['addStudentToTeam', 'added', 'Student "Ada" added to team "Alpha".'],
    ['removeStudentFromTeam', 'removed', 'Student "Ada" removed from team "Alpha".']
  ])('%s', (method, action, message) => {
    test('validates IDs', async () => {
      const next = jest.fn();
      await teamController[method]({ params: { course_id: 'bad-id', team_id: validId, student_id: secondId } }, responseMock(), next);
      expectError(next, 'VALIDATION_ERROR', 400, 'Invalid course, team, or student ID.');
    });

    test('handles a missing team', async () => {
      Team.findOne.mockResolvedValue(null);
      const next = jest.fn();
      await teamController[method]({ params: { course_id: validId, team_id: secondId, student_id: validId } }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Team not found.');
    });

    test(`successfully ${action} a student`, async () => {
      const studentId = new (require('mongoose').Types.ObjectId)(secondId);
      const team = {
        team_name: 'Alpha',
        students: action === 'added' ? [] : [studentId],
        save: jest.fn().mockResolvedValue(undefined),
        ...(action === 'removed' ? { } : {})
      };
      if (action === 'removed') {
        team.students.includes = jest.fn().mockReturnValue(true);
        team.students.pull = jest.fn(() => team.students.splice(0, 1));
      }
      const student = { name: 'Ada', save: jest.fn().mockResolvedValue(undefined) };
      Team.findOne.mockResolvedValue(team);
      Student.findOne.mockResolvedValue(student);
      Team.find.mockResolvedValue(action === 'added' ? [team] : []);
      const res = responseMock();

      await teamController[method]({ params: { course_id: validId, team_id: validId, student_id: secondId } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message }));
      expect(student.save).toHaveBeenCalled();
    });

    test(`${action} handles the remaining membership guards`, async () => {
      const team = { team_name: 'Alpha', students: [], save: jest.fn() };
      const student = { name: 'Ada', save: jest.fn() };
      Team.findOne.mockResolvedValue(team);
      Student.findOne.mockResolvedValue(null);
      let next = jest.fn();
      await teamController[method]({ params: { course_id: validId, team_id: validId, student_id: secondId } }, responseMock(), next);
      expectError(next, 'NOT_FOUND', 404, 'Student not found.');

      Student.findOne.mockResolvedValue(student);
      if (action === 'added') {
        team.students.includes = jest.fn().mockReturnValue(true);
        next = jest.fn();
        await teamController[method]({ params: { course_id: validId, team_id: validId, student_id: secondId } }, responseMock(), next);
        expectError(next, 'DUPLICATE', 409, 'Student is already in this team.');
      } else {
        team.students.includes = jest.fn().mockReturnValue(false);
        next = jest.fn();
        await teamController[method]({ params: { course_id: validId, team_id: validId, student_id: secondId } }, responseMock(), next);
        expectError(next, 'NOT_FOUND', 404, 'Student is not in this team.');
      }
    });

    test(`${action} forwards persistence errors`, async () => {
      const team = {
        team_name: 'Alpha',
        students: action === 'added' ? [] : [new (require('mongoose').Types.ObjectId)(secondId)],
        save: jest.fn().mockRejectedValue(new Error('team save failed'))
      };
      const student = { name: 'Ada', save: jest.fn().mockResolvedValue(undefined) };
      Team.findOne.mockResolvedValue(team);
      Student.findOne.mockResolvedValue(student);
      if (action === 'removed') {
        team.students.includes = jest.fn().mockReturnValue(true);
        team.students.pull = jest.fn(() => undefined);
      }
      const next = jest.fn();

      await teamController[method]({ params: { course_id: validId, team_id: validId, student_id: secondId } }, responseMock(), next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'team save failed' }));
    });
  });
});