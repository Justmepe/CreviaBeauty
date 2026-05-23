/**
 * Custom Session Store using PostgreSQL
 * Stores sessions in the PostgreSQL database
 */

const session = require('express-session');
const Store = session.Store;

class PostgresSessionStore extends Store {
    constructor(options = {}) {
        super(options);
        this.pool = options.pool;
        this.tableName = options.tableName || 'sessions';
        this.initialized = false;
        this.initPromise = this.initialize();

        // Cleanup expired sessions periodically (every 15 minutes)
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 15 * 60 * 1000);
    }

    async initialize() {
        try {
            // Create sessions table if it doesn't exist
            await this.pool.query(`
                CREATE TABLE IF NOT EXISTS ${this.tableName} (
                    sid VARCHAR(255) PRIMARY KEY NOT NULL,
                    sess JSON NOT NULL,
                    expired BIGINT NOT NULL
                )
            `);

            // Create index on expired column
            await this.pool.query(`
                CREATE INDEX IF NOT EXISTS idx_${this.tableName}_expired
                ON ${this.tableName}(expired)
            `);

            this.initialized = true;
        } catch (err) {
            console.error('Session store initialization error:', err);
        }
    }

    async cleanup() {
        try {
            const now = Date.now();
            await this.pool.query(
                `DELETE FROM ${this.tableName} WHERE expired <= $1`,
                [now]
            );
        } catch (err) {
            console.error('Session cleanup error:', err);
        }
    }

    get(sid, callback) {
        const now = Date.now();
        this.pool.query(
            `SELECT sess FROM ${this.tableName} WHERE sid = $1 AND expired > $2`,
            [sid, now]
        )
            .then(result => {
                if (result.rows.length === 0) {
                    return callback(null, null);
                }
                const sess = typeof result.rows[0].sess === 'string'
                    ? JSON.parse(result.rows[0].sess)
                    : result.rows[0].sess;
                callback(null, sess);
            })
            .catch(err => callback(err));
    }

    set(sid, sess, callback) {
        const maxAge = sess.cookie?.maxAge || 86400000; // Default 24 hours
        const expired = Date.now() + maxAge;
        const sessStr = JSON.stringify(sess);

        this.pool.query(
            `INSERT INTO ${this.tableName} (sid, sess, expired)
             VALUES ($1, $2, $3)
             ON CONFLICT (sid) DO UPDATE SET sess = $2, expired = $3`,
            [sid, sessStr, expired]
        )
            .then(() => callback(null))
            .catch(err => callback(err));
    }

    destroy(sid, callback) {
        this.pool.query(
            `DELETE FROM ${this.tableName} WHERE sid = $1`,
            [sid]
        )
            .then(() => callback(null))
            .catch(err => callback(err));
    }

    length(callback) {
        const now = Date.now();
        this.pool.query(
            `SELECT COUNT(*) as count FROM ${this.tableName} WHERE expired > $1`,
            [now]
        )
            .then(result => callback(null, parseInt(result.rows[0].count)))
            .catch(err => callback(err));
    }

    clear(callback) {
        this.pool.query(`DELETE FROM ${this.tableName}`)
            .then(() => callback(null))
            .catch(err => callback(err));
    }

    all(callback) {
        const now = Date.now();
        this.pool.query(
            `SELECT sess FROM ${this.tableName} WHERE expired > $1`,
            [now]
        )
            .then(result => {
                const sessions = result.rows.map(row => {
                    return typeof row.sess === 'string'
                        ? JSON.parse(row.sess)
                        : row.sess;
                });
                callback(null, sessions);
            })
            .catch(err => callback(err));
    }

    touch(sid, sess, callback) {
        const maxAge = sess.cookie?.maxAge || 86400000;
        const expired = Date.now() + maxAge;
        this.pool.query(
            `UPDATE ${this.tableName} SET expired = $1 WHERE sid = $2`,
            [expired, sid]
        )
            .then(() => callback(null))
            .catch(err => callback(err));
    }

    close() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
    }
}

module.exports = PostgresSessionStore;
