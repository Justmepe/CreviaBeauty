// @ts-check
const crypto = require('crypto');

/** Generate a unique customer signup payload. Name uses only letters to satisfy the name regex. */
function randomUser(prefix = 'cust') {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let id = '';
    for (const b of crypto.randomBytes(6)) id += letters[b % 26];
    // The /api/register name validator is /^[a-zA-Z\s'-]+$/ — strip any non-letters
    // from the prefix so callers can pass whatever label is meaningful.
    const nameSafePrefix = prefix.replace(/[^a-zA-Z]/g, '') || 'user';
    return {
        name: `Test ${nameSafePrefix} ${id}`,
        email: `${prefix}-${id}@test.creviabeauty.local`,
        phone: '+254700000000',
        password: 'TestPass123!'
    };
}

module.exports = { randomUser };
