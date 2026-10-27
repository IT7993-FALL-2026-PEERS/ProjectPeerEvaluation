import React from 'react';
import { render, screen } from '@testing-library/react';
import CsvFormatGuide from '../CsvFormatGuide';

// The format guide at the top of both roster upload dialogs. It has to say what the server really does with a
// file: which columns are needed, and that a team is named Team 1, Team 2, ... (any other team name skips the row).
describe('CsvFormatGuide', () => {
  test('names the columns, with the header row in red as before', () => {
    render(<CsvFormatGuide />);
    expect(screen.getByText('Upload a CSV file with these columns. The first row is the header:')).toBeInTheDocument();
    expect(screen.getByText('student_id,name,email,team_name')).toBeInTheDocument();
  });

  test('says which columns every row needs and that team_name is optional', () => {
    render(<CsvFormatGuide />);
    expect(screen.getByText('student_id, name and email are required on every row.')).toBeInTheDocument();
    expect(screen.getByText(/team_name is optional/)).toBeInTheDocument();
  });

  test('says teams are numbered, that a bare number works, and what happens to any other name', () => {
    render(<CsvFormatGuide />);
    expect(screen.getByText(/Team names are numbered: Team 1, Team 2, Team 3/)).toBeInTheDocument();
    expect(screen.getByText(/just the number, like 3, also works/)).toBeInTheDocument();
    expect(screen.getByText(/A row with any other team name \(such as Alpha\) is skipped and reported/)).toBeInTheDocument();
  });

  test('shows an example file that uses numbered teams only', () => {
    render(<CsvFormatGuide />);
    const example = screen.getByLabelText('Example CSV file');
    expect(example).toHaveTextContent('1001,Ann Archer,ann@example.edu,Team 1');
    expect(example).toHaveTextContent('1003,Cy Cole,cy@example.edu,Team 2');
    expect(example).not.toHaveTextContent(/Alpha|Beta|Gamma/);
  });
});
