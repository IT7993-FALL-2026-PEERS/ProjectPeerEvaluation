import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddStudentDialog from '../AddStudentDialog';
import EditStudentDialog from '../EditStudentDialog';

// The add and edit student dialogs on the Manage Students screen (CICD-57, step 2). They hold no
// state of their own: the page passes the form and the handlers, so a small wrapper plays the page.
const EMPTY = { student_id: '', name: '', email: '', group_assignment: '' };
const user = userEvent.setup({ delay: null });

// Required fields carry an asterisk in their label, so the labels are matched from the start.
const STUDENT_ID = /^Student ID/;
const NAME = /^Name/;
const EMAIL = /^Email/;
const teamField = () => screen.getByRole('combobox', { name: /Team Assignment/ });

function Page({ Dialog, initial = EMPTY, ...props }) {
  const [form, setForm] = useState(initial);
  return <Dialog open form={form} onFormChange={setForm} {...props} />;
}

describe('AddStudentDialog', () => {
  test('is not shown while closed', () => {
    render(<AddStudentDialog open={false} form={EMPTY} error="" onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('has the four fields, and what is typed or chosen goes into the form', async () => {
    render(<Page Dialog={AddStudentDialog} error="" onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Add Student' })).toBeInTheDocument();

    await user.type(screen.getByLabelText(STUDENT_ID), '1007');
    await user.type(screen.getByLabelText(NAME), 'Zed Zimmer');
    await user.type(screen.getByLabelText(EMAIL), 'zed@example.edu');
    await user.click(teamField());
    await user.click(screen.getByRole('option', { name: 'Team 3' }));

    expect(screen.getByLabelText(STUDENT_ID)).toHaveValue('1007');
    expect(screen.getByLabelText(NAME)).toHaveValue('Zed Zimmer');
    expect(screen.getByLabelText(EMAIL)).toHaveValue('zed@example.edu');
    expect(teamField()).toHaveTextContent('Team 3');
  });

  test('the student ID, name and email are required, the team is optional', () => {
    render(<AddStudentDialog open form={EMPTY} error="" onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(STUDENT_ID)).toBeRequired();
    expect(screen.getByLabelText(NAME)).toBeRequired();
    expect(screen.getByLabelText(EMAIL)).toBeRequired();
    expect(teamField()).not.toBeRequired();
  });

  test('+ Add another team picks the next numbered team, continuing from the course\'s own teams', async () => {
    const onFormChange = vi.fn();
    render(<AddStudentDialog open form={EMPTY} error="" teamNames={['Team 11', 'Group A']} onFormChange={onFormChange} onClose={() => {}} onSubmit={() => {}} />);

    await user.click(teamField());
    expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual([
      'No team assigned', 'Team 1', 'Team 2', 'Team 3', 'Team 4', 'Team 5', 'Team 6', 'Team 7', 'Team 8', 'Team 9', 'Team 10', 'Team 11', '+ Add another team',
    ]);
    await user.click(screen.getByRole('option', { name: '+ Add another team' }));

    expect(onFormChange).toHaveBeenLastCalledWith({ ...EMPTY, group_assignment: 'Team 12' });
  });

  test('passes the whole updated form to the page on every change', async () => {
    const onFormChange = vi.fn();
    render(<AddStudentDialog open form={{ ...EMPTY, name: 'Zed' }} error="" onFormChange={onFormChange} onClose={() => {}} onSubmit={() => {}} />);

    await user.type(screen.getByLabelText(EMAIL), 'z');
    expect(onFormChange).toHaveBeenLastCalledWith({ ...EMPTY, name: 'Zed', email: 'z' });

    await user.click(teamField());
    await user.click(screen.getByRole('option', { name: 'Team 7' }));
    expect(onFormChange).toHaveBeenLastCalledWith({ ...EMPTY, name: 'Zed', group_assignment: 'Team 7' });
  });

  test('shows the error and marks only the empty required fields, never the team', () => {
    render(<AddStudentDialog open form={{ ...EMPTY, name: 'Zed' }} error="Student ID, name, and email are required." onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByText('Student ID, name, and email are required.')).toBeInTheDocument();
    expect(screen.getByLabelText(STUDENT_ID)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(EMAIL)).toHaveAttribute('aria-invalid', 'true');
    expect(teamField()).not.toBeInvalid();
    expect(screen.getByLabelText(NAME)).toHaveAttribute('aria-invalid', 'false');
  });

  test('with no team chosen a small alert says that no team is assigned; choosing a team removes it', async () => {
    render(<Page Dialog={AddStudentDialog} error="" onClose={() => {}} onSubmit={() => {}} />);
    expect(teamField()).toHaveTextContent('No team assigned');
    expect(screen.getByRole('alert')).toHaveTextContent(/No team assigned/);

    await user.click(teamField());
    await user.click(screen.getByRole('option', { name: 'Team 3' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('a field with only spaces counts as empty', () => {
    render(<AddStudentDialog open form={{ student_id: '  ', name: 'Zed', email: 'z@example.edu', group_assignment: 'Team 1' }} error="Student ID, name, and email are required." onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);

    expect(screen.getByLabelText(STUDENT_ID)).toHaveAttribute('aria-invalid', 'true');
    expect(teamField()).not.toBeInvalid();
  });

  test('shows no error marks when there is no error', () => {
    render(<AddStudentDialog open form={EMPTY} error="" onFormChange={() => {}} onClose={() => {}} onSubmit={() => {}} />);
    expect(screen.getByLabelText(STUDENT_ID)).toHaveAttribute('aria-invalid', 'false');
    expect(teamField()).not.toBeInvalid();
  });

  test('Add and Cancel call the page\'s handlers', async () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<AddStudentDialog open form={EMPTY} error="" onFormChange={() => {}} onClose={onClose} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('EditStudentDialog', () => {
  const STUDENT = { student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', group_assignment: 'Group A' };

  test('is not shown while closed', () => {
    render(<EditStudentDialog open={false} form={STUDENT} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows the student\'s details and lets them be changed', async () => {
    render(<Page Dialog={EditStudentDialog} initial={STUDENT} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Edit Student' })).toBeInTheDocument();
    expect(screen.getByLabelText(STUDENT_ID)).toHaveValue('1001');
    // The student's own team is not one of Team 1 to Team 10, and is still shown.
    expect(teamField()).toHaveTextContent('Group A');

    await user.clear(screen.getByLabelText(NAME));
    await user.type(screen.getByLabelText(NAME), 'Ann Archer-Reyes');
    expect(screen.getByLabelText(NAME)).toHaveValue('Ann Archer-Reyes');
  });

  test('the student ID, name and email are required, the team is optional', () => {
    render(<EditStudentDialog open form={STUDENT} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);

    expect(screen.getByLabelText(STUDENT_ID)).toBeRequired();
    expect(screen.getByLabelText(NAME)).toBeRequired();
    expect(screen.getByLabelText(EMAIL)).toBeRequired();
    expect(teamField()).not.toBeRequired();
  });

  test('+ Add another team picks the next numbered team, continuing from the course\'s own teams', async () => {
    const onFormChange = vi.fn();
    render(<EditStudentDialog open form={STUDENT} teamNames={['Group A', 'Team 11']} onFormChange={onFormChange} onClose={() => {}} onSave={() => {}} />);

    await user.click(teamField());
    await user.click(screen.getByRole('option', { name: '+ Add another team' }));

    expect(onFormChange).toHaveBeenLastCalledWith({ ...STUDENT, group_assignment: 'Team 12' });
  });

  test('the team can be changed to one of Team 1 to Team 10', async () => {
    const onFormChange = vi.fn();
    render(<EditStudentDialog open form={STUDENT} onFormChange={onFormChange} onClose={() => {}} onSave={() => {}} />);

    await user.click(teamField());
    await user.click(screen.getByRole('option', { name: 'Team 2' }));

    expect(onFormChange).toHaveBeenLastCalledWith({ ...STUDENT, group_assignment: 'Team 2' });
  });

  test('Save is off while the student ID, name or email is empty, and stays on with no team', () => {
    const { rerender } = render(<EditStudentDialog open form={STUDENT} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    for (const field of ['student_id', 'name', 'email']) {
      rerender(<EditStudentDialog open form={{ ...STUDENT, [field]: '' }} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    // Spaces alone are not an entry.
    for (const field of ['student_id', 'name', 'email']) {
      rerender(<EditStudentDialog open form={{ ...STUDENT, [field]: '   ' }} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    }
    // The team is optional: a student can be saved with no team, and a small alert says so.
    for (const team of ['', '   ']) {
      rerender(<EditStudentDialog open form={{ ...STUDENT, group_assignment: team }} onFormChange={() => {}} onClose={() => {}} onSave={() => {}} />);
      expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
      expect(screen.getByRole('alert')).toHaveTextContent(/No team assigned/);
    }
  });

  test('Save and Cancel call the page\'s handlers', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<EditStudentDialog open form={STUDENT} onFormChange={() => {}} onClose={onClose} onSave={onSave} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
