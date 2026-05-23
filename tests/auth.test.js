/**
 * Authentication Tests
 */

const request = require('supertest');

// Mock the database before requiring the app
jest.mock('../database', () => {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');

    // Create tables
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            phone TEXT,
            password TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT,
            price REAL NOT NULL,
            original_price REAL,
            discount INTEGER DEFAULT 0,
            category TEXT,
            image_url TEXT,
            stock INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE cart (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            product_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            session_id TEXT
        );

        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            total REAL NOT NULL,
            status TEXT DEFAULT 'pending',
            shipping_address TEXT,
            phone TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            price REAL NOT NULL
        );

        CREATE TABLE reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            order_id INTEGER,
            product_id INTEGER,
            customer_name TEXT NOT NULL,
            customer_email TEXT,
            rating INTEGER NOT NULL,
            review_text TEXT,
            product_quality INTEGER,
            delivery_rating INTEGER,
            is_approved INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE sessions (
            sid TEXT PRIMARY KEY NOT NULL,
            sess TEXT NOT NULL,
            expired DATETIME NOT NULL
        );
    `);

    return db;
});

// Set environment before requiring app
process.env.SESSION_SECRET = 'test-secret-key-for-jest-testing-12345678901234567890';

const app = require('../server');

describe('Authentication API', () => {
    describe('POST /api/register', () => {
        it('should register a new user with valid data', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    name: 'Test User',
                    email: 'test@example.com',
                    password: 'Password123'
                });

            expect(res.statusCode).toBe(200);
            expect(res.body.success).toBe(true);
        });

        it('should reject registration with invalid email', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    name: 'Test User',
                    email: 'invalid-email',
                    password: 'Password123'
                });

            expect(res.statusCode).toBe(422);
            expect(res.body.success).toBe(false);
        });

        it('should reject registration with weak password', async () => {
            const res = await request(app)
                .post('/api/register')
                .send({
                    name: 'Test User',
                    email: 'test2@example.com',
                    password: '123'
                });

            expect(res.statusCode).toBe(422);
            expect(res.body.success).toBe(false);
        });
    });

    describe('POST /api/login', () => {
        it('should reject login with wrong credentials', async () => {
            const res = await request(app)
                .post('/api/login')
                .send({
                    email: 'nonexistent@example.com',
                    password: 'wrongpassword'
                });

            expect(res.statusCode).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/user', () => {
        it('should return loggedIn: false for unauthenticated users', async () => {
            const res = await request(app)
                .get('/api/user');

            expect(res.statusCode).toBe(200);
            expect(res.body.loggedIn).toBe(false);
        });
    });
});

describe('Health Check', () => {
    it('should return health status', async () => {
        const res = await request(app)
            .get('/health');

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body).toHaveProperty('uptime');
        expect(res.body).toHaveProperty('database');
    });
});
