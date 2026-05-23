#!/usr/bin/env node
/**
 * Create the test database if it doesn't already exist.
 * Run once with: npm run test:db:create
 *
 * The integration tests then connect to it via TEST_DATABASE_URL (see tests/setup.js).
 * The app's own initializeDatabase() creates the schema and runs seeds on first request.
 */

const { Client } = require('pg');

const TEST_DB = process.env.TEST_DB_NAME || 'creviabeauty_test';
const ADMIN_URL = process.env.PG_ADMIN_URL ||
    'postgresql://postgres:Gikonyo%402026@localhost:5432/postgres';

(async () => {
    const client = new Client({ connectionString: ADMIN_URL });
    try {
        await client.connect();
        const exists = await client.query(
            'SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]
        );
        if (exists.rows.length) {
            console.log(`Database "${TEST_DB}" already exists — nothing to do.`);
        } else {
            // Note: cannot parameterise CREATE DATABASE
            await client.query(`CREATE DATABASE "${TEST_DB}"`);
            console.log(`Created database "${TEST_DB}".`);
        }
    } catch (err) {
        console.error('Failed to create test database:', err.message);
        console.error('Hint: set PG_ADMIN_URL to a connection string with CREATE DATABASE privilege,');
        console.error('e.g. PG_ADMIN_URL="postgresql://postgres:PASSWORD@localhost:5432/postgres"');
        process.exit(1);
    } finally {
        await client.end();
    }
})();
