const app = require('../../index');
const request = require('supertest');
const authRouter = require('../../routes/auth');
const coursesRouter = require('../../routes/courses');
const evaluateRouter = require('../../routes/evaluate');
const aiRouter = require('../../routes/ai');
const professorRouter = require('../../routes/professor');

function collectRouterRoutes(router, mountPath) {
  const routes = [];

  for (const layer of router.stack) {
    if (!layer.route) continue;
    const methods = Object.keys(layer.route.methods || {});
    const fullPath = `${mountPath}${layer.route.path}`;
    methods.forEach((method) => routes.push(`${method.toUpperCase()} ${fullPath}`));
  }

  return routes;
}

const routes = [
  ...collectRouterRoutes(authRouter, '/api/auth'),
  ...collectRouterRoutes(coursesRouter, '/api/courses'),
  ...collectRouterRoutes(evaluateRouter, '/api/evaluate'),
  ...collectRouterRoutes(aiRouter, '/api/ai'),
  ...collectRouterRoutes(professorRouter, '/api/professor')
];

const expectedRoutes = new Set([
  'POST /api/auth/login',
  'POST /api/auth/register',
  'POST /api/auth/logout',
  'POST /api/auth/refresh',
  'POST /api/auth/verify-mfa',
  'POST /api/auth/reset-password',
  'POST /api/auth/update-password',
  'GET /api/courses/',
  'POST /api/courses/',
  'POST /api/courses/migrate',
  'GET /api/courses/:course_id',
  'PUT /api/courses/:course_id',
  'DELETE /api/courses/:course_id',
  'POST /api/courses/:course_id/roster',
  'GET /api/courses/:course_id/students',
  'POST /api/courses/:course_id/students',
  'PUT /api/courses/:course_id/students/:student_id',
  'DELETE /api/courses/:course_id/students/:student_id',
  'POST /api/courses/:course_id/students/bulk-delete',
  'DELETE /api/courses/:course_id/students',
  'GET /api/courses/:course_id/reports',
  'GET /api/courses/:course_id/reports/download',
  'GET /api/courses/:course_id/reports/student/:student_id',
  'GET /api/courses/:course_id/reports/team/:team_id',
  'POST /api/courses/:course_id/reports/generate',
  'POST /api/courses/:course_id/evaluations/send',
  'POST /api/courses/:course_id/teams/:team_id/evaluations/send',
  'GET /api/courses/:course_id/evaluations/status',
  'POST /api/courses/:course_id/evaluations/remind',
  'DELETE /api/courses/:course_id/evaluations/reset',
  'GET /api/courses/:course_id/teams',
  'POST /api/courses/:course_id/teams',
  'PUT /api/courses/:course_id/teams/:team_id',
  'DELETE /api/courses/:course_id/teams/:team_id',
  'DELETE /api/courses/:course_id/teams',
  'POST /api/courses/:course_id/teams/auto-assign',
  'POST /api/courses/:course_id/teams/:team_id/students/:student_id',
  'DELETE /api/courses/:course_id/teams/:team_id/students/:student_id',
  'GET /api/evaluate/:token',
  'POST /api/evaluate/:token',
  'GET /api/evaluate/:token/status',
  'POST /api/ai/summarize',
  'POST /api/ai/red-flags',
  'POST /api/ai/sentiment',
  'GET /api/professor/ai-words',
  'POST /api/professor/ai-words'
]);
const actualRoutes = new Set(routes);
const missingRoutes = [...expectedRoutes].filter((route) => !actualRoutes.has(route));

describe('API route coverage', () => {
  test('all mounted API routes are registered', () => {
    console.log('[UNIT] Registered routes:', Array.from(actualRoutes).sort());
    console.log('[UNIT] Expected routes:', Array.from(expectedRoutes).sort());

    [...expectedRoutes].forEach((route) => {
      const status = actualRoutes.has(route) ? 'PASS' : 'FAIL';
      console.log(`[UNIT] ${status} ${route}`);
    });

    expect(missingRoutes).toHaveLength(0);
  });

  test('GET /api/health responds successfully', async () => {
    const response = await request(app).get('/api/health');
    console.log(`[UNIT] GET /api/health -> ${response.status}`);
    console.log(`[UNIT] ${JSON.stringify(response.body)}`);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
  });
});
