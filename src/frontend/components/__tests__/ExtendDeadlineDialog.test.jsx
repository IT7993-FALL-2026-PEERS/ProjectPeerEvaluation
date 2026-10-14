import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExtendDeadlineDialog from '../ExtendDeadlineDialog';

// CICD-68: more time with a new link, for one student, one team, or everyone who has not submitted.
const STUDENTS = [{ id: 's1', name: 'Ann Archer' }, { id: 's2', name: 'Ben Baker' }];
const TEAMS = [{ id: 't1', name: 'Alpha' }];
const base = { open: true, students: STUDENTS, teams: TEAMS, initialValue: '', busy: false, onConfirm: () => {}, onClose: () => {} };
const future = '2999-01-01T10:00';

describe('ExtendDeadlineDialog', () => {
  test('defaults to everyone who has not submitted and sends the scope with the deadline', async () => {
    const onConfirm = vi.fn();
    render(<ExtendDeadlineDialog {...base} onConfirm={onConfirm} />);
    expect(screen.getByRole('radio', { name: /everyone who has not submitted/i })).toBeChecked();
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: future } });
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenCalledWith({ scope: 'unsubmitted', localValue: future });
  });

  test('one student or one team needs a choice before Extend is enabled', async () => {
    const onConfirm = vi.fn();
    render(<ExtendDeadlineDialog {...base} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: future } });
    await userEvent.click(screen.getByRole('radio', { name: /one student/i }));
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: 's2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ scope: 'student', student_id: 's2', localValue: future });

    await userEvent.click(screen.getByRole('radio', { name: /one team/i }));
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Team'), { target: { value: 't1' } });
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenLastCalledWith({ scope: 'team', team_id: 't1', localValue: future });
  });

  test('a missing or past deadline keeps Extend disabled', () => {
    render(<ExtendDeadlineDialog {...base} />);
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2000-01-01T10:00' } });
    expect(screen.getByRole('button', { name: 'Extend' })).toBeDisabled();
  });

  test('Cancel closes without extending', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ExtendDeadlineDialog {...base} onClose={onClose} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  // Codex review: a response arriving while the dialog is open (it updates the prefill) must not throw
  // away the instructor's choices and fall back to everyone.
  test('a new prefill while the dialog is open keeps the chosen scope, student and deadline', async () => {
    const onConfirm = vi.fn();
    const { rerender } = render(<ExtendDeadlineDialog {...base} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('radio', { name: /one student/i }));
    fireEvent.change(screen.getByLabelText('Student'), { target: { value: 's2' } });
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: future } });
    rerender(<ExtendDeadlineDialog {...base} onConfirm={onConfirm} initialValue="2999-05-05T05:05" />);
    expect(screen.getByRole('radio', { name: /one student/i })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Extend' }));
    expect(onConfirm).toHaveBeenCalledWith({ scope: 'student', student_id: 's2', localValue: future });
  });
});
