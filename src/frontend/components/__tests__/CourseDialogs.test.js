import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentsDialog from '../StudentsDialog';
import { CreateCourseDialog, EditCourseDialog } from '../CourseFormDialogs';
import DeleteCourseDialog from '../DeleteCourseDialog';
import CourseRosterUploadDialog from '../CourseRosterUploadDialog';

// The Manage Students list and the four course dialogs (CICD-57, step 5). The page owns the data
// and the requests; these show it and report what the professor presses.
const user = userEvent.setup({ delay: null });

const COURSE = { _id: 'c1', course_number: 'CS 4850', course_section: '01', course_name: 'Capstone' };
const STUDENTS = [
  { _id: 's1', student_id: '1001', name: 'Ann Archer', email: 'ann@example.edu', group_assignment: 'Alpha' },
  { _id: 's2', student_id: '1002', name: 'Ben Baker', email: 'ben@example.edu', group_assignment: 'Alpha' },
  { _id: 's3', student_id: '2001', name: 'Eve Evans', email: 'eve@school.org', group_assignment: '' },
];
const NO_SEARCH = { student_id: '', name: '', email: '', team: '' };

const studentsProps = (overrides = {}) => ({
  open: true, course: COURSE, students: STUDENTS, loading: false, search: NO_SEARCH, showSearch: false,
  onToggleSearch: () => {}, onSearchChange: () => {}, onClearSearch: () => {},
  onUploadCsv: () => {}, onAddStudent: () => {}, onEdit: () => {}, onDelete: () => {}, onDeleteAll: () => {},
  onClose: () => {},
  ...overrides,
});

// The student names in the table, top to bottom.
const studentNames = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[1].textContent);

