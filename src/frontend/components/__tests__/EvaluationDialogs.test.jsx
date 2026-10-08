import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EvaluationResetDialog from '../EvaluationResetDialog';
import EvaluationStatusDialog from '../EvaluationStatusDialog';

// The two evaluation dialogs on the course row (CICD-57, step 3). The page owns the data and the
// requests; these show it and report what the professor presses.
const user = userEvent.setup({ delay: null });

describe('EvaluationResetDialog', () => {
  test('is not shown while closed', () => {
    render(<EvaluationResetDialog open={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('warns that continuing clears the links and responses, and cannot be undone', () => {
    render(<EvaluationResetDialog open onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Evaluations Already Sent' })).toBeInTheDocument();
    expect(screen.getByText(/clear all evaluation tokens and responses/)).toBeInTheDocument();
    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument();
  });

  test('Cancel and Continue call the page\'s handlers', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<EvaluationResetDialog open onCancel={onCancel} onConfirm={onConfirm} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

const COURSE = { _id: 'c1', course_number: 'CS 4850', course_section: '01', course_name: 'Capstone' };
const STUDENTS = [
  { student_id: '1001', name: 'Ann Archer', team: 'Alpha', completed: true, last_activity: '2026-10-01T15:00:00Z' },
  { student_id: '1002', name: 'Ben Baker', team: 'Alpha', completed: false, last_activity: null },
  { student_id: '1003', name: 'Cy Cole', team: 'Beta', completed: false, last_activity: null },
  { student_id: '1004', name: 'Di Diaz', team: '', completed: false, last_activity: null },
];
const SENT = { evaluations_sent: true, completed_count: 1, total_count: 4, students: STUDENTS };

const statusProps = (overrides = {}) => ({
  open: true, course: COURSE, status: SENT, loading: false, sending: false, resetting: false,
  onSend: () => {}, onRemind: () => {}, onReset: () => {}, onClose: () => {}, ...overrides,
});

describe('EvaluationStatusDialog', () => {
  test('is not shown while closed', () => {
    render(<EvaluationStatusDialog {...statusProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('names the course in its title', () => {
    render(<EvaluationStatusDialog {...statusProps()} />);
    expect(screen.getByRole('heading', { name: 'Evaluation Status - CS 4850 01 - Capstone' })).toBeInTheDocument();
  });

  test('falls back to the course code when there is no course number', () => {
    render(<EvaluationStatusDialog {...statusProps({ course: { _id: 'c1', course_code: 'IT 3100', course_name: 'Databases' } })} />);
    expect(screen.getByRole('heading', { name: /IT 3100/ })).toBeInTheDocument();
  });

  test('shows a progress bar while the status loads', () => {
    render(<EvaluationStatusDialog {...statusProps({ loading: true, status: null })} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText(/Progress:/)).not.toBeInTheDocument();
  });

  test('says so when there is no status to show', () => {
    render(<EvaluationStatusDialog {...statusProps({ status: null })} />);
    expect(screen.getByText('No evaluation data available for this course.')).toBeInTheDocument();
  });

  test('before sending, offers to send, and the button reports its press', async () => {
    const onSend = vi.fn();
    render(<EvaluationStatusDialog {...statusProps({ status: { evaluations_sent: false }, onSend })} />);
    expect(screen.getByText('Evaluations Have Not Been Sent')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send Evaluations Now' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Progress:/)).not.toBeInTheDocument();
  });

  test('while sending, the button says so and cannot be pressed again', () => {
    render(<EvaluationStatusDialog {...statusProps({ status: { evaluations_sent: false }, sending: true })} />);
    expect(screen.getByRole('button', { name: 'Sending Evaluations...' })).toBeDisabled();
  });

  test('after sending, shows the count and one card per team, with who is done', () => {
    render(<EvaluationStatusDialog {...statusProps()} />);

    expect(screen.getByText('Progress: 1/4 evaluations completed')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('No Team')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Alpha: one of two
    expect(screen.getAllByText('Done')).toHaveLength(1);
    expect(screen.getAllByText('Pending')).toHaveLength(3);
    expect(screen.getByText('Ann Archer')).toBeInTheDocument();
    expect(screen.getAllByText('Never')).toHaveLength(3);
  });

  test('lists the teams in order, with the students without a team last', () => {
    render(<EvaluationStatusDialog {...statusProps()} />);
    const cards = ['Alpha', 'Beta', 'No Team'].map((team) => screen.getByText(team));
    for (let i = 0; i < cards.length - 1; i += 1) {
      // eslint-disable-next-line no-bitwise
      expect(cards[i].compareDocumentPosition(cards[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  test('Send Reminders reports its press, and is off once everyone has finished', async () => {
    const onRemind = vi.fn();
    const { rerender } = render(<EvaluationStatusDialog {...statusProps({ onRemind })} />);
    await user.click(screen.getByRole('button', { name: 'Send Reminders' }));
    expect(onRemind).toHaveBeenCalledTimes(1);

    rerender(<EvaluationStatusDialog {...statusProps({ onRemind, status: { ...SENT, completed_count: 4 } })} />);
    expect(screen.getByRole('button', { name: 'Send Reminders' })).toBeDisabled();
  });

  test('Reset Evaluation State and Close report their presses; while resetting the reset is off', async () => {
    const onReset = vi.fn();
    const onClose = vi.fn();
    const { rerender } = render(<EvaluationStatusDialog {...statusProps({ onReset, onClose })} />);

    await user.click(screen.getByRole('button', { name: 'Reset Evaluation State' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<EvaluationStatusDialog {...statusProps({ resetting: true })} />);
    expect(screen.getByRole('button', { name: 'Resetting...' })).toBeDisabled();
  });

  test('shows 0% progress without dividing by zero when there are no students', () => {
    render(<EvaluationStatusDialog {...statusProps({ status: { evaluations_sent: true, completed_count: 0, total_count: 0, students: [] } })} />);
    expect(screen.getByText('Progress: 0/0 evaluations completed')).toBeInTheDocument();
    expect(within(screen.getByRole('dialog')).getAllByRole('progressbar')[0]).toHaveAttribute('aria-valuenow', '0');
  });
});
