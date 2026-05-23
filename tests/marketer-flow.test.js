/**
 * End-to-end test for the marketer flow:
 *   customer registers → applies as marketer → admin approves → dashboard works →
 *   another customer orders with the marketer's code → commission record is created
 *   plus validation/auth error paths.
 */

const {
    waitForDb,
    registerAndLoginCustomer,
    loginAsAdmin,
    request
} = require('./helpers');

beforeAll(async () => {
    await waitForDb();
});

// Pick a product whose price is high enough that a 10% commission still hits something
// non-trivial. We don't depend on a specific value, just on it existing in the seed.
async function getExpensiveProductId() {
    const res = await request().get('/api/products?limit=100');
    const list = res.body.data || res.body;
    const sorted = [...list].sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    if (!sorted[0]) throw new Error('no products in test DB');
    return sorted[0].id;
}

describe('Marketer happy path', () => {
    test('register → apply → admin approves → dashboard accessible → order with code → commission recorded', async () => {
        // 1) Customer registers and applies to be a marketer.
        const marketerAgent = await registerAndLoginCustomer();
        const apply = await marketerAgent.post('/api/marketer/apply').send({
            paymentMethod: 'mpesa',
            paymentDetails: '+254700000000'
        });
        expect(apply.statusCode).toBe(200);
        expect(apply.body.success).toBe(true);
        expect(apply.body.referralCode).toMatch(/^REF/);
        const referralCode = apply.body.referralCode;

        // 2) Pre-approval: marketer dashboard is blocked with 403.
        const blocked = await marketerAgent.get('/api/marketer/dashboard');
        expect(blocked.statusCode).toBe(403);

        // 3) Admin lists marketers and approves this one.
        const admin = await loginAsAdmin();
        const list = await admin.get('/api/marketer/admin/list');
        expect(list.statusCode).toBe(200);

        // The route stores user_id as the "marketer id"; find by email.
        const meRes = await marketerAgent.get('/api/user');
        const marketerEmail = meRes.body.user.email;
        const found = (list.body.marketers || list.body).find(m => m.email === marketerEmail);
        expect(found).toBeTruthy();
        const marketerUserId = found.user_id || found.id;

        const approve = await admin.put(`/api/marketer/admin/${marketerUserId}/status`).send({ status: 'approved' });
        expect(approve.statusCode).toBe(200);
        expect(approve.body.success).toBe(true);

        // 4) Marketer re-logs in to pick up the new session flag.
        const relogin = await marketerAgent.post('/api/login').send({
            email: marketerEmail,
            password: marketerAgent.user.password
        });
        expect(relogin.body.user.isMarketer).toBe(true);

        // 5) Marketer dashboard now works.
        const dash = await marketerAgent.get('/api/marketer/dashboard');
        expect(dash.statusCode).toBe(200);
        expect(dash.body.profile.status).toBe('approved');

        // 6) The referral code validates publicly.
        const codeCheck = await request().get(`/api/marketer/validate-code/${referralCode}`);
        expect(codeCheck.statusCode).toBe(200);
        expect(codeCheck.body.valid).toBe(true);

        // 7) A different customer orders an expensive product using the marketer code.
        const customer = await registerAndLoginCustomer();
        const productId = await getExpensiveProductId();
        await customer.post('/api/cart').send({ productId, quantity: 1 });
        const order = await customer.post('/api/orders').send({
            shippingAddress: '456 Buyer Lane, Nairobi, Kenya',
            phone: '+254711111111',
            paymentMethod: 'cod',
            marketerCode: referralCode
        });
        expect(order.statusCode).toBe(200);
        expect(order.body.success).toBe(true);

        // 8) The marketer's commissions endpoint now lists a commission for that order.
        const commissions = await marketerAgent.get('/api/marketer/commissions');
        expect(commissions.statusCode).toBe(200);
        const rows = commissions.body.commissions || commissions.body.data || commissions.body;
        expect(Array.isArray(rows) && rows.length).toBeGreaterThan(0);
        expect(parseFloat(rows[0].commission_amount)).toBeGreaterThan(0);
    });
});

describe('Marketer error paths', () => {
    test('applying twice is rejected', async () => {
        const agent = await registerAndLoginCustomer();
        const r1 = await agent.post('/api/marketer/apply').send({ paymentMethod: 'mpesa', paymentDetails: '+254700000000' });
        expect(r1.body.success).toBe(true);

        const r2 = await agent.post('/api/marketer/apply').send({ paymentMethod: 'mpesa', paymentDetails: '+254700000000' });
        expect(r2.statusCode).toBeGreaterThanOrEqual(400);
        expect(r2.body.success).toBe(false);
    });

    test('non-marketer customers get 403 from marketer routes', async () => {
        const agent = await registerAndLoginCustomer();
        const res = await agent.get('/api/marketer/dashboard');
        expect(res.statusCode).toBe(403);
    });

    test('payout request below the minimum is rejected', async () => {
        // Build a fresh, approved marketer to exercise the validation.
        const marketer = await registerAndLoginCustomer();
        await marketer.post('/api/marketer/apply').send({ paymentMethod: 'mpesa', paymentDetails: '+254700000000' });
        const me = await marketer.get('/api/user');
        const admin = await loginAsAdmin();
        const list = await admin.get('/api/marketer/admin/list');
        const found = (list.body.marketers || list.body).find(m => m.email === me.body.user.email);
        const marketerUserId = found.user_id || found.id;
        await admin.put(`/api/marketer/admin/${marketerUserId}/status`).send({ status: 'approved' });
        await marketer.post('/api/login').send({ email: me.body.user.email, password: marketer.user.password });

        const res = await marketer.post('/api/marketer/payout').send({
            amount: 100,
            paymentMethod: 'mpesa',
            paymentDetails: '+254700000000'
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.error?.message || res.body.error).toMatch(/minimum|balance/i);
    });

    test('unauthenticated requests to marketer endpoints return 401', async () => {
        const res = await request().get('/api/marketer/dashboard');
        expect(res.statusCode).toBe(401);
    });

    test('invalid referral code returns valid:false', async () => {
        const res = await request().get('/api/marketer/validate-code/NOSUCHCODE');
        expect(res.statusCode).toBe(200);
        expect(res.body.valid).toBe(false);
    });
});
