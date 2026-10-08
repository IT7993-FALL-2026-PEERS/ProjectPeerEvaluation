// Guard for the E2E frontend server (frontend.js): the tests must reach the E2E backend on localhost.
// A build made with REACT_APP_API_URL pointing at a hosted backend (staging, say) would send every
// request there, with real data and a real mail account.
const fs = require('node:fs');
const path = require('node:path');

// The only hosted URL a local build may contain: the old fallback in services/apiUrl.js. It is a
// literal that is never used while REACT_APP_API_URL is set or the page is on localhost.
const LEGACY_API_URL = 'https://peer-evaluation-backend.onrender.com/api';

// The JavaScript files of a Vite build live in build/assets. Throws when there is nothing to scan:
// a guard that finds no files must not pass (that is how a changed build layout would disable it).
function bundleFiles(buildDir) {
  const dir = path.join(buildDir, 'assets');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.js')) : [];
  if (files.length === 0) {
    throw new Error(`There is no JavaScript to check in ${dir}. Run \`npm run build\` first, and update this guard if the build layout changed.`);
  }
  return files.map((name) => path.join(dir, name));
}

function hostedApiUrlsInBuild(buildDir) {
  const found = new Set();
  for (const file of bundleFiles(buildDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const url of text.match(/https:\/\/[a-z0-9.-]+\.onrender\.com[^"'\s)`]*/g) || []) found.add(url);
  }
  found.delete(LEGACY_API_URL);
  return [...found];
}

module.exports = { hostedApiUrlsInBuild, LEGACY_API_URL };
