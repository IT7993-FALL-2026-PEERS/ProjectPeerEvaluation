// Serves the production frontend build for the end-to-end tests: static files from build/ with a
// fallback to index.html, so a link such as /evaluate/<token> opens the app, as nginx does in the
// Docker image. Run `npm run build` first.
//
//   node e2e/server/frontend.js
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

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

http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.normalize(path.join(buildDir, requested));
  // Never serve anything outside build/.
  const inside = file.startsWith(buildDir + path.sep);
  const isFile = inside && fs.existsSync(file) && fs.statSync(file).isFile();
  const target = isFile ? file : path.join(buildDir, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(target)] || 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
}).listen(PORT, () => console.log(`Frontend build served on ${PORT}`));
