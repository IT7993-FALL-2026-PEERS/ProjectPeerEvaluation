import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddStudentDialog from '../AddStudentDialog';
import EditStudentDialog from '../EditStudentDialog';

// The add and edit student dialogs on the Manage Students screen (CICD-57, step 2). They hold no
// state of their own: the page passes the form and the handlers, so a small wrapper plays the page.
const EMPTY = { student_id: '', name: '', email: '', group_assignment: '' };
const user = userEvent.setup({ delay: null });

function Page({ Dialog, initial = EMPTY, ...props }) {
  const [form, setForm] = useState(initial);
  return <Dialog open form={form} onFormChange={setForm} {...props} />;
}

describe('AddStudentDialog', () => {
  test('is not shown while closed', () => {
    render(<AddStudentDialog open={false} form={EMPTY} error="" onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('has the four fields, and what is typed goes into the form', async () => {
    render(<Page Dialog={AddStudentDialog} error="" onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Add Student' })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Student ID'), '1007');
    await user.type(screen.getByLabelText('Name'), 'Zed Zimmer');
    await user.type(screen.getByLabelText('Email'), 'zed@example.edu');
    await user.type(screen.getByLabelText('Team Assignment (Optional)'), 'Gamma');

    expect(screen.getByLabelText('Student ID')).toHaveValue('1007');
    expect(screen.getByLabelText('Name')).toHaveValue('Zed Zimmer');
    expect(screen.getByLabelText('Email')).toHaveValue('zed@example.edu');
    expect(screen.getByLabelText('Team Assignment (Optional)')).toHaveValue('Gamma');
  });

  test('passes the whole updated form to the page on every change', async () => {
    const onFormChange = jest.fn();
    render(<AddStudentDialog open form={{ ...EMPTY, name: 'Zed' }} error="" onFormChange={onFormChange} onClose={() => {}} onSubmit={() => {}} />);

    await user.type(screen.getByLabelText('Email'), 'z');

    expect(onFormChange).toHaveBeenCalledWith({ ...EMPTY, name: 'Zed', email: 'z' });
  });

  test('shows the error and marks only the empty required fields', () => {
    render(<AddStudentDialog open form={{ ...EMPTY, name: 'Zed' }} error="Student ID, name, and email are required." onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByText('Student ID, name, and email are required.')).toBeInTheDocument();
    expect(screen.getByLabelText('Student ID')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('Team Assignment (Optional)')).toHaveAttribute('aria-invalid', 'false');
  });

  test('shows no error marks when there is no error', () => {
    render(<AddStudentDialog open form={EMPTY} error="" onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByLabelText('Student ID')).toHaveAttribute('aria-invalid', 'false');
  });

  test('Add and Cancel call the page\'s handlers', async () => {
    const onSubmit = jest.fn();
    const onClose = jest.fn();
    render(<AddStudentDialog open form={EMPTY} error="" onFormChange={() => {}} onClose={onClose} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('EditStudentDialog', () => {
  const STUDENT = { student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', group_assignment: 'Alpha' };

  test('is not shown while closed', () => {
    render(<EditStudentDialog open={false} form={STUDENT} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows the student\'s details and lets them be changed', async () => {
    render(<Page Dialog={EditStudentDialog} initial={STUDENT} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Edit Student' })).toBeInTheDocument();
    expect(screen.getByLabelText('Student ID')).toHaveValue('1001');
    expect(screen.getByLabelText('Team Assignment (Optional)')).toHaveValue('Alpha');

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Ann Archer-Reyes');
    expect(screen.getByLabelText('Name')).toHaveValue('Ann Archer-Reyes');
  });

  test('Save is off while the student ID, name or email is empty', () => {
    const { rerender } = render(<EditStudentDialog open form={STUDENT} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    for (const field of ['student_id', 'name', 'email']) {
      rerender(<EditStudentDialog open form={{ ...STUDENT, [field]: '' }} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    // The team is optional.
    rerender(<EditStudentDialog open form={{ ...STUDENT, group_assignment: '' }} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('Save and Cancel call the page\'s handlers', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(<EditStudentDialog open form={STUDENT} onFormChange={() => {}} onClose={onClose} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
