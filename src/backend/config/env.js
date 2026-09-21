// Checks the login-token secret once, at startup.
//
// With NODE_ENV=production a missing or short JWT_SECRET stops the app with a
// clear message. Anywhere else it falls back to a development default and warns,
// so `npm run dev` keeps working without extra setup.

const DEV_JWT_SECRET = 'dev_secret_key';
const MIN_PROD_SECRET_LENGTH = 32;

// Pure function: takes an env object and returns the secret plus any problems.
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

  return { isProduction, jwtSecret, errors, warnings };
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
