import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseSearchFilters from '../CourseSearchFilters';
import CourseTable from '../CourseTable';

// The course list's own controls: the search filters and the table with its action buttons
// (CICD-57, step 6). The page owns the courses, the filters and every request; these show them and
// report what the professor presses.
const user = userEvent.setup({ delay: null });

const FILTERS = { course_name: '', course_number: '', course_section: '', semester: '', course_status: 'Active' };

const filterProps = (overrides = {}) => ({
  filters: FILTERS, show: true, onToggle: () => {}, onChange: () => {}, onSearch: () => {}, onClear: () => {},
  ...overrides,
});

describe('CourseSearchFilters', () => {
  test('offers to show the filters while they are hidden, and to hide them while they are shown', () => {
    const { rerender } = render(<CourseSearchFilters {...filterProps({ show: false })} />);
    expect(screen.getByRole('heading', { name: 'Search Courses' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Filters' })).toBeInTheDocument();
    expect(screen.getByLabelText('Course Name')).not.toBeVisible();

    rerender(<CourseSearchFilters {...filterProps({ show: true })} />);
    expect(screen.getByRole('button', { name: 'Hide Filters' })).toBeInTheDocument();
    expect(screen.getByLabelText('Course Name')).toBeVisible();
  });

  test('the toggle button reports a press', async () => {
    const onToggle = jest.fn();
    render(<CourseSearchFilters {...filterProps({ onToggle })} />);

    await user.click(screen.getByRole('button', { name: 'Hide Filters' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('shows each filter\'s current value and a hint of what to type', () => {
    const filters = { course_name: 'Data', course_number: 'IT 3100', course_section: '02', semester: 'Fall 2026', course_status: 'Inactive' };
    render(<CourseSearchFilters {...filterProps({ filters })} />);

    expect(screen.getByLabelText('Course Name')).toHaveValue('Data');
    expect(screen.getByLabelText('Course Number')).toHaveValue('IT 3100');
    expect(screen.getByLabelText('Course Section')).toHaveValue('02');
    expect(screen.getByLabelText('Semester')).toHaveValue('Fall 2026');
    expect(screen.getByRole('combobox')).toHaveTextContent('Inactive');
  });

  test('hints at what to type in each empty field', () => {
    render(<CourseSearchFilters {...filterProps()} />);

    expect(screen.getByLabelText('Course Name')).toHaveAttribute('placeholder', 'Software Engineering');
    expect(screen.getByLabelText('Course Number')).toHaveAttribute('placeholder', 'CS 4850');
    expect(screen.getByLabelText('Course Section')).toHaveAttribute('placeholder', '01');
    expect(screen.getByLabelText('Semester')).toHaveAttribute('placeholder', 'Fall 2025');
  });

  test('typing in a field reports every filter with that one changed', () => {
    const onChange = jest.fn();
    const filters = { ...FILTERS, course_number: 'CS' };
    render(<CourseSearchFilters {...filterProps({ filters, onChange })} />);

    fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: 'Data' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, course_name: 'Data' });

    fireEvent.change(screen.getByLabelText('Course Number'), { target: { value: 'IT' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, course_number: 'IT' });

    fireEvent.change(screen.getByLabelText('Course Section'), { target: { value: '02' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, course_section: '02' });

    fireEvent.change(screen.getByLabelText('Semester'), { target: { value: 'Spring' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...filters, semester: 'Spring' });
  });

  test('the status can be Active, Inactive or All (an empty value), and each choice is reported', async () => {
    const onChange = jest.fn();
    render(<CourseSearchFilters {...filterProps({ onChange })} />);

    await user.click(screen.getByRole('combobox'));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Active', 'Inactive', 'All']);

    await user.click(screen.getByRole('option', { name: 'Inactive' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTERS, course_status: 'Inactive' });

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('option', { name: 'All' }));
    expect(onChange).toHaveBeenLastCalledWith({ ...FILTERS, course_status: '' });
  });

  test('Search and Clear report a press', async () => {
    const onSearch = jest.fn();
    const onClear = jest.fn();
    render(<CourseSearchFilters {...filterProps({ onSearch, onClear })} />);

    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

const COURSES = [
  { _id: 'c1', course_name: 'Capstone', course_number: 'CS 4850', course_section: '01', semester: 'Fall 2026', student_count: 4, team_count: 2, course_status: 'Active' },
  { _id: 'c2', course_name: 'Databases', course_code: 'IT 3100', semester: 'Spring 2027', course_status: 'Inactive' },
];
const SORT = { key: 'course_name', direction: 'asc' };
const ACTIONS = ['Upload Roster', 'Manage Students', 'Manage Teams', 'Send Evaluations', 'Evaluation Status', 'View Reports', 'Delete Course', 'Edit Course'];

const tableProps = (overrides = {}) => ({
  courses: COURSES, loading: false, sortConfig: SORT, sendingIds: {},
  onSort: () => {}, onUploadRoster: () => {}, onManageStudents: () => {}, onManageTeams: () => {},
  onSendEvaluations: () => {}, onEvaluationStatus: () => {}, onViewReports: () => {}, onDelete: () => {}, onEdit: () => {},
  ...overrides,
});

// The data rows (not the header), as the text of each of their cells.
const rowCells = () => screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
const courseNames = () => rowCells().map((cells) => cells[0]);

describe('CourseTable', () => {
  test('has a header for every column', () => {
    render(<CourseTable {...tableProps()} />);

    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual([
      'Course Name ▲', 'Course Number ', 'Course Section', 'Semester ', 'Students', 'Teams', 'Status', 'Actions',
    ]);
  });

  test('shows a progress bar instead of the courses while they load', () => {
    render(<CourseTable {...tableProps({ loading: true })} />);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.queryByText('Capstone')).not.toBeInTheDocument();
    expect(screen.queryByText(/No courses found/)).not.toBeInTheDocument();
  });

  test('says so when there are no courses', () => {
    render(<CourseTable {...tableProps({ courses: [] })} />);

    expect(screen.getByText('No courses found. Create your first course to get started.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('shows one row per course with its number, section, semester and counts', () => {
    render(<CourseTable {...tableProps()} />);

    expect(rowCells().map((cells) => cells.slice(0, 6))).toEqual([
      ['Capstone', 'CS 4850', '01', 'Fall 2026', '4', '2'],
      // No number (the old course code stands in), no section, no counts.
      ['Databases', 'IT 3100', 'N/A', 'Spring 2027', '0', '0'],
    ]);
  });

  test('shows N/A when a course has neither a number nor a code', () => {
    render(<CourseTable {...tableProps({ courses: [{ _id: 'c3', course_name: 'Bare', semester: 'Fall 2026' }] })} />);

    expect(rowCells()[0][1]).toBe('N/A');
  });

  test('counts only whole, positive team numbers', () => {
    const courses = ['2', 2.5, -1, null].map((team_count, i) => ({ _id: `t${i}`, course_name: `C${i}`, team_count }));
    render(<CourseTable {...tableProps({ courses })} />);

    expect(rowCells().map((cells) => cells[5])).toEqual(['0', '0', '0', '0']);
  });

  test('shows the status, Active when a course has none, and colours only Active', () => {
    render(<CourseTable {...tableProps({ courses: [...COURSES, { _id: 'c3', course_name: 'Plain' }] })} />);

    // MUI paints the colour on the chip's own element, which has no role to look it up by.
    // eslint-disable-next-line testing-library/no-node-access
    const statusChips = screen.getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell')[6].firstChild);
    expect(statusChips.map((chip) => chip.textContent)).toEqual(['Active', 'Inactive', 'Active']);
    expect(statusChips[0]).toHaveClass('MuiChip-colorSuccess');
    expect(statusChips[1]).not.toHaveClass('MuiChip-colorSuccess');
    // No status on the course: the label says Active, but the colour is not the success colour.
    expect(statusChips[2]).not.toHaveClass('MuiChip-colorSuccess');
  });

  test('lists the courses in the order of the sort it is given', () => {
    const { rerender } = render(<CourseTable {...tableProps()} />);
    expect(courseNames()).toEqual(['Capstone', 'Databases']);

    rerender(<CourseTable {...tableProps({ sortConfig: { key: 'course_name', direction: 'desc' } })} />);
    expect(courseNames()).toEqual(['Databases', 'Capstone']);

    rerender(<CourseTable {...tableProps({ sortConfig: { key: 'semester', direction: 'asc' } })} />);
    expect(courseNames()).toEqual(['Capstone', 'Databases']);
    rerender(<CourseTable {...tableProps({ sortConfig: { key: 'semester', direction: 'desc' } })} />);
    expect(courseNames()).toEqual(['Databases', 'Capstone']);
  });

  test('puts an arrow on the sorted column only: up for ascending, down for descending', () => {
    const { rerender } = render(<CourseTable {...tableProps({ sortConfig: { key: 'semester', direction: 'asc' } })} />);
    const headers = () => screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers().slice(0, 4)).toEqual(['Course Name ', 'Course Number ', 'Course Section', 'Semester ▲']);

    rerender(<CourseTable {...tableProps({ sortConfig: { key: 'course_number', direction: 'desc' } })} />);
    expect(headers().slice(0, 4)).toEqual(['Course Name ', 'Course Number ▼', 'Course Section', 'Semester ']);
  });

  test('clicking Course Name, Course Number or Semester reports that column; the others do not sort', async () => {
    const onSort = jest.fn();
    render(<CourseTable {...tableProps({ onSort })} />);

    await user.click(screen.getByRole('columnheader', { name: /^Course Name/ }));
    expect(onSort).toHaveBeenLastCalledWith('course_name');
    await user.click(screen.getByRole('columnheader', { name: /^Course Number/ }));
    expect(onSort).toHaveBeenLastCalledWith('course_number');
    await user.click(screen.getByRole('columnheader', { name: /^Semester/ }));
    expect(onSort).toHaveBeenLastCalledWith('semester');
    expect(onSort).toHaveBeenCalledTimes(3);

    for (const name of ['Course Section', 'Students', 'Teams', 'Status', 'Actions']) {
      await user.click(screen.getByRole('columnheader', { name }));
    }
    expect(onSort).toHaveBeenCalledTimes(3);
  });

  test('every row has all eight actions', () => {
    render(<CourseTable {...tableProps()} />);

    for (const row of screen.getAllByRole('row').slice(1)) {
      expect(within(row).getAllByRole('button').map((b) => b.getAttribute('title'))).toEqual(ACTIONS);
    }
  });

  test.each([
    ['Upload Roster', 'onUploadRoster'],
    ['Manage Students', 'onManageStudents'],
    ['Manage Teams', 'onManageTeams'],
    ['Send Evaluations', 'onSendEvaluations'],
    ['Evaluation Status', 'onEvaluationStatus'],
    ['View Reports', 'onViewReports'],
    ['Delete Course', 'onDelete'],
    ['Edit Course', 'onEdit'],
  ])('%s reports the course of the row it is in', async (title, handler) => {
    const handlers = { onUploadRoster: jest.fn(), onManageStudents: jest.fn(), onManageTeams: jest.fn(), onSendEvaluations: jest.fn(), onEvaluationStatus: jest.fn(), onViewReports: jest.fn(), onDelete: jest.fn(), onEdit: jest.fn() };
    render(<CourseTable {...tableProps(handlers)} />);

    await user.click(within(screen.getByRole('row', { name: /Databases/ })).getByTitle(title));

    expect(handlers[handler]).toHaveBeenCalledTimes(1);
    expect(handlers[handler]).toHaveBeenCalledWith(COURSES[1]);
    Object.entries(handlers).filter(([name]) => name !== handler).forEach(([, fn]) => expect(fn).not.toHaveBeenCalled());
  });

  test('a course sending its evaluations shows a spinner and cannot send again; the others can', () => {
    render(<CourseTable {...tableProps({ sendingIds: { c1: true } })} />);

    const sendIn = (name) => within(screen.getByRole('row', { name: new RegExp(name) })).getByTitle('Send Evaluations');
    expect(sendIn('Capstone')).toBeDisabled();
    expect(within(sendIn('Capstone')).getByRole('progressbar')).toBeInTheDocument();
    expect(sendIn('Databases')).toBeEnabled();
    expect(within(sendIn('Databases')).queryByRole('progressbar')).not.toBeInTheDocument();
  });

  test('knows a course by its id when it has no _id', () => {
    const course = { id: 'plain-id', course_name: 'Legacy', semester: 'Fall 2026' };
    render(<CourseTable {...tableProps({ courses: [course], sendingIds: { 'plain-id': true } })} />);

    expect(screen.getByTitle('Send Evaluations')).toBeDisabled();
    expect(within(screen.getByTitle('Send Evaluations')).getByRole('progressbar')).toBeInTheDocument();
  });
});
