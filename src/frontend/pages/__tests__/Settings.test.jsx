import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import api from '../../services/api';
import Settings from '../Settings';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// The professor's list of words that flag a peer evaluation as concerning (AI flag settings).
function renderSettings() {
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/course-management" element={<h1>Course list</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

// The row buttons are icons without a text label, so a row is found by its word (or, while it is
// being edited, by the word in its field) and a button by its place: edit then delete, or save then cancel.
const rowOf = (word) => screen.getAllByRole('listitem').find((li) => within(li).queryByText(word));
const editingRowOf = (value) => screen.getAllByRole('listitem').find((li) => within(li).queryByDisplayValue(value));
const buttonsOf = (row) => within(row).getAllByRole('button');
const editButton = (row) => buttonsOf(row)[0];
const deleteButton = (row) => buttonsOf(row)[1];
const saveButton = (row) => buttonsOf(row)[0];
const cancelButton = (row) => buttonsOf(row)[1];

describe('Settings: flagged words', () => {
  beforeEach(() => {
    api.get.mockResolvedValue({ data: { words: ['harass', 'unfair'] } });
  });
  afterEach(() => jest.resetAllMocks());

  test('lists the professor\'s words from the server', async () => {
    renderSettings();
    expect(await screen.findByText('harass')).toBeInTheDocument();
    expect(screen.getByText('unfair')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/professor/ai-words');
  });

  test('says so when the words cannot be loaded', async () => {
    api.get.mockRejectedValue(new Error('down'));
    renderSettings();
    expect(await screen.findByText('Failed to load words')).toBeInTheDocument();
  });

  test('adds a word, shows the list the server returns, and clears the field', async () => {
    api.post.mockResolvedValue({ data: { words: ['harass', 'unfair', 'bully'] } });
    renderSettings();
    await screen.findByText('harass');

    await userEvent.type(screen.getByLabelText('Add new word'), '  bully ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.post).toHaveBeenCalledWith('/professor/ai-words', { action: 'add', word: 'bully' });
    expect(await screen.findByText('bully')).toBeInTheDocument();
    expect(screen.getByLabelText('Add new word')).toHaveValue('');
  });

  test('does not send a blank word', async () => {
    renderSettings();
    await screen.findByText('harass');

    await userEvent.type(screen.getByLabelText('Add new word'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(api.post).not.toHaveBeenCalled();
  });

  test('deletes a word by its position and shows the list the server returns', async () => {
    api.post.mockResolvedValue({ data: { words: ['unfair'] } });
    renderSettings();
    await screen.findByText('harass');

    await userEvent.click(deleteButton(rowOf('harass')));

    expect(api.post).toHaveBeenCalledWith('/professor/ai-words', { action: 'delete', index: 0 });
    expect(await screen.findByText('unfair')).toBeInTheDocument();
    expect(screen.queryByText('harass')).not.toBeInTheDocument();
  });

  test('edits a word in place and saves it', async () => {
    api.post.mockResolvedValue({ data: { words: ['harass', 'unfairly'] } });
    renderSettings();
    await screen.findByText('unfair');

    await userEvent.click(editButton(rowOf('unfair')));
    const field = screen.getByDisplayValue('unfair');
    await userEvent.clear(field);
    await userEvent.type(field, 'unfairly');
    await userEvent.click(saveButton(editingRowOf('unfairly')));

    expect(api.post).toHaveBeenCalledWith('/professor/ai-words', { action: 'edit', index: 1, word: 'unfairly' });
    expect(await screen.findByText('unfairly')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('unfairly')).not.toBeInTheDocument();
  });

  test('cancelling an edit sends nothing and keeps the word', async () => {
    renderSettings();
    await screen.findByText('unfair');

    await userEvent.click(editButton(rowOf('unfair')));
    await userEvent.click(cancelButton(editingRowOf('unfair')));

    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('unfair')).toBeInTheDocument();
  });

  test('shows an error when a change fails, and keeps the list as it was', async () => {
    api.post.mockRejectedValue(new Error('nope'));
    renderSettings();
    await screen.findByText('harass');

    await userEvent.click(deleteButton(rowOf('harass')));
    expect(await screen.findByText('Failed to delete word')).toBeInTheDocument();
    expect(screen.getByText('harass')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Add new word'), 'bully');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(await screen.findByText('Failed to add word')).toBeInTheDocument();
  });

  test('the back button returns to the course list', async () => {
    renderSettings();
    await screen.findByText('harass');
    await userEvent.click(screen.getByRole('button', { name: /back to courses/i }));
    expect(await screen.findByRole('heading', { name: 'Course list' })).toBeInTheDocument();
  });
});
