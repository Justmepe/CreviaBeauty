/**
 * Products API Tests
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

    // Insert sample products
    db.exec(`
        INSERT INTO products (name, description, price, category, stock)
        VALUES
            ('Test Desk', 'A test desk', 10000, 'Office Furniture', 10),
            ('Test Chair', 'A test chair', 5000, 'Office Furniture', 20),
            ('Test Sofa', 'A test sofa', 50000, 'Living Room', 5);
    `);

    return db;
});

// Set environment before requiring app
process.env.SESSION_SECRET = 'test-secret-key-for-jest-testing-12345678901234567890';

const app = require('../server');

describe('Products API', () => {
    describe('GET /api/products', () => {
        it('should return a list of products', async () => {
            const res = await request(app)
                .get('/api/products');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('data');
            expect(Array.isArray(res.body.data)).toBe(true);
        });

        it('should support pagination', async () => {
            const res = await request(app)
                .get('/api/products?page=1&limit=2');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('pagination');
            expect(res.body.pagination.page).toBe(1);
            expect(res.body.pagination.limit).toBe(2);
        });

        it('should filter by category', async () => {
            const res = await request(app)
                .get('/api/products?category=Office%20Furniture');

            expect(res.statusCode).toBe(200);
            expect(res.body.data.every(p => p.category === 'Office Furniture')).toBe(true);
        });
    });

    describe('GET /api/products/:id', () => {
        it('should return a single product', async () => {
            const res = await request(app)
                .get('/api/products/1');

            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('name');
            expect(res.body).toHaveProperty('price');
        });

        it('should return 404 for non-existent product', async () => {
            const res = await request(app)
                .get('/api/products/9999');

            expect(res.statusCode).toBe(404);
        });

        it('should return 422 for invalid product ID', async () => {
            const res = await request(app)
                .get('/api/products/invalid');

            expect(res.statusCode).toBe(422);
        });
    });
});
