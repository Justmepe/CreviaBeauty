/**
 * Referral Code Generator Utility
 */

// Generate a unique referral code for a user
function generateReferralCode(userId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'REF';
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code + userId.toString().padStart(3, '0');
}

// Validate referral code format
function isValidReferralCodeFormat(code) {
    if (!code || typeof code !== 'string') return false;
    // Code should be 11-15 characters starting with REF or MKT
    return /^(REF|MKT)[A-Z0-9]{5,12}$/i.test(code);
}

module.exports = {
    generateReferralCode,
    isValidReferralCodeFormat
};
