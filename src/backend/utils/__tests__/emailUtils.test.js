const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

const {
  sendEvaluationInvitation,
  sendEvaluationReminder,
  sendPasswordResetEmail,
} = require('../emailUtils');

const student = { name: 'Alex Student', email: 'alex@example.com' };
const course = {
  course_name: 'Capstone',
  course_number: 'CIS 501',
  course_section: 'A',
  semester: 'Fall 2026',
};

beforeEach(() => {
  mockSendMail.mockReset();
});

describe('sendEvaluationInvitation', () => {
  it('sends the invitation email and returns success with the message id', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'msg-1' });

    const result = await sendEvaluationInvitation(student, course, 'tok123', 'http://localhost:3000', '2026-10-01');

    expect(result).toEqual({ success: true, messageId: 'msg-1' });
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe(student.email);
    expect(mailOptions.subject).toContain(course.course_name);
    expect(mailOptions.html).toContain('http://localhost:3000/evaluate/tok123');
    expect(mailOptions.html).toContain(student.name);
  });

  it('returns success: false with the error message when sending fails', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP down'));

    const result = await sendEvaluationInvitation(student, course, 'tok123');

    expect(result).toEqual({ success: false, error: 'SMTP down' });
  });
});

describe('sendEvaluationReminder', () => {
  it('sends the reminder email with the evaluation link', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'msg-2' });

    const result = await sendEvaluationReminder(student, course, 'tok456');

    expect(result).toEqual({ success: true, messageId: 'msg-2' });
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe(student.email);
    expect(mailOptions.html).toContain('http://localhost:3000/evaluate/tok456');
  });

  it('returns success: false when sending fails', async () => {
    mockSendMail.mockRejectedValue(new Error('rate limited'));

    const result = await sendEvaluationReminder(student, course, 'tok456');

    expect(result).toEqual({ success: false, error: 'rate limited' });
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends a reset email containing the reset link with token', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'msg-3' });

    const result = await sendPasswordResetEmail('prof@example.com', 'reset-token-xyz');

    expect(result).toEqual({ success: true, messageId: 'msg-3' });
    const mailOptions = mockSendMail.mock.calls[0][0];
    expect(mailOptions.to).toBe('prof@example.com');
    expect(mailOptions.html).toContain('/reset-password/reset-token-xyz');
  });

  it('returns success: false when sending fails', async () => {
    mockSendMail.mockRejectedValue(new Error('bad address'));

    const result = await sendPasswordResetEmail('prof@example.com', 'reset-token-xyz');

    expect(result).toEqual({ success: false, error: 'bad address' });
  });
});
