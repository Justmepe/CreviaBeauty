/**
 * Jest setup — runs once per test file before its requires.
 * Points the app at a dedicated test database and disables noisy logging.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ||
    'test-secret-key-for-jest-testing-12345678901234567890';

// Use a dedicated test database. Override via TEST_DATABASE_URL if your local Postgres
// uses a different user/password than the defaults below.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    'postgresql://postgres:Gikonyo%402026@localhost:5432/creviabeauty_test';

// Random port so listening doesn't clash with the dev server on 3000.
process.env.PORT = '0';

// Quieter logs so test output is readable.
process.env.LOG_LEVEL = 'error';

jest.setTimeout(30000);
