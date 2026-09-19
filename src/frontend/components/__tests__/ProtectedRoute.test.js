import React from 'react';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '../ProtectedRoute';

describe('ProtectedRoute', () => {
  it('renders its children', () => {
    render(
      <ProtectedRoute>
        <div>Secret Dashboard</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});
