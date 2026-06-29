/**
 * Order Receipt Helpers
 *
 * Shared loading + rendering for an order's receipt, used by the admin receipt
 * view and by the "payment received" flow that pushes the final PAID receipt to
 * Discord. Keeps one definition of how an order maps to receipt data.
 */

const { renderReceiptPage } = require('./renderReceipt');
const { htmlToPdf } = require('./receiptPdf');
const { sendEmbed } = require('./discord');
const logger = require('./logger');

// Load the order (with customer name), its line items (free-text items_json for
// guest/manual orders, else the product-backed order_items), and payment
// settings. Looks up by order id (admin) or by receipt_token (public link).
// Returns null if the order doesn't exist.
async function fetchReceiptData(db, id) {
    return fetchReceiptBy(db, 'o.id = $1', id);
}

async function fetchReceiptDataByToken(db, token) {
    return fetchReceiptBy(db, 'o.receipt_token = $1', token);
}

async function fetchReceiptBy(db, whereClause, value) {
    const orderResult = await db.query(`
        SELECT o.*, COALESCE(u.name, o.customer_name) AS user_name, u.email AS user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE ${whereClause}
    `, [value]);
    const order = orderResult.rows[0];
    if (!order) return null;

    let items;
    if (order.items_json) {
        try { items = JSON.parse(order.items_json); } catch (e) { items = []; }
    } else {
        const itemsResult = await db.query(`
            SELECT oi.quantity, oi.price, p.name
            FROM order_items oi
            JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
        `, [order.id]);
        items = itemsResult.rows;
    }

    const settingsResult = await db.query('SELECT setting_key, setting_value FROM payment_settings');
    const settings = {};
    for (const row of settingsResult.rows) settings[row.setting_key] = row.setting_value;

    return { order, items, settings };
}

// Render the PAID receipt for an order and post it to Discord. Best-effort and
// never throws — a failure is logged so the calling request still succeeds.
async function sendPaidReceiptToDiscord(db, id) {
    try {
        const data = await fetchReceiptData(db, id);
        if (!data) return;
        const { order, items, settings } = data;

        const html = renderReceiptPage(order, items, settings, { statusText: 'Paid' });
        const pdf = await htmlToPdf(html);

        const year = new Date(order.created_at).getFullYear();
        const filename = `CB-${year}-${String(order.id).padStart(6, '0')}-receipt.pdf`;
        const total = Number(order.total) || 0;

        const embed = {
            title: '✅ Payment Received — Receipt',
            color: 0x27ae60,
            fields: [
                { name: '📦 Order', value: `#${order.id}`, inline: true },
                { name: '💰 Total', value: `KSh ${total.toLocaleString()}`, inline: true },
                { name: '👤 Customer', value: order.user_name || 'N/A', inline: true }
            ],
            timestamp: new Date().toISOString(),
            footer: { text: 'CreviaBeauty Receipts' }
        };

        await sendEmbed(embed, { buffer: pdf, filename });
        logger.info('Paid receipt sent to Discord', { orderId: id });
    } catch (error) {
        logger.error('Failed to send paid receipt', { orderId: id, error: error.message });
    }
}

module.exports = { fetchReceiptData, fetchReceiptDataByToken, sendPaidReceiptToDiscord };
