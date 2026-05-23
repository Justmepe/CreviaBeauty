/**
 * Jest Test Setup
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-jest-testing-12345678901234567890';
process.env.DATABASE_PATH = ':memory:';
process.env.PORT = 0; // Random port for tests

// Increase timeout for database operations
jest.setTimeout(10000);
