/**
 * Receipt Routes
 *
 * Creating a receipt without a website order, two entry points:
 *   POST /api/receipts/guest   public  - a customer fills in their own details
 *   POST /api/receipts/manual  admin   - admin issues a receipt for any sale
 *
 * Both persist an order (so it shows in the admin Orders list), notify the
 * admin on Discord, then return the branded receipt HTML to print / save.
 */

const express = require('express');
const router = express.Router();

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAdmin } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { renderReceiptPage } = require('../utils/renderReceipt');
const { htmlToPdf } = require('../utils/receiptPdf');
const { sendEmbed } = require('../utils/discord');

const PAYMENT_LABELS = { cod: 'Cash on Delivery', mpesa: 'M-Pesa', bank: 'Bank Transfer' };

// Normalise the parallel desc[]/qty[]/price[] form arrays into clean line items.
function parseItems(body) {
    const toArray = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
    const descs = toArray(body['desc']);
    const qtys = toArray(body['qty']);
    const prices = toArray(body['price']);

    const items = [];
    for (let i = 0; i < descs.length; i++) {
        const name = String(descs[i] || '').trim();
        const quantity = Math.max(0, Math.floor(Number(qtys[i]) || 0));
        const price = Math.max(0, Number(prices[i]) || 0);
        if (name && quantity > 0) items.push({ name, quantity, price });
    }
    return items;
}

// Notify admin (with the receipt PDF attached) about a new receipt/order.
async function notifyDiscord({ orderId, customerName, phone, paymentMethod, total, items, source }, file) {
    const embed = {
        title: source === 'guest' ? '🧾 New Customer Receipt Request' : '🧾 Receipt Issued',
        color: 0xd4af6a,
        fields: [
            { name: '📦 Order', value: `#${orderId}`, inline: true },
            { name: '💰 Total', value: `KSh ${Number(total).toLocaleString()}`, inline: true },
            { name: '💳 Payment', value: PAYMENT_LABELS[paymentMethod] || paymentMethod, inline: true },
            { name: '👤 Customer', value: customerName || 'N/A', inline: true },
            { name: '📱 Phone', value: phone || 'N/A', inline: true },
            { name: '🛍️ Items', value: items.map(i => `• ${i.name} x${i.quantity} - KSh ${(i.price * i.quantity).toLocaleString()}`).join('\n') || 'N/A', inline: false }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'CreviaBeauty Receipts' }
    };
    await sendEmbed(embed, file);
}

module.exports = (db) => {
    // Shared handler: validate, persist the order, notify, render the receipt.
    function createReceipt({ source }) {
        return asyncHandler(async (req, res) => {
            const customerName = String(req.body.customerName || '').trim();
            const phone = String(req.body.phone || '').trim();
            const whatsapp = String(req.body.whatsapp || '').trim().slice(0, 50) || null;
            const deliveryLocation = String(req.body.deliveryLocation || '').trim().slice(0, 200) || null;
            const notes = String(req.body.notes || '').trim().slice(0, 200) || null;
            const isGift = req.body.gift === '1' || req.body.gift === 'on' || req.body.gift === true;
            const paymentMethod = ['cod', 'mpesa', 'bank'].includes(req.body.paymentMethod)
                ? req.body.paymentMethod : 'cod';
            const paymentRef = String(req.body.paymentRef || '').trim().slice(0, 60) || null;
            const delivery = Math.max(0, Math.round(Number(req.body.delivery) || 0));
            const items = parseItems(req.body);

            if (!customerName) throw AppError.badRequest('Customer name is required');
            if (items.length === 0) throw AppError.badRequest('Add at least one item');

            const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
            const total = subtotal + delivery;

            // Admin may set an explicit status; guests default to pending.
            const statusChoice = req.body.status;
            const paymentStatus = statusChoice === 'paid' ? 'paid' : 'pending';
            const theme = ['navy', 'ivory', 'black'].includes(req.body.theme) ? req.body.theme : 'navy';

            const insert = await db.query(`
                INSERT INTO orders
                    (user_id, total, status, phone, payment_method, payment_status,
                     payment_reference, customer_name, items_json, source,
                     whatsapp, delivery_location, notes, is_gift)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                RETURNING id, created_at
            `, [
                null, total, 'pending', phone || null, paymentMethod, paymentStatus,
                paymentRef, customerName, JSON.stringify(items), source,
                whatsapp, deliveryLocation, notes, isGift
            ]);
            const order = { ...insert.rows[0], total, phone, payment_method: paymentMethod,
                payment_status: paymentStatus, payment_reference: paymentRef,
                customer_name: customerName, source,
                whatsapp, delivery_location: deliveryLocation, notes, is_gift: isGift };

            logger.info('Receipt created', { orderId: order.id, source, total, items: items.length });

            // Load payment settings so the receipt can show pay-to details.
            const settingsResult = await db.query('SELECT setting_key, setting_value FROM payment_settings');
            const settings = {};
            for (const row of settingsResult.rows) settings[row.setting_key] = row.setting_value;

            // Honour an admin's explicit status label on the receipt.
            const statusText = statusChoice === 'paid' ? 'Paid'
                : statusChoice === 'awaiting' ? 'Awaiting Payment'
                : statusChoice === 'cod' ? 'Payment on Delivery'
                : undefined;

            const html = renderReceiptPage(order, items, settings, { theme, statusText, delivery });

            // Notify admin with the receipt PDF attached (background — the PDF
            // render must not delay the customer's receipt response).
            (async () => {
                let file = null;
                try {
                    const year = new Date(order.created_at).getFullYear();
                    const filename = `CB-${year}-${String(order.id).padStart(6, '0')}.pdf`;
                    file = { buffer: await htmlToPdf(html), filename };
                } catch (e) {
                    logger.error('Receipt PDF failed', { orderId: order.id, error: e.message });
                }
                await notifyDiscord({ orderId: order.id, customerName, phone, paymentMethod, total, items, source }, file);
            })().catch(err => logger.error('Receipt notification failed', { error: err.message }));

            res.set('Cache-Control', 'no-store');
            res.send(html);
        });
    }

    // Public: a customer generates their own receipt.
    router.post('/guest', createReceipt({ source: 'guest' }));

    // Admin: issue a receipt for an off-website sale.
    router.post('/manual', requireAdmin, createReceipt({ source: 'manual' }));

    return router;
};
