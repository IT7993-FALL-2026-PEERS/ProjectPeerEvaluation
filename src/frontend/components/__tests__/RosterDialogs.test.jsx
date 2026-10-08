import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CsvUploadDialog from '../CsvUploadDialog';
import DeleteAllStudentsDialog from '../DeleteAllStudentsDialog';

// The roster upload and delete-everyone dialogs on the Manage Students screen (CICD-57, step 2).
// The page owns the state and the requests; these only show it and report what the professor does.
const user = userEvent.setup({ delay: null });

const csvProps = (overrides = {}) => ({
  open: true, file: null, uploading: false, error: '', results: null,
  onFileChange: () => {}, onUpload: () => {}, onClose: () => {}, ...overrides,
});

describe('CsvUploadDialog', () => {
  test('is not shown while closed', () => {
    render(<CsvUploadDialog {...csvProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('says which columns the file needs, and Upload is off until a file is chosen', () => {
    render(<CsvUploadDialog {...csvProps()} />);
    expect(screen.getByRole('heading', { name: 'Upload Student Roster (CSV)' })).toBeInTheDocument();
    expect(screen.getByText('student_id,name,email,team_name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(screen.queryByText(/Selected:/)).not.toBeInTheDocument();
  });

  test('shows the chosen file, and Upload then calls the page', async () => {
    const onUpload = jest.fn();
    render(<CsvUploadDialog {...csvProps({ file: { name: 'roster.csv' }, onUpload })} />);
    expect(screen.getByText('Selected: roster.csv')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).toHaveBeenCalledTimes(1);
  });

  test('passes the chosen file\'s event to the page', async () => {
    const onFileChange = jest.fn();
    render(<CsvUploadDialog {...csvProps({ onFileChange })} />);

    await user.upload(screen.getByLabelText('Choose CSV File'), new File(['a,b'], 'roster.csv', { type: 'text/csv' }));

    expect(onFileChange).toHaveBeenCalledTimes(1);
    expect(onFileChange.mock.calls[0][0].target.files[0].name).toBe('roster.csv');
  });

  test('while uploading, shows progress and cannot be pressed again', () => {
    render(<CsvUploadDialog {...csvProps({ file: { name: 'roster.csv' }, uploading: true })} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uploading...' })).toBeDisabled();
  });

  test('shows the error', () => {
    render(<CsvUploadDialog {...csvProps({ error: 'The file has no students.' })} />);
    expect(screen.getByRole('alert')).toHaveTextContent('The file has no students.');
  });

  test('shows a clean result as a success, with the counts and team names', () => {
    render(<CsvUploadDialog {...csvProps({
      results: { message: '2 students added successfully', students: [{}, {}], teams_created: 1, team_names: ['Gamma', 'Delta'], errors: [] },
    })} />);

    expect(screen.getByText('2 students added successfully')).toBeInTheDocument();
    expect(screen.getByText('Students added: 2')).toBeInTheDocument();
    expect(screen.getByText('Teams created: 1')).toBeInTheDocument();
    expect(screen.getByText('Team names: Gamma, Delta')).toBeInTheDocument();
    expect(screen.queryByText('Errors:')).not.toBeInTheDocument();
  });

  test('a result with row errors is a warning that lists each one', () => {
    render(<CsvUploadDialog {...csvProps({
      results: { message: '1 student added', students: [{}], errors: ['Row 3: email is missing', 'Row 5: name is missing'] },
    })} />);

    expect(screen.getByText('Errors:')).toBeInTheDocument();
    expect(screen.getByText('• Row 3: email is missing')).toBeInTheDocument();
    expect(screen.getByText('• Row 5: name is missing')).toBeInTheDocument();
    expect(screen.queryByText(/Teams created/)).not.toBeInTheDocument();
  });

  test('Close calls the page', async () => {
    const onClose = jest.fn();
    render(<CsvUploadDialog {...csvProps({ onClose })} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

const deleteProps = (overrides = {}) => ({
  open: true, studentCount: 4, loading: false, onClose: () => {}, onConfirm: () => {}, onMismatch: () => {}, ...overrides,
});

describe('DeleteAllStudentsDialog', () => {
  test('is not shown while closed', () => {
    render(<DeleteAllStudentsDialog {...deleteProps({ open: false })} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('says how many students will go, along with the teams', () => {
    render(<DeleteAllStudentsDialog {...deleteProps({ studentCount: 7 })} />);
    expect(screen.getByRole('heading', { name: 'Delete All Students' })).toBeInTheDocument();
    expect(screen.getByText('Delete all 7 students from the course')).toBeInTheDocument();
    expect(screen.getByText('Delete all teams (since they will be empty)')).toBeInTheDocument();
  });

  test('typing the wrong words does not delete; the page is told instead', async () => {
    const onConfirm = jest.fn();
    const onMismatch = jest.fn();
    render(<DeleteAllStudentsDialog {...deleteProps({ onConfirm, onMismatch })} />);

    await user.type(screen.getByPlaceholderText('Type DELETE ALL to confirm'), 'delete all');
    await user.click(screen.getByRole('button', { name: 'Delete All Students' }));

    expect(onMismatch).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('an empty box is not a confirmation either', async () => {
    const onConfirm = jest.fn();
    const onMismatch = jest.fn();
    render(<DeleteAllStudentsDialog {...deleteProps({ onConfirm, onMismatch })} />);

    await user.click(screen.getByRole('button', { name: 'Delete All Students' }));

    expect(onMismatch).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('typing DELETE ALL exactly confirms', async () => {
    const onConfirm = jest.fn();
    const onMismatch = jest.fn();
    render(<DeleteAllStudentsDialog {...deleteProps({ onConfirm, onMismatch })} />);

    await user.type(screen.getByPlaceholderText('Type DELETE ALL to confirm'), 'DELETE ALL');
    await user.click(screen.getByRole('button', { name: 'Delete All Students' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onMismatch).not.toHaveBeenCalled();
  });

  test('cannot be pressed with no students, or while deleting', () => {
    const { rerender } = render(<DeleteAllStudentsDialog {...deleteProps({ studentCount: 0 })} />);
    expect(screen.getByRole('button', { name: 'Delete All Students' })).toBeDisabled();

    rerender(<DeleteAllStudentsDialog {...deleteProps({ loading: true })} />);
    expect(screen.getByRole('button', { name: 'Deleting...' })).toBeDisabled();
  });

  test('Cancel calls the page, and the typed words are gone when it opens again', async () => {
    const onClose = jest.fn();
    const { rerender } = render(<DeleteAllStudentsDialog {...deleteProps({ onClose })} />);
    await user.type(screen.getByPlaceholderText('Type DELETE ALL to confirm'), 'DELETE ALL');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(<DeleteAllStudentsDialog {...deleteProps({ open: false })} />);
    // MUI keeps the dialog mounted while it fades out; a real reopen comes after that.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    rerender(<DeleteAllStudentsDialog {...deleteProps({ open: true })} />);
    expect(await screen.findByPlaceholderText('Type DELETE ALL to confirm')).toHaveValue('');
  });
});
