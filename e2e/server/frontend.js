// Serves the production frontend build for the end-to-end tests: static files from build/ with a
// fallback to index.html, so a link such as /evaluate/<token> opens the app, as nginx does in the
// Docker image. Run `npm run build` first.
//
//   node e2e/server/frontend.js
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { hostedApiUrlsInBuild } = require('./build-guard');

const buildDir = path.join(__dirname, '..', '..', 'build');
const PORT = Number(process.env.E2E_FRONTEND_PORT || 3000);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.map': 'application/json', '.txt': 'text/plain; charset=utf-8',
};

if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
  console.error('build/index.html is missing. Run `npm run build` first.');
  process.exit(1);
}

// The tests must reach the E2E backend on localhost: refuse a build that points at a hosted backend,
// and refuse to start when there is no bundle to check (see build-guard.js).
let hosted;
try {
  hosted = hostedApiUrlsInBuild(buildDir);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
if (hosted.length > 0) {
  console.error(`The build points at a hosted backend (${hosted.join(', ')}). Unset REACT_APP_API_URL and run \`npm run build\` again.`);
  process.exit(1);
}

http.createServer((req, res) => {
  let requested;
  try {
    requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    // A malformed percent-encoding (for example /%E0%A4%A) must not take the server down.
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad request');
    return;
  }
  const file = path.normalize(path.join(buildDir, requested));
  // Never serve anything outside build/.
  const inside = file.startsWith(buildDir + path.sep);
  const isFile = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  const target = isFile ? file : path.join(buildDir, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`Frontend build served on ${PORT}`));
