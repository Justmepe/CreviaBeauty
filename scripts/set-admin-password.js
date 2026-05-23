#!/usr/bin/env node
/**
 * Set the password for an admin user (or any user by email).
 * Usage: node scripts/set-admin-password.js <new-password> [email]
 * Default email: admin@creviabeauty.com
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config');

(async () => {
    const [, , password, emailArg] = process.argv;
    const email = emailArg || 'admin@creviabeauty.com';

    if (!password) {
        console.error('Usage: node scripts/set-admin-password.js <new-password> [email]');
        console.error('Example: node scripts/set-admin-password.js "MyStr0ngP@ss!"');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('Password must be at least 8 characters.');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: config.database.connectionString,
        host: config.database.connectionString ? undefined : config.database.host,
        port: config.database.connectionString ? undefined : config.database.port,
        database: config.database.connectionString ? undefined : config.database.name,
        user: config.database.connectionString ? undefined : config.database.user,
        password: config.database.connectionString ? undefined : config.database.password
    });

    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id, email, name, is_admin',
            [hash, email]
        );

        if (result.rowCount === 0) {
            console.error(`No user found with email: ${email}`);
            const admins = await pool.query('SELECT email FROM users WHERE is_admin = TRUE');
            if (admins.rows.length) {
                console.error('Existing admin emails:');
                for (const r of admins.rows) console.error('  - ' + r.email);
            }
            process.exit(2);
        }

        const u = result.rows[0];
        console.log(`Password updated for ${u.email} (${u.name})${u.is_admin ? ' [admin]' : ''}`);
    } catch (err) {
        console.error('Failed:', err.message);
        process.exit(3);
    } finally {
        await pool.end();
    }
})();
