import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import StudentEvaluation from '../StudentEvaluation';

vi.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: vi.fn(), post: vi.fn() },
}));

// The page a student opens from the emailed link (CW-06, CW-07): no login, one form per teammate.
const CRITERIA = ['professionalism', 'communication', 'work_ethic', 'content_knowledge_skills', 'overall_contribution', 'participation'];

const FORM = {
  rubric: {
    title: 'Group Member Evaluation Rubric',
    description: 'Rate each teammate',
    criteria: CRITERIA.map((id) => ({
      id,
      name: id.replace(/_/g, ' '),
      description: `How well did they show ${id}?`,
      scaleDescriptions: { 1: 'Rarely', 4: 'Usually', 5: 'Always' },
    })),
    overallFeedback: { name: 'Overall feedback', description: 'Say what went well' },
  },
  course: { name: 'Capstone', number: 'CS 4850', section: '01', semester: 'Fall 2026' },
  evaluator: { name: 'Ann Archer', student_id: '1001', team: 'Alpha' },
  teammates: [
    { _id: 'b1', name: 'Ben Baker', student_id: '1002' },
    { _id: 'c1', name: 'Cy Cole', student_id: '1003' },
  ],
  token: 'tok123',
};

// Typing character by character re-renders the whole form for every key, which is slow; clicks are
// quick when userEvent does not wait between actions.
const user = userEvent.setup({ delay: null });
vi.setConfig({ testTimeout: 30000 });

const oneTeammate = () => api.get.mockResolvedValue({ data: { ...FORM, teammates: FORM.teammates.slice(0, 1) } });

function renderForm(path = '/evaluate/tok123') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/evaluate/:token" element={<StudentEvaluation />} />
        <Route path="/evaluate" element={<StudentEvaluation />} />
        <Route path="/" element={<h1>Home page</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

// Chooses a score for each criterion of one teammate's form, in the order shown.
async function rate(teammateIndex, scores) {
  const groups = screen.getAllByRole('radiogroup').slice(teammateIndex * CRITERIA.length, (teammateIndex + 1) * CRITERIA.length);
  for (const [index, score] of scores.entries()) {
    await user.click(within(groups[index]).getByRole('radio', { name: new RegExp(`^${score}`) }));
  }
}

const feedbackBoxes = () => screen.getAllByPlaceholderText(/constructive feedback/i);
const write = (teammateIndex, text) => fireEvent.change(feedbackBoxes()[teammateIndex], { target: { value: text } });
const submit = () => user.click(screen.getByRole('button', { name: /submit evaluation/i }));

describe('StudentEvaluation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockResolvedValue({ data: FORM });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetAllMocks();
  });

  test('shows the course, the student and one form per teammate', async () => {
    renderForm();
    expect(await screen.findByRole('heading', { name: 'Group Member Evaluation Rubric' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/evaluate/tok123');
    expect(screen.getByText('Capstone')).toBeInTheDocument();
    expect(screen.getByText('Ann Archer')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evaluate: Ben Baker' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evaluate: Cy Cole' })).toBeInTheDocument();
    expect(screen.getAllByRole('radiogroup')).toHaveLength(12);
  });

  test('a link without a token says so and asks for nothing', async () => {
    renderForm('/evaluate');
    expect(await screen.findByText('No evaluation token provided')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test('shows the server\'s reason when the form cannot be opened, and a plain message otherwise', async () => {
    api.get.mockRejectedValue({ response: { data: { error: { message: 'This evaluation has been cancelled or is no longer available.' } } } });
    renderForm();
    expect(await screen.findByText('This evaluation has been cancelled or is no longer available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit evaluation/i })).not.toBeInTheDocument();
  });

  test('falls back to a plain message when the server gives no reason', async () => {
    api.get.mockRejectedValue(new Error('network'));
    renderForm();
    expect(await screen.findByText('Failed to load evaluation form')).toBeInTheDocument();
  });

  test('a link that was already used shows the completed page, and Return to Home goes home', async () => {
    api.get.mockResolvedValue({ data: { completed: true, submitted_at: '2026-10-01T15:00:00Z' } });
    renderForm();
    expect(await screen.findByRole('heading', { name: 'Evaluation Completed!' })).toBeInTheDocument();
    expect(screen.getByText(/Submitted:/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /submit evaluation/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Return to Home' }));
    expect(await screen.findByRole('heading', { name: 'Home page' })).toBeInTheDocument();
  });

  test('counts the feedback characters as the student types', async () => {
    renderForm();
    await screen.findByRole('heading', { name: 'Evaluate: Ben Baker' });
    expect(screen.getAllByText('0 characters (minimum 10 required)')).toHaveLength(2);

    await user.type(feedbackBoxes()[0], 'Helpful');
    expect(screen.getByText('7 characters (minimum 10 required)')).toBeInTheDocument();
  });

  test('refuses to submit while a rating is missing, names it, and sends nothing', async () => {
    renderForm();
    await screen.findByRole('heading', { name: 'Evaluate: Ben Baker' });
    write(0, 'Reliable, prepared and easy to work with.');

    await submit();

    expect(await screen.findByText('Please provide a rating for professionalism for all team members.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('refuses to submit when feedback is shorter than 10 characters', async () => {
    oneTeammate();
    renderForm();
    await screen.findByRole('heading', { name: 'Evaluate: Ben Baker' });
    await rate(0, [5, 5, 5, 5, 5, 4]);
    write(0, 'too short');

    await submit();

    expect(await screen.findByText('Please provide overall feedback (at least 10 characters) for all team members.')).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('sends one evaluation per teammate with whole-number ratings, then shows the thank-you page', async () => {
    api.post.mockResolvedValue({ data: { message: 'Evaluation submitted successfully.' } });
    renderForm();
    await screen.findByRole('heading', { name: 'Evaluate: Ben Baker' });
    await rate(0, [5, 4, 5, 4, 5, 4]);
    await rate(1, [1, 1, 1, 1, 1, 1]);
    write(0, 'Reliable, prepared and easy to work with.');
    write(1, 'Did the minimum, but was polite.');

    await submit();

    expect(await screen.findByRole('heading', { name: 'Evaluation Completed!' })).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/evaluate/tok123');
    expect(body.evaluations).toEqual([
      {
        student_id: 'b1',
        ratings: { professionalism: 5, communication: 4, work_ethic: 5, content_knowledge_skills: 4, overall_contribution: 5, participation: 4 },
        overall_feedback: 'Reliable, prepared and easy to work with.',
      },
      {
        student_id: 'c1',
        ratings: { professionalism: 1, communication: 1, work_ethic: 1, content_knowledge_skills: 1, overall_contribution: 1, participation: 1 },
        overall_feedback: 'Did the minimum, but was polite.',
      },
    ]);
  });

  test('keeps the form and shows the server\'s reason when the submission is refused', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'You can only rate your current teammates. Reload the page and try again.' } } } });
    oneTeammate();
    renderForm();
    await screen.findByRole('heading', { name: 'Evaluate: Ben Baker' });
    await rate(0, [5, 5, 5, 5, 5, 4]);
    write(0, 'Reliable, prepared and easy to work with.');

    await submit();

    expect(await screen.findByText('You can only rate your current teammates. Reload the page and try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit evaluation/i })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Evaluation Completed!' })).not.toBeInTheDocument();
  });
});
