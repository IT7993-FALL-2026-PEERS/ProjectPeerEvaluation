// Integration test: renders the real App (real HashRouter, real routes,
// real AuthProvider) and checks that each URL mounts the right page. Only
// the network boundary (services/api, used by StudentEvaluation) is mocked.
import React from 'react';
import { render, screen } from '@testing-library/react';
import App from '../../App';
import { AuthProvider } from '../../contexts/AuthContext';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  getCourseById: jest.fn(),
}));
import api from '../../services/api';

// LoginPage and ResetPassword import axios directly (not through
// services/api). Factory-based, not bare jest.mock('axios') -- see
// LoginFlow.test.js for why.
jest.mock('axios', () => ({ post: jest.fn() }));

function renderAt(hash) {
  window.location.hash = hash;
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

test('/ renders the professor login page', () => {
  renderAt('#/');
  expect(screen.getByRole('heading', { name: 'Professor Login' })).toBeInTheDocument();
});

test('/reset-password/:token renders the reset-password page', () => {
  renderAt('#/reset-password/some-token');
  expect(screen.getByRole('heading', { name: 'Reset Your Password' })).toBeInTheDocument();
});

test('/evaluate/:token loads the evaluation form for that token', async () => {
  api.get.mockResolvedValueOnce({
    data: {
      rubric: { title: 'Team Project Peer Review', description: 'Rate your teammates' },
      course: { name: 'CS 101', number: '101', section: '01' },
      teammates: [],
    },
  });

  renderAt('#/evaluate/student-token-abc');

  expect(await screen.findByText('Team Project Peer Review')).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/evaluate/student-token-abc');
});

test('an unknown route falls back to the debug route list', () => {
  renderAt('#/this-route-does-not-exist');
  expect(screen.getByText('Route Debug Info')).toBeInTheDocument();
});