describe('StudentsDialog', () => {
  test('is not shown while closed', () => {
    render(<StudentsDialog {...studentsProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('names the course in its title, falling back to the course code', () => {
    const { rerender } = render(<StudentsDialog {...studentsProps()} />);
    expect(screen.getByRole('heading', { name: 'Manage Students for CS 4850 01 - Capstone' })).toBeInTheDocument();

    rerender(<StudentsDialog {...studentsProps({ course: { _id: 'c2', course_code: 'IT 3100', course_name: 'Databases' } })} />);
    expect(screen.getByRole('heading', { name: 'Manage Students for IT 3100 - Databases' })).toBeInTheDocument();
  });

  test('shows a progress bar instead of the table while the students load', () => {
    render(<StudentsDialog {...studentsProps({ loading: true })} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('lists each student with ID, name, email and team, or "Not assigned"', () => {
    render(<StudentsDialog {...studentsProps()} />);
    expect(studentNames()).toEqual(['Ann Archer', 'Ben Baker', 'Eve Evans']);
    expect(screen.getByRole('row', { name: /Ann Archer/ })).toHaveTextContent('1001');
    expect(screen.getByRole('row', { name: /Ann Archer/ })).toHaveTextContent('ann@example.edu');
    expect(screen.getByRole('row', { name: /Ann Archer/ })).toHaveTextContent('Alpha');
    expect(screen.getByRole('row', { name: /Eve Evans/ })).toHaveTextContent('Not assigned');
  });

  test('says there are no students when the course has none', () => {
    render(<StudentsDialog {...studentsProps({ students: [] })} />);
    expect(screen.getByText('No students found for this course.')).toBeInTheDocument();
  });

  test('says nothing matches when the search hides every student', () => {
    render(<StudentsDialog {...studentsProps({ search: { ...NO_SEARCH, name: 'zzz' } })} />);
    expect(screen.getByText('No students match your search criteria.')).toBeInTheDocument();
  });

  test.each([
    ['ID', { student_id: '200' }, ['Eve Evans']],
    ['name, without regard to case', { name: 'BEN' }, ['Ben Baker']],
    ['email', { email: 'school.org' }, ['Eve Evans']],
    ['team', { team: 'alp' }, ['Ann Archer', 'Ben Baker']],
    ['several fields at once', { team: 'alpha', name: 'ann' }, ['Ann Archer']],
  ])('filters by %s', (_label, change, expected) => {
    render(<StudentsDialog {...studentsProps({ showSearch: true, search: { ...NO_SEARCH, ...change } })} />);
    expect(studentNames()).toEqual(expected);
    expect(screen.getByText(`Search Students (${expected.length} of 3)`)).toBeInTheDocument();
  });

  test('the team search leaves out students on other teams', () => {
    const students = [...STUDENTS, { _id: 's4', student_id: '3001', name: 'Fay Foster', email: 'fay@example.edu', group_assignment: 'Gamma' }];
    render(<StudentsDialog {...studentsProps({ students, showSearch: true, search: { ...NO_SEARCH, team: 'alpha' } })} />);
    expect(studentNames()).toEqual(['Ann Archer', 'Ben Baker']);
  });

  test('the search button reads Show Search or Hide Search and toggles it', async () => {
    const onToggleSearch = jest.fn();
    const { rerender } = render(<StudentsDialog {...studentsProps({ onToggleSearch })} />);
    await user.click(screen.getByRole('button', { name: 'Show Search' }));
    expect(onToggleSearch).toHaveBeenCalledTimes(1);

    rerender(<StudentsDialog {...studentsProps({ onToggleSearch, showSearch: true })} />);
    expect(screen.getByRole('button', { name: 'Hide Search' })).toBeInTheDocument();
  });

  test('the search card is hidden until Show Search', () => {
    const { rerender } = render(<StudentsDialog {...studentsProps()} />);
    expect(screen.getByText(/Search Students \(/)).not.toBeVisible();

    rerender(<StudentsDialog {...studentsProps({ showSearch: true })} />);
    expect(screen.getByText(/Search Students \(/)).toBeVisible();
  });

  test('typing in each search field reports the field and its value', () => {
    const onSearchChange = jest.fn();
    render(<StudentsDialog {...studentsProps({ showSearch: true, onSearchChange })} />);

    for (const [label, field] of [['Student ID', 'student_id'], ['Name', 'name'], ['Email', 'email'], ['Team', 'team']]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value: 'x' } });
      expect(onSearchChange).toHaveBeenLastCalledWith(field, 'x');
    }
  });

  test('Clear Search is off until a search is typed, then clears it', async () => {
    const onClearSearch = jest.fn();
    const { rerender } = render(<StudentsDialog {...studentsProps({ showSearch: true, onClearSearch })} />);
    expect(screen.getByRole('button', { name: 'Clear Search' })).toBeDisabled();

    for (const field of ['student_id', 'name', 'email', 'team']) {
      rerender(<StudentsDialog {...studentsProps({ showSearch: true, onClearSearch, search: { ...NO_SEARCH, [field]: 'x' } })} />);
      expect(screen.getByRole('button', { name: 'Clear Search' })).toBeEnabled();
    }
    await user.click(screen.getByRole('button', { name: 'Clear Search' }));
    expect(onClearSearch).toHaveBeenCalledTimes(1);
  });

  test('the row buttons report the student they belong to', async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    render(<StudentsDialog {...studentsProps({ onEdit, onDelete })} />);
    const row = screen.getByRole('row', { name: /Ben Baker/ });

    await user.click(within(row).getByTitle('Edit Student'));
    expect(onEdit).toHaveBeenCalledWith(STUDENTS[1]);
    await user.click(within(row).getByTitle('Delete Student'));
    expect(onDelete).toHaveBeenCalledWith(STUDENTS[1]);
  });

  test('Upload CSV, Add Student, Delete All Students and Close call the page\'s handlers', async () => {
    const handlers = { onUploadCsv: jest.fn(), onAddStudent: jest.fn(), onDeleteAll: jest.fn(), onClose: jest.fn() };
    render(<StudentsDialog {...studentsProps(handlers)} />);

    await user.click(screen.getByRole('button', { name: 'Upload CSV' }));
    await user.click(screen.getByRole('button', { name: 'Add Student' }));
    await user.click(screen.getByRole('button', { name: 'Delete All Students' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    for (const handler of Object.values(handlers)) expect(handler).toHaveBeenCalledTimes(1);
  });

  test('Delete All Students is off when there are no students', () => {
    render(<StudentsDialog {...studentsProps({ students: [] })} />);
    expect(screen.getByRole('button', { name: 'Delete All Students' })).toBeDisabled();
  });
});

const EMPTY_COURSE = { course_name: '', course_number: '', course_section: '', semester: '' };
const FULL_COURSE = { course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026' };

describe('CreateCourseDialog', () => {
  const props = (overrides = {}) => ({ open: true, form: EMPTY_COURSE, onFormChange: () => {}, onClose: () => {}, onCreate: () => {}, ...overrides });

  test('is not shown while closed', () => {
    render(<CreateCourseDialog {...props({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('has four fields with example text, and the first is focused', () => {
    render(<CreateCourseDialog {...props()} />);
    expect(screen.getByRole('heading', { name: 'Create New Course' })).toBeInTheDocument();
    expect(screen.getByLabelText('Course Name')).toHaveAttribute('placeholder', 'Software Engineering');
    expect(screen.getByLabelText('Course Number')).toHaveAttribute('placeholder', 'CS 4850');
    expect(screen.getByLabelText('Course Section')).toHaveAttribute('placeholder', '01');
    expect(screen.getByLabelText('Semester')).toHaveAttribute('placeholder', 'Fall 2025');
    expect(screen.getByLabelText('Course Name')).toHaveFocus();
  });

  test.each([
    ['Course Name', 'course_name'],
    ['Course Number', 'course_number'],
    ['Course Section', 'course_section'],
    ['Semester', 'semester'],
  ])('typing in %s reports the whole form with that field changed', (label, field) => {
    const onFormChange = jest.fn();
    render(<CreateCourseDialog {...props({ form: FULL_COURSE, onFormChange })} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'new' } });
    expect(onFormChange).toHaveBeenCalledWith({ ...FULL_COURSE, [field]: 'new' });
  });

  test.each(Object.keys(FULL_COURSE))('Create is off while %s is empty', (field) => {
    render(<CreateCourseDialog {...props({ form: { ...FULL_COURSE, [field]: '' } })} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled();
  });

  test('Cancel and Create call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onCreate = jest.fn();
    render(<CreateCourseDialog {...props({ form: FULL_COURSE, onClose, onCreate })} />);
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('EditCourseDialog', () => {
  const EDIT = { ...FULL_COURSE, course_status: 'Active' };
  const props = (overrides = {}) => ({ open: true, form: EDIT, onFormChange: () => {}, onClose: () => {}, onSave: () => {}, ...overrides });

  test('is not shown while closed', () => {
    render(<EditCourseDialog {...props({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('shows the course\'s fields and status, with the first field focused', () => {
    render(<EditCourseDialog {...props()} />);
    expect(screen.getByRole('heading', { name: 'Edit Course' })).toBeInTheDocument();
    expect(screen.getByLabelText('Course Name')).toHaveValue('Capstone');
    expect(screen.getByLabelText('Course Number')).toHaveValue('CS 4850');
    expect(screen.getByLabelText('Course Section')).toHaveValue('01');
    expect(screen.getByLabelText('Semester')).toHaveValue('Fall 2026');
    expect(screen.getByRole('combobox')).toHaveTextContent('Active');
    expect(screen.getByLabelText('Course Name')).toHaveFocus();
  });

  test('asks the browser not to autofill the four text fields', () => {
    render(<EditCourseDialog {...props()} />);
    for (const label of ['Course Name', 'Course Number', 'Course Section', 'Semester']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', 'off');
    }
  });

  test.each([
    ['Course Name', 'course_name'],
    ['Course Number', 'course_number'],
    ['Course Section', 'course_section'],
    ['Semester', 'semester'],
  ])('typing in %s reports the whole form with that field changed', (label, field) => {
    const onFormChange = jest.fn();
    render(<EditCourseDialog {...props({ onFormChange })} />);
    fireEvent.change(screen.getByLabelText(label), { target: { value: 'new' } });
    expect(onFormChange).toHaveBeenCalledWith({ ...EDIT, [field]: 'new' });
  });

  test('choosing a status reports the whole form with the new status', async () => {
    const onFormChange = jest.fn();
    render(<EditCourseDialog {...props({ onFormChange })} />);
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(onFormChange).toHaveBeenCalledWith({ ...EDIT, course_status: 'Inactive' });
  });

  test.each(Object.keys(FULL_COURSE))('Save is off while %s is empty', (field) => {
    render(<EditCourseDialog {...props({ form: { ...EDIT, [field]: '' } })} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('Cancel and Save call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(<EditCourseDialog {...props({ onClose, onSave })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteCourseDialog', () => {
  test('is not shown while closed', () => {
    render(<DeleteCourseDialog open={false} onClose={() => {}} onConfirm={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('asks whether to delete the course, and Cancel and Delete call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    render(<DeleteCourseDialog open onClose={onClose} onConfirm={onConfirm} />);
    expect(screen.getByRole('heading', { name: 'Delete Course' })).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this course?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('CourseRosterUploadDialog', () => {
  const props = (overrides = {}) => ({
    open: true, file: null, progress: 0, onFileChange: () => {}, onClose: () => {}, onUpload: () => {},
    ...overrides,
  });
  const csv = new File(['student_id,name,email,team_name'], 'roster.csv', { type: 'text/csv' });

  test('is not shown while closed', () => {
    render(<CourseRosterUploadDialog {...props({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('explains the columns the file needs and has one file input for CSV', () => {
    render(<CourseRosterUploadDialog {...props()} />);
    expect(screen.getByRole('heading', { name: 'Upload Student Roster' })).toBeInTheDocument();
    expect(screen.getByText('student_id,name,email,team_name')).toBeInTheDocument();
    expect(screen.getByLabelText('Select CSV File')).toHaveAttribute('accept', '.csv');
  });

  test('choosing a file reports it, and its name is shown once the page passes it back', async () => {
    const onFileChange = jest.fn();
    const { rerender } = render(<CourseRosterUploadDialog {...props({ onFileChange })} />);
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();

    await user.upload(screen.getByLabelText('Select CSV File'), csv);
    expect(onFileChange).toHaveBeenCalledWith(csv);

    rerender(<CourseRosterUploadDialog {...props({ onFileChange, file: csv })} />);
    expect(screen.getByText('Selected: roster.csv')).toBeInTheDocument();
  });

  test('choosing the same file again still counts, because the input is cleared when it is clicked', async () => {
    const onFileChange = jest.fn();
    render(<CourseRosterUploadDialog {...props({ onFileChange })} />);
    const input = screen.getByLabelText('Select CSV File');

    await user.upload(input, csv);
    expect(onFileChange).toHaveBeenCalledTimes(1);
    await user.upload(input, csv);
    expect(onFileChange).toHaveBeenCalledTimes(2);
  });

  test('Upload is off until a file is chosen, and while an upload is running', () => {
    const { rerender } = render(<CourseRosterUploadDialog {...props()} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();

    rerender(<CourseRosterUploadDialog {...props({ file: csv })} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeEnabled();

    rerender(<CourseRosterUploadDialog {...props({ file: csv, progress: 40 })} />);
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  });

  test('shows the progress bar only while an upload is running', () => {
    const { rerender } = render(<CourseRosterUploadDialog {...props({ file: csv })} />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    rerender(<CourseRosterUploadDialog {...props({ file: csv, progress: 40 })} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  test('Cancel and Upload call the page\'s handlers', async () => {
    const onClose = jest.fn();
    const onUpload = jest.fn();
    render(<CourseRosterUploadDialog {...props({ file: csv, onClose, onUpload })} />);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpload).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  test('Escape closes it the same way as Cancel, so the page forgets the file', async () => {
    const onClose = jest.fn();
    render(<CourseRosterUploadDialog {...props({ file: csv, onClose })} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
