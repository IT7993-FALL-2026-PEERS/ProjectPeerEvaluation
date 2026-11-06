import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OnPrivatePages from '../OnPrivatePages';

// CICD-76: the 'session timed out' banner is for a professor in the middle of their work. Pages a visitor can open
// without a login (the login page, password reset, email confirmation, a student's evaluation link) have no work to
// keep, so what the banner would say there is wrong.
const at = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <OnPrivatePages><p>Banner here</p></OnPrivatePages>
  </MemoryRouter>
);

describe('OnPrivatePages', () => {
  test.each(['/course-management', '/reports', '/settings'])('shows its content on %s', (path) => {
    at(path);
    expect(screen.getByText('Banner here')).toBeInTheDocument();
  });

  test.each(['/', '/reset-password/abc123', '/verify-email/abc123', '/evaluate/abc123'])('shows nothing on %s', (path) => {
    at(path);
    expect(screen.queryByText('Banner here')).not.toBeInTheDocument();
  });

  test('a path that only starts like a public one is private', () => {
    at('/reset-password-admin');
    expect(screen.getByText('Banner here')).toBeInTheDocument();
  });
});
