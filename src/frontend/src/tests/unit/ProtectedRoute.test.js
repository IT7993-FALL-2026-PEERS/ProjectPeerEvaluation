import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '../../components/ProtectedRoute';

test('renders its children as-is', () => {
  render(
    <ProtectedRoute>
      <p>secret content</p>
    </ProtectedRoute>
  );
  expect(screen.getByText('secret content')).toBeInTheDocument();
});
