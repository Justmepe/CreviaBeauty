/**
 * End-to-end happy-path test for a customer:
 *   register → login → browse products → add to cart → checkout → see order → submit review
 * Plus a few error-path checks (duplicate email, wrong password, empty-cart checkout, unauth).
 */

const {
    waitForDb,
    registerAndLoginCustomer,
    randomUser,
    getAnyProductId,
    request
} = require('./helpers');

beforeAll(async () => {
    await waitForDb();
});

describe('Customer happy path', () => {
    test('full register → cart → checkout → review flow', async () => {
        const agent = await registerAndLoginCustomer();
        expect(agent.user.isAdmin).toBe(false);

        // /api/user reflects the session
        const me = await agent.get('/api/user');
        expect(me.body.loggedIn).toBe(true);
        expect(me.body.user.email).toBe(agent.user.email);

        // Browse: products list is non-empty thanks to seeds
        const products = await agent.get('/api/products?limit=5');
        expect(products.statusCode).toBe(200);
        const list = products.body.data || products.body;
        expect(list.length).toBeGreaterThan(0);
        const productId = list[0].id;

        // Add to cart
        const added = await agent.post('/api/cart').send({ productId, quantity: 2 });
        expect(added.statusCode).toBe(200);
        expect(added.body.success).toBe(true);

        // Cart reflects the item
        const cart = await agent.get('/api/cart');
        expect(cart.statusCode).toBe(200);
        const cartItems = cart.body.items || cart.body;
        expect(cartItems.some(c => c.product_id === productId && c.quantity === 2)).toBe(true);

        // Checkout
        const order = await agent.post('/api/orders').send({
            shippingAddress: '123 Test Street, Nairobi, Kenya',
            phone: '+254700000000',
            paymentMethod: 'cod'
        });
        expect(order.statusCode).toBe(200);
        expect(order.body.success).toBe(true);
        expect(order.body.orderId || order.body.order?.id).toBeTruthy();
        const orderId = order.body.orderId || order.body.order.id;

        // Cart is now empty
        const cartAfter = await agent.get('/api/cart');
        const itemsAfter = cartAfter.body.items || cartAfter.body;
        expect(itemsAfter.length).toBe(0);

        // My-orders shows the new order
        const myOrders = await agent.get('/api/orders/my-orders');
        expect(myOrders.statusCode).toBe(200);
        const orders = myOrders.body.orders || myOrders.body.data || myOrders.body;
        expect(Array.isArray(orders)).toBe(true);
        expect(orders.some(o => o.id === orderId)).toBe(true);

        // Submit a review (review goes into reviews table, awaiting admin approval)
        const review = await request().post('/api/reviews').send({
            customerName: agent.user.name,
            customerEmail: agent.user.email,
            rating: 5,
            reviewText: 'Great experience — fast delivery and authentic product.',
            productQuality: 5,
            deliveryRating: 5
        });
        expect([200, 201]).toContain(review.statusCode);
        expect(review.body.success).toBe(true);
    });
});

describe('Customer error paths', () => {
    test('register rejects duplicate email', async () => {
        const u = randomUser('dup');
        const r1 = await request().post('/api/register').send(u);
        expect(r1.body.success).toBe(true);

        const r2 = await request().post('/api/register').send(u);
        expect(r2.statusCode).toBeGreaterThanOrEqual(400);
        expect(r2.body.success).toBe(false);
        expect(r2.body.error?.message || r2.body.error).toMatch(/already/i);
    });

    test('login rejects wrong password', async () => {
        const u = randomUser('wrongpw');
        await request().post('/api/register').send(u);

        const res = await request().post('/api/login').send({
            email: u.email,
            password: 'CompletelyWrongPassword!'
        });
        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.message || res.body.error).toMatch(/invalid/i);
    });

    test('register rejects weak password', async () => {
        const u = randomUser('weak');
        const res = await request().post('/api/register').send({ ...u, password: '12' });
        expect(res.statusCode).toBe(422);
        expect(res.body.success).toBe(false);
    });

    test('checkout with empty cart fails with 400', async () => {
        const agent = await registerAndLoginCustomer();
        const res = await agent.post('/api/orders').send({
            shippingAddress: '123 Test Street, Nairobi',
            phone: '+254700000000',
            paymentMethod: 'cod'
        });
        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error?.message || res.body.error).toMatch(/cart is empty/i);
    });

    test('placing an order without auth returns 401', async () => {
        const res = await request().post('/api/orders').send({
            shippingAddress: '123 Test Street, Nairobi',
            phone: '+254700000000',
            paymentMethod: 'cod'
        });
        expect(res.statusCode).toBe(401);
    });

    test('GET /api/user returns loggedIn:false for an unauthenticated client', async () => {
        const res = await request().get('/api/user');
        expect(res.statusCode).toBe(200);
        expect(res.body.loggedIn).toBe(false);
    });
});
