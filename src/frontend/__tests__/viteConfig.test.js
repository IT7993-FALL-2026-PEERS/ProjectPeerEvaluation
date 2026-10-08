// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import createConfig from '../../../vite.config.mjs';

// The build reads REACT_APP_API_URL once and writes it into the bundle (vite.config.mjs). If it is
// lost, a deployed frontend silently sends its requests to the fallback backend in services/apiUrl.js.
const KEY = 'process.env.REACT_APP_API_URL';
const SAVED = { api: process.env.REACT_APP_API_URL, render: process.env.RENDER };

function config(mode = 'production') {
  return createConfig({ mode, command: 'build' });
}

function emptyProjectDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-config-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

describe('vite.config.mjs', () => {
  beforeEach(() => {
    delete process.env.REACT_APP_API_URL;
    delete process.env.RENDER;
    vi.spyOn(process, 'cwd').mockReturnValue(emptyProjectDir());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [name, key] of [['REACT_APP_API_URL', 'api'], ['RENDER', 'render']]) {
      if (SAVED[key] === undefined) delete process.env[name];
      else process.env[name] = SAVED[key];
    }
  });

  test('bakes REACT_APP_API_URL from the build environment into the bundle', () => {
    process.env.REACT_APP_API_URL = 'https://peers-backend-staging.onrender.com/api';
    expect(config().define[KEY]).toBe(JSON.stringify('https://peers-backend-staging.onrender.com/api'));
  });

  test('also reads it from a .env file: the REACT_APP_ prefix must be allowed (the default only keeps VITE_)', () => {
    process.cwd.mockReturnValue(emptyProjectDir({ '.env.production': 'REACT_APP_API_URL=https://from-dotenv.example/api\n' }));
    expect(config().define[KEY]).toBe(JSON.stringify('https://from-dotenv.example/api'));
  });

  test('is empty when it is not set, so the app falls back by hostname as before', () => {
    expect(config().define[KEY]).toBe('""');
  });

  test('a Render build without it fails instead of falling back to another backend', () => {
    process.env.RENDER = 'true';
    expect(() => config()).toThrow(/REACT_APP_API_URL/);
  });

  test('a Render build with it passes', () => {
    process.env.RENDER = 'true';
    process.env.REACT_APP_API_URL = 'https://peers-backend-staging.onrender.com/api';
    expect(() => config()).not.toThrow();
  });

  test('builds into build/ and serves on port 3000, the origin the backend CORS list allows', () => {
    const { build, server } = config();
    expect(build.outDir).toBe('build');
    expect(server).toMatchObject({ port: 3000, strictPort: true });
  });
});
