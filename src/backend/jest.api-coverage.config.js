module.exports = {
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  collectCoverage: true,
  collectCoverageFrom: [
    'index.js',
    'config/**/*.js',
    'middleware/auth.js',
    'middleware/errorHandler.js',
    'models/**/*.js',
    'controllers/**/*.js',
    'routes/**/*.js',
    'utils/**/*.js',
    '!routes/authRoutes.js',
    '!routes/courseRoutes.js',
    '!routes/testData.js',
    '!config/corsConfig.js',
    '!config/db.js',
    '!utils/tokenUtils.js'
  ],
  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100
    }
  },
  coverageReporters: ['text', 'html', 'lcov', 'json'],
  coverageDirectory: 'coverage/api',
  testEnvironment: 'node'
};