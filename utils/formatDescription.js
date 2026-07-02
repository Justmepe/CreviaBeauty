/**
 * Normalize product descriptions on save.
 * Copy pasted from an AI often arrives as ONE line with inline "- Item"
 * bullets. Break those onto their own lines so they store (and render) as a
 * proper list. Leaves already-multiline text untouched, and only acts when
 * there are 2+ inline bullet markers (so we don't mangle a stray hyphen).
 */
function normalizeDescription(raw) {
    if (!raw || typeof raw !== 'string') return raw;
    if (/\r?\n/.test(raw)) return raw;                          // already has line breaks
    if ((raw.match(/ - (?=[A-Z0-9])/g) || []).length < 2) return raw;
    return raw.replace(/ - (?=[A-Z0-9])/g, '\n- ').trim();
}

module.exports = { normalizeDescription };
