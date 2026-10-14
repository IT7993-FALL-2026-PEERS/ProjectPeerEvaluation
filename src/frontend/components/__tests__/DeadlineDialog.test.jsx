import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeadlineDialog from '../DeadlineDialog';
import { browserZone } from '../../services/deadline';

// CICD-67: every send asks for the deadline first.
const base = { open: true, title: 'Send evaluations', description: 'Students must submit by the deadline.', initialValue: '', busy: false, onConfirm: () => {}, onClose: () => {} };
const future = '2999-01-01T10:00';

describe('DeadlineDialog', () => {
  test('shows the title, the description and the browser\'s zone', () => {
    render(<DeadlineDialog {...base} />);
    expect(screen.getByRole('heading', { name: 'Send evaluations' })).toBeInTheDocument();
    expect(screen.getByText('Students must submit by the deadline.')).toBeInTheDocument();
    expect(screen.getByText((text) => text.includes(`Time zone: ${browserZone()}`))).toBeInTheDocument();
  });

  test('Send is disabled until a deadline is chosen, and sends the value that was chosen', async () => {
    const onConfirm = vi.fn();
    render(<DeadlineDialog {...base} onConfirm={onConfirm} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: future } });
    expect(send).toBeEnabled();
    await userEvent.click(send);
    expect(onConfirm).toHaveBeenCalledWith(future);
  });

  test('a prefilled deadline is shown and can be sent as it is', async () => {
    const onConfirm = vi.fn();
    render(<DeadlineDialog {...base} initialValue={future} onConfirm={onConfirm} />);
    expect(screen.getByLabelText('Deadline')).toHaveValue(future);
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onConfirm).toHaveBeenCalledWith(future);
  });

  test('a deadline that is already past keeps Send disabled and says why', () => {
    render(<DeadlineDialog {...base} />);
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2000-01-01T10:00' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/must be in the future/i)).toBeInTheDocument();
  });

  test('busy disables both buttons so a send cannot be pressed twice', () => {
    render(<DeadlineDialog {...base} initialValue={future} busy />);
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  test('Cancel closes without sending, and nothing is shown when closed', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(<DeadlineDialog {...base} onClose={onClose} onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    rerender(<DeadlineDialog {...base} open={false} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); // after MUI's close animation
  });

  test('opening it again shows the new prefilled value, not what was typed before', () => {
    const { rerender } = render(<DeadlineDialog {...base} open initialValue="2999-02-02T08:00" />);
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: future } });
    rerender(<DeadlineDialog {...base} open={false} initialValue="" />);
    rerender(<DeadlineDialog {...base} open initialValue="2999-03-03T09:00" />);
    expect(screen.getByLabelText('Deadline')).toHaveValue('2999-03-03T09:00');
  });
});

describe('DeadlineDialog across a daylight-saving change', () => {
  const zone = process.env.TZ;
  beforeEach(() => { process.env.TZ = 'America/New_York'; });
  afterEach(() => { if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone; });

  test('a time skipped by the clock change keeps Send disabled and says why', () => {
    render(<DeadlineDialog {...base} />);
    fireEvent.change(screen.getByLabelText('Deadline'), { target: { value: '2999-03-10T02:30' } });
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/does not exist/i)).toBeInTheDocument();
  });
});
