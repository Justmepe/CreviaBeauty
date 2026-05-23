/**
 * Shared test helpers.
 */

const request = require('supertest');
const crypto = require('crypto');

// Lazy-load the app and DB so callers can set env vars first (jest setup.js does).
let app, db;
function getApp() {
    if (!app) app = require('../server');
    return app;
}
function getDb() {
    if (!db) db = require('../database');
    return db;
}

// Wait for the database initializer (schema + seeds) to finish.
async function waitForDb() {
    await getDb().ready();
}

// Random user data that won't collide across tests in the same DB.
// Name uses letter-only suffix to satisfy the name validator regex (letters/spaces/-/').
function randomUser(prefix = 'user') {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let id = '';
    for (const b of crypto.randomBytes(6)) id += letters[b % 26];
    return {
        name: `Test ${prefix} ${id}`,
        email: `${prefix}-${id}@test.creviabeauty.local`,
        phone: '+254700000000',
        password: 'TestPass123!'
    };
}

// Returns a supertest agent (preserves cookies across requests) authenticated as a fresh
// customer. The created user object is attached on agent.user.
async function registerAndLoginCustomer() {
    const user = randomUser('cust');
    const agent = request.agent(getApp());

    const reg = await agent.post('/api/register').send({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: user.password
    });
    if (!reg.body.success) throw new Error('register failed: ' + JSON.stringify(reg.body));

    const login = await agent.post('/api/login').send({ email: user.email, password: user.password });
    if (!login.body.success) throw new Error('login failed: ' + JSON.stringify(login.body));

    agent.user = { ...user, ...login.body.user };
    return agent;
}

// Returns an agent authenticated as the seeded admin user.
async function loginAsAdmin() {
    const agent = request.agent(getApp());
    const res = await agent.post('/api/login').send({
        email: 'admin@creviabeauty.com',
        password: 'admin123'
    });
    if (!res.body.success || !res.body.user.isAdmin) {
        throw new Error('admin login failed: ' + JSON.stringify(res.body));
    }
    agent.user = res.body.user;
    return agent;
}

// Convenience: get a product id we can add to cart.
async function getAnyProductId() {
    const res = await request(getApp()).get('/api/products?limit=1');
    const items = res.body.data || res.body;
    if (!items[0]?.id) throw new Error('no products in test DB — initializeDatabase seeds failed');
    return items[0].id;
}

module.exports = {
    waitForDb,
    randomUser,
    registerAndLoginCustomer,
    loginAsAdmin,
    getAnyProductId,
    request: () => request(getApp())
};
