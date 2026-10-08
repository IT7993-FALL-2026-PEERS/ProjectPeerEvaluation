const { test, expect } = require('@playwright/test');

// Post-deploy smoke tests for staging (CICD-27). Every title carries @staging, which is how CD and
// the Staging regression workflow pick them: `npx playwright test --grep @staging`.
//
// They run against a deployed copy, not the throwaway one the other specs reset, so they only
// look: no login, nothing saved, and no request that could send email (staging mails only through
// Mailtrap's free sandbox). The addresses come from the environment:
//   BASE_URL  the frontend, read by playwright.config.js
//   API_URL   the backend, ending in /api
// Without API_URL (the normal CI run) they are skipped. To try them against staging:
//   BASE_URL=https://peers-frontend-staging.onrender.com \
//   API_URL=https://peers-backend-staging.onrender.com/api npx playwright test --grep @staging
// or against the local E2E servers: E2E_START_SERVER=1 with API_URL=http://localhost:5000/api.
test.skip(!process.env.API_URL, 'needs API_URL, the backend address ending in /api (see the top of this file)');

const apiUrl = (process.env.API_URL || '').replace(/\/+$/, '');
const OTHER_SITES = ['https://example.com', 'https://some-other-app.onrender.com'];

// The frontend's origin as a browser sends it: scheme and host, no path.
const frontendOrigin = (baseURL) => new URL(baseURL).origin;

// What a browser sends before a cross-site POST that carries a login token, and what it asks for.
const preflight = (origin) => ({
  Origin: origin,
  'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'content-type,authorization',
});

test('the frontend loads and shows the login page @staging', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByPlaceholder('Email')).toBeVisible();
  await expect(page.getByPlaceholder('Password')).toBeVisible();
});

test('the backend reports that it is healthy and connected to its database @staging', async ({ request }) => {
  const response = await request.get(`${apiUrl}/health`);

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'OK', database: 'connected' });
});

test('the frontend can call the backend from a browser, and the backend allows exactly its origin @staging', async ({ page, request, baseURL }) => {
  const origin = frontendOrigin(baseURL);

  // From the frontend's own page, so the browser applies its CORS rule: if the backend did not
  // allow this origin, fetch would throw instead of returning the health report.
  await page.goto('/');
  const health = await page.evaluate(async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    return { ok: res.ok, body: await res.json() };
  }, `${apiUrl}/health`);
  expect(health.ok).toBe(true);
  expect(health.body.status).toBe('OK');

  // The same thing at header level, so a failure says which header is missing.
  const simple = await request.get(`${apiUrl}/health`, { headers: { Origin: origin } });
  expect(simple.status()).toBe(200);
  expect(simple.headers()['access-control-allow-origin']).toBe(origin);
  expect(simple.headers()['access-control-allow-credentials']).toBe('true');

  // The check a browser makes before it POSTs a login. An OPTIONS request changes nothing.
  const check = await request.fetch(`${apiUrl}/auth/login`, { method: 'OPTIONS', headers: preflight(origin) });
  expect(check.status()).toBe(204);
  expect(check.headers()['access-control-allow-origin']).toBe(origin);
  expect(check.headers()['access-control-allow-methods']).toContain('POST');
  expect(check.headers()['access-control-allow-headers'].toLowerCase()).toContain('authorization');
});

// Proves the bundle's effective API address, which a scan of the files cannot: the legacy fallback URL
// is always present in the bundle as an inert literal. The login request is answered by the test
// itself, so nothing reaches the backend and nothing is saved or mailed.
test('the app sends its API requests to the configured backend @staging', async ({ page }) => {
  let requested = null;
  await page.route('**/auth/login', async (route) => {
    requested = route.request().url();
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'answered by the test' }) });
  });

  await page.goto('/');
  await page.getByPlaceholder('Email').fill('smoke@example.com');
  await page.getByPlaceholder('Password').fill('not-a-real-password');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect.poll(() => requested).not.toBeNull();
  expect(requested).toBe(`${apiUrl}/auth/login`);
});

test('the backend gives no CORS permission to a site that is not the frontend @staging', async ({ request }) => {
  for (const origin of OTHER_SITES) {
    // The call itself is fine (CORS is the browser's rule); without the header the browser blocks the answer.
    const simple = await request.get(`${apiUrl}/health`, { headers: { Origin: origin } });
    expect(simple.status(), origin).toBe(200);
    expect(simple.headers()['access-control-allow-origin'], origin).toBeUndefined();

    const check = await request.fetch(`${apiUrl}/auth/login`, { method: 'OPTIONS', headers: preflight(origin) });
    expect(check.headers()['access-control-allow-origin'], origin).toBeUndefined();
  }
});
