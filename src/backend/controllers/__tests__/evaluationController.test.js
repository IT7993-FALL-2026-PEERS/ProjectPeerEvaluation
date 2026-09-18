jest.mock('../../models/Student', () => ({
  findOne: jest.fn(),
  findByIdAndUpdate: jest.fn().mockResolvedValue(),
}));
jest.mock('../../models/Course', () => ({}));
jest.mock('../../models/Team', () => ({}));
jest.mock('../../models/Evaluation', () => {
  const mockSave = jest.fn().mockResolvedValue();
  const instances = [];
  function Evaluation(data) {
    Object.assign(this, data);
    this.save = mockSave;
    instances.push(this);
  }
  Evaluation.findOne = jest.fn();
  Evaluation.__mockSave = mockSave;
  Evaluation.__instances = instances;
  return Evaluation;
});

const Student = require('../../models/Student');
const Evaluation = require('../../models/Evaluation');
const evaluationController = require('../evaluationController');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const VALID_RATINGS = {
  professionalism: 5,
  communication: 4,
  work_ethic: 5,
  content_knowledge_skills: 4,
  overall_contribution: 5,
  participation: 4,
};

beforeEach(() => {
  jest.clearAllMocks();
  Evaluation.__instances.length = 0;
});

describe('evaluationController.submitEvaluation', () => {
  const populatedStudent = (overrides = {}) => ({
    _id: 'evaluator1',
    course_id: { _id: 'course1' },
    populate: jest.fn(),
    ...overrides,
  });

  function withPopulate(student) {
    // Student.findOne(...).populate('course_id') chain
    Student.findOne.mockReturnValue({ populate: jest.fn().mockResolvedValue(student) });
  }

  it('rejects with EVALUATION_CANCELLED when the token does not match a student', async () => {
    withPopulate(null);
    const req = { params: { token: 'bad-token' }, body: { evaluations: [] } };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(404);
    expect(err.code).toBe('EVALUATION_CANCELLED');
  });

  it('rejects with ALREADY_COMPLETED when the student has already submitted', async () => {
    withPopulate(populatedStudent());
    Evaluation.findOne.mockResolvedValue({ _id: 'existing-eval' });
    const req = {
      params: { token: 'tok' },
      body: { evaluations: [{ student_id: 's2', ratings: VALID_RATINGS, overall_feedback: 'Great teammate!' }] },
    };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(409);
    expect(err.code).toBe('ALREADY_COMPLETED');
  });

  it('rejects when the evaluations array is missing or empty', async () => {
    withPopulate(populatedStudent());
    Evaluation.findOne.mockResolvedValue(null);
    const req = { params: { token: 'tok' }, body: { evaluations: [] } };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
  });

  it('rejects when a required rating is missing', async () => {
    withPopulate(populatedStudent());
    Evaluation.findOne.mockResolvedValue(null);
    const { participation, ...missingParticipation } = VALID_RATINGS;
    const req = {
      params: { token: 'tok' },
      body: {
        evaluations: [{ student_id: 's2', ratings: missingParticipation, overall_feedback: 'Great teammate!' }],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/participation/);
  });

  it('rejects when overall_feedback is shorter than 10 characters', async () => {
    withPopulate(populatedStudent());
    Evaluation.findOne.mockResolvedValue(null);
    const req = {
      params: { token: 'tok' },
      body: { evaluations: [{ student_id: 's2', ratings: VALID_RATINGS, overall_feedback: 'too short' }] },
    };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    const err = next.mock.calls[0][0];
    expect(err.status).toBe(400);
    expect(err.message).toMatch(/feedback/i);
  });

  it('saves each evaluation and marks the student completed on success', async () => {
    withPopulate(populatedStudent());
    Evaluation.findOne.mockResolvedValue(null);
    const req = {
      params: { token: 'tok' },
      body: {
        evaluations: [
          { student_id: 's2', ratings: VALID_RATINGS, overall_feedback: 'Great teammate, always on time.' },
          { student_id: 's3', ratings: VALID_RATINGS, overall_feedback: 'Solid contributor throughout.' },
        ],
      },
    };
    const res = mockRes();
    const next = jest.fn();

    await evaluationController.submitEvaluation(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(Evaluation.__instances).toHaveLength(2);
    expect(Evaluation.__mockSave).toHaveBeenCalledTimes(2);
    expect(Student.findByIdAndUpdate).toHaveBeenCalledWith('evaluator1', { evaluation_completed: true });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ evaluations_count: 2 })
    );
  });
});
