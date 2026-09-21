// Reads and checks the settings the backend needs, once, at startup.
//
// In production (NODE_ENV=production) a missing or weak setting stops the app
// with a clear message. In development it falls back to safe local defaults and
// prints a warning, so `npm run dev` keeps working without extra setup.

const DEV_JWT_SECRET = 'dev_secret_key';
const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/peer-evaluation';
const MIN_PROD_SECRET_LENGTH = 32;

// Pure function: takes an env object and returns the settings plus any problems.
function loadConfig(env = process.env) {
  const isProduction = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  let jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProduction) {
      errors.push('JWT_SECRET is not set. It is required in production.');
    } else {
      warnings.push('JWT_SECRET is not set. Using an insecure development default; never use it in production.');
      jwtSecret = DEV_JWT_SECRET;
    }
  } else if (isProduction && jwtSecret.length < MIN_PROD_SECRET_LENGTH) {
    errors.push(`JWT_SECRET is too short. Use at least ${MIN_PROD_SECRET_LENGTH} characters in production.`);
  }

  const mongoUri = env.MONGODB_URI || env.MONGO_URI;
  if (!mongoUri && isProduction) {
    errors.push('MONGODB_URI is not set. It is required in production.');
  }

  return { isProduction, jwtSecret, mongoUri: mongoUri || DEFAULT_MONGO_URI, errors, warnings };
}

let cached;

// Call this from the app. It logs warnings, throws on errors, and remembers the result.
function getConfig() {
  if (!cached) {
    const config = loadConfig();
    config.warnings.forEach((w) => console.warn(`⚠️  ${w}`));
    if (config.errors.length > 0) {
      throw new Error(`Invalid configuration:\n - ${config.errors.join('\n - ')}`);
    }
    cached = config;
  }
  return cached;
}

module.exports = { loadConfig, getConfig, DEV_JWT_SECRET, MIN_PROD_SECRET_LENGTH };
