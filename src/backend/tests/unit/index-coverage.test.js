function mockCommonDeps(mockApp) {
  jest.doMock('express', () => {
    const express = jest.fn(() => mockApp);
    express.json = jest.fn(() => jest.fn());
    return express;
  });
  jest.doMock('dotenv', () => ({ config: jest.fn() }));
  jest.doMock('cors', () => jest.fn(() => jest.fn()));
  jest.doMock('../../routes/auth', () => ({}));
  jest.doMock('../../routes/courses', () => ({}));
  jest.doMock('../../routes/evaluate', () => ({}));
  jest.doMock('../../routes/ai', () => ({}));
  jest.doMock('../../routes/professor', () => ({}));
  jest.doMock('../../middleware/errorHandler', () => jest.fn());
}

function flushAsync() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('index startup branches', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('express');
    jest.dontMock('dotenv');
    jest.dontMock('cors');
    jest.dontMock('mongoose');
    jest.dontMock('../../routes/auth');
    jest.dontMock('../../routes/courses');
    jest.dontMock('../../routes/evaluate');
    jest.dontMock('../../routes/ai');
    jest.dontMock('../../routes/professor');
    jest.dontMock('../../middleware/errorHandler');
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('connects to MongoDB and logs success when not in a test environment', async () => {
    process.env.NODE_ENV = 'development';
    const mockApp = { use: jest.fn(), get: jest.fn(), listen: jest.fn() };
    mockCommonDeps(mockApp);
    jest.doMock('mongoose', () => ({ connect: jest.fn(() => Promise.resolve()) }));

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    require('../../index');
    await flushAsync();

    expect(logSpy).toHaveBeenCalledWith('✅ MongoDB connected');
    logSpy.mockRestore();
  });

  test('logs MongoDB connection failures when not in a test environment', async () => {
    process.env.NODE_ENV = 'development';
    const mockApp = { use: jest.fn(), get: jest.fn(), listen: jest.fn() };
    mockCommonDeps(mockApp);
    const error = new Error('connection failed');
    jest.doMock('mongoose', () => ({ connect: jest.fn(() => Promise.reject(error)) }));

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    require('../../index');
    await flushAsync();

    expect(errorSpy).toHaveBeenCalledWith('❌ MongoDB connection error:', error);
    errorSpy.mockRestore();
  });

  test('skips connecting to MongoDB when running in the test environment', async () => {
    process.env.NODE_ENV = 'test';
    const mockApp = { use: jest.fn(), get: jest.fn(), listen: jest.fn() };
    mockCommonDeps(mockApp);
    const mockConnect = jest.fn(() => Promise.resolve());
    jest.doMock('mongoose', () => ({ connect: mockConnect }));

    require('../../index');
    await flushAsync();

    expect(mockConnect).not.toHaveBeenCalled();
  });
});
