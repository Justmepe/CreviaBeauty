/**
 * Content Calendar — the Notion-style content ops board.
 *
 * Three views (board / calendar / table) over the same content_items, scoped to a
 * month, plus a monthly performance rollup and a Discord due-reminder trigger.
 * All functions are global so the inline admin nav (loadSectionData) and the section
 * markup's onclick handlers can reach them. Talks to /api/admin/content.
 */

// ---- state ----
var ccState = { month: null, view: 'board', items: [], loaded: false };

const CC_STATUSES = ['idea', 'draft', 'scheduled', 'published', 'skipped'];
const CC_STATUS_LABEL = { idea: 'Idea', draft: 'Draft', scheduled: 'Scheduled', published: 'Published', skipped: 'Skipped' };
const CC_STATUS_COLOR = { idea: '#95a5a6', draft: '#e67e22', scheduled: '#2980b9', published: '#27ae60', skipped: '#c0392b' };
const CC_METRIC_KEYS = ['reach', 'impressions', 'likes', 'comments', 'saves', 'shares', 'clicks', 'orders', 'revenue'];

// ---- helpers ----
function ccEsc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// 'YYYY-MM' for a given Date.
function ccMonthKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function ccTodayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ccMonthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function ccNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// ---- entry point (called by loadSectionData) ----
function loadContentCalendar() {
    if (!ccState.month) ccState.month = ccMonthKey(new Date());
    ccFetch();
}

async function ccFetch() {
    const label = document.getElementById('cc-month-label');
    if (label) label.textContent = ccMonthLabel(ccState.month);
    try {
        const [itemsRes, rollupRes] = await Promise.all([
            fetch('/api/admin/content?month=' + ccState.month),
            fetch('/api/admin/content/rollup?month=' + ccState.month)
        ]);
        ccState.items = itemsRes.ok ? await itemsRes.json() : [];
        const rollup = rollupRes.ok ? await rollupRes.json() : null;
        ccRenderRollup(rollup);
        ccRenderCurrentView();
    } catch (e) {
        const board = document.getElementById('cc-view-board');
        if (board) board.innerHTML = '<p style="color:#c0392b;">Failed to load content. Is the server running?</p>';
    }
}

function ccShiftMonth(delta) {
    const [y, m] = ccState.month.split('-').map(Number);
    ccState.month = ccMonthKey(new Date(y, m - 1 + delta, 1));
    ccFetch();
}

function ccSetView(view) {
    ccState.view = view;
    document.querySelectorAll('#cc-views button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    ['board', 'calendar', 'table'].forEach(v => {
        const el = document.getElementById('cc-view-' + v);
        if (el) el.style.display = v === view ? 'block' : 'none';
    });
    ccRenderCurrentView();
}

function ccRenderCurrentView() {
    if (ccState.view === 'board') ccRenderBoard();
    else if (ccState.view === 'calendar') ccRenderCalendar();
    else ccRenderTable();
}

// ---- board view ----
function ccRenderBoard() {
    const host = document.getElementById('cc-view-board');
    if (!host) return;
    const cols = CC_STATUSES.map(status => {
        const items = ccState.items.filter(i => i.status === status);
        const cards = items.map(ccCardHtml).join('') || '<p style="color:#b0b7c0;font-size:.8rem;margin:.25rem;">Nothing here</p>';
        return `<div class="cc-col">
            <h4><span>${CC_STATUS_LABEL[status]}</span><span>${items.length}</span></h4>
            ${cards}
        </div>`;
    }).join('');
    host.innerHTML = `<div class="cc-board">${cols}</div>`;
}

function ccCardHtml(i) {
    const meta = [i.platform, i.format].filter(Boolean).map(x => `<span class="cc-chip">${ccEsc(x)}</span>`).join('');
    const when = i.scheduled_date ? `<span>&#128197; ${ccEsc(i.scheduled_date)}${i.scheduled_time ? ' ' + ccEsc(i.scheduled_time) : ''}</span>` : '';
    return `<div class="cc-card" style="border-left-color:${CC_STATUS_COLOR[i.status]}" onclick="ccOpenModal(${i.id})">
        <div class="t">${ccEsc(i.title)}</div>
        <div class="m">${meta}${when}${i.pillar ? `<span>${ccEsc(i.pillar)}</span>` : ''}</div>
    </div>`;
}

// ---- calendar view ----
function ccRenderCalendar() {
    const host = document.getElementById('cc-view-calendar');
    if (!host) return;
    const [y, m] = ccState.month.split('-').map(Number);
    const firstDow = new Date(y, m - 1, 1).getDay();       // 0 = Sun
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = ccTodayStr();

    // Bucket scheduled items by their day-of-month.
    const byDay = {};
    ccState.items.forEach(i => {
        if (i.scheduled_date && i.scheduled_date.slice(0, 7) === ccState.month) {
            const d = Number(i.scheduled_date.slice(8, 10));
            (byDay[d] = byDay[d] || []).push(i);
        }
    });

    const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="dow">${d}</div>`).join('');
    let cells = '';
    for (let b = 0; b < firstDow; b++) cells += '<div class="cc-day empty"></div>';
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${ccState.month}-${String(day).padStart(2, '0')}`;
        const evs = (byDay[day] || []).map(i =>
            `<div class="cc-ev" style="background:${CC_STATUS_COLOR[i.status]}" title="${ccEsc(i.title)}" onclick="event.stopPropagation();ccOpenModal(${i.id})">${ccEsc(i.title)}</div>`
        ).join('');
        cells += `<div class="cc-day${dateStr === today ? ' today' : ''}" onclick="ccOpenModal(null,'${dateStr}')">
            <div class="dn">${day}</div>${evs}
        </div>`;
    }
    host.innerHTML = `<div class="cc-cal">${dows}${cells}</div>`;
}

// ---- table view ----
function ccRenderTable() {
    const host = document.getElementById('cc-view-table');
    if (!host) return;
    if (!ccState.items.length) {
        host.innerHTML = '<p style="color:#7f8c8d;">No posts this month. Click &ldquo;New post&rdquo; to start.</p>';
        return;
    }
    const rows = ccState.items.map(i => {
        const pub = i.published_at ? new Date(i.published_at).toLocaleDateString() : '';
        const link = i.link ? `<a href="${ccEsc(i.link)}" target="_blank" rel="noopener">open&#8599;</a>` : '';
        return `<tr onclick="ccOpenModal(${i.id})" style="cursor:pointer;">
            <td>${ccEsc(i.title)}</td>
            <td><span class="cc-status st-${i.status}">${CC_STATUS_LABEL[i.status]}</span></td>
            <td>${ccEsc(i.pillar || '')}</td>
            <td>${ccEsc(i.platform || '')}</td>
            <td>${ccEsc(i.format || '')}</td>
            <td>${ccEsc(i.scheduled_date || '')}${i.scheduled_time ? ' ' + ccEsc(i.scheduled_time) : ''}</td>
            <td>${ccEsc(pub)}</td>
            <td onclick="event.stopPropagation();">${link}</td>
        </tr>`;
    }).join('');
    host.innerHTML = `<div style="overflow-x:auto;"><table class="cc-table">
        <thead><tr><th>Title</th><th>Status</th><th>Pillar</th><th>Platform</th><th>Format</th><th>Scheduled</th><th>Published</th><th>Link</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
}

// ---- monthly performance rollup ----
function ccRenderRollup(r) {
    const host = document.getElementById('cc-rollup');
    if (!host) return;
    if (!r) { host.innerHTML = '<p style="color:#c0392b;margin:0;">Could not load performance summary.</p>'; return; }

    const onTimePct = (r.onTime + r.late) ? Math.round(r.onTime / (r.onTime + r.late) * 100) : null;
    const kpis = [
        { n: r.planned, l: 'Planned' },
        { n: r.published, l: 'Published' },
        { n: onTimePct === null ? '&mdash;' : onTimePct + '%', l: 'On time' },
        { n: r.skipped, l: 'Skipped' },
        { n: ccNum(r.metrics.reach).toLocaleString(), l: 'Reach' },
        { n: ccNum(r.metrics.orders).toLocaleString(), l: 'Orders' },
        { n: 'KES ' + ccNum(r.metrics.revenue).toLocaleString(), l: 'Revenue' }
    ].map(k => `<div class="cc-kpi"><div class="n">${k.n}</div><div class="l">${k.l}</div></div>`).join('');

    // Output by pillar: planned (gold) vs published (green) bars.
    const pillars = Object.keys(r.byPillar);
    const maxPillar = Math.max(1, ...pillars.map(p => Math.max(r.byPillar[p].planned, r.byPillar[p].published)));
    const pillarBars = pillars.length ? pillars.map(p => {
        const d = r.byPillar[p];
        return `<div class="cc-bar-row"><span title="${ccEsc(p)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ccEsc(p)}</span>
            <div class="cc-bar-track"><div class="cc-bar-fill pub" style="width:${d.published / maxPillar * 100}%"></div></div>
            <span>${d.published}/${d.planned}</span></div>`;
    }).join('') : '<p style="color:#7f8c8d;margin:0;">No pillars yet.</p>';

    // Published by day of week (Sun..Sat).
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxDow = Math.max(1, ...r.byDayOfWeek);
    const dowBars = r.byDayOfWeek.map((c, idx) =>
        `<div class="cc-bar-row"><span>${dow[idx]}</span>
            <div class="cc-bar-track"><div class="cc-bar-fill" style="width:${c / maxDow * 100}%"></div></div>
            <span>${c}</span></div>`
    ).join('');

    host.innerHTML = `
        <div class="cc-kpis">${kpis}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
            <div>
                <h4 style="margin:0 0 .6rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.03em;color:#7f8c8d;">Published vs planned, by pillar</h4>
                <div class="cc-bars">${pillarBars}</div>
            </div>
            <div>
                <h4 style="margin:0 0 .6rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.03em;color:#7f8c8d;">Published by day of week</h4>
                <div class="cc-bars">${dowBars}</div>
            </div>
        </div>`;
}

// ---- modal ----
function ccSetVal(id, v) { const el = document.getElementById(id); if (el) el.value = v === null || v === undefined ? '' : v; }
function ccGetVal(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

// id = existing item id (edit) or null (new). prefillDate optionally sets the date for a new item.
function ccOpenModal(id, prefillDate) {
    const item = id ? ccState.items.find(i => i.id === id) : null;
    document.getElementById('cc-modal-title').textContent = item ? 'Edit post' : 'New post';
    ccSetVal('cc-f-id', item ? item.id : '');
    ccSetVal('cc-f-title', item ? item.title : '');
    ccSetVal('cc-f-pillar', item ? item.pillar : '');
    ccSetVal('cc-f-platform', item ? item.platform : '');
    ccSetVal('cc-f-format', item ? item.format : '');
    ccSetVal('cc-f-product', item ? item.product : '');
    ccSetVal('cc-f-status', item ? item.status : 'idea');
    ccSetVal('cc-f-date', item ? (item.scheduled_date || '') : (prefillDate || ''));
    ccSetVal('cc-f-time', item ? (item.scheduled_time || '') : '');
    ccSetVal('cc-f-link', item ? item.link : '');
    ccSetVal('cc-f-notes', item ? item.notes : '');
    const m = (item && item.metrics) || {};
    CC_METRIC_KEYS.forEach(k => ccSetVal('cc-m-' + k, m[k] === undefined ? '' : m[k]));

    document.getElementById('cc-delete-btn').style.display = item ? 'inline-flex' : 'none';
    document.getElementById('cc-publish-btn').style.display = (item && item.status !== 'published') ? 'inline-flex' : 'none';
    document.getElementById('cc-save-status').textContent = '';
    document.getElementById('cc-modal').classList.add('open');
}

function ccCloseModal() { document.getElementById('cc-modal').classList.remove('open'); }

function ccCollectMetrics() {
    const metrics = {};
    CC_METRIC_KEYS.forEach(k => {
        const v = ccGetVal('cc-m-' + k);
        if (v !== '') metrics[k] = Number(v);
    });
    return metrics;
}

function ccFormBody() {
    return {
        title: ccGetVal('cc-f-title'),
        pillar: ccGetVal('cc-f-pillar'),
        platform: ccGetVal('cc-f-platform'),
        format: ccGetVal('cc-f-format'),
        product: ccGetVal('cc-f-product'),
        status: ccGetVal('cc-f-status'),
        scheduled_date: ccGetVal('cc-f-date'),
        scheduled_time: ccGetVal('cc-f-time'),
        link: ccGetVal('cc-f-link'),
        notes: ccGetVal('cc-f-notes'),
        metrics: ccCollectMetrics()
    };
}

async function ccSave() {
    const body = ccFormBody();
    if (!body.title) { document.getElementById('cc-save-status').style.color = '#c0392b'; document.getElementById('cc-save-status').textContent = 'Title is required'; return; }
    const id = ccGetVal('cc-f-id');
    const status = document.getElementById('cc-save-status');
    status.style.color = '#27ae60';
    status.textContent = 'Saving...';
    try {
        const res = await fetch('/api/admin/content' + (id ? '/' + id : ''), {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!res.ok) throw new Error(await res.text());
        ccCloseModal();
        await ccFetch();
    } catch (e) {
        status.style.color = '#c0392b';
        status.textContent = 'Save failed';
    }
}

async function ccPublishFromModal() {
    const id = ccGetVal('cc-f-id');
    if (!id) return;
    try {
        await fetch('/api/admin/content/' + id + '/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ link: ccGetVal('cc-f-link') })
        });
        ccCloseModal();
        await ccFetch();
    } catch (e) { /* ignore */ }
}

async function ccDelete() {
    const id = ccGetVal('cc-f-id');
    if (!id || !confirm('Delete this post permanently?')) return;
    try {
        await fetch('/api/admin/content/' + id, { method: 'DELETE' });
        ccCloseModal();
        await ccFetch();
    } catch (e) { /* ignore */ }
}

async function ccSendReminder(btn) {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sending...';
    try {
        const res = await fetch('/api/admin/content/remind', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        const data = await res.json();
        if (data.skipped) btn.textContent = 'No webhook set';
        else if (!data.count) btn.textContent = 'Nothing due';
        else btn.textContent = 'Pinged ' + data.count;
    } catch (e) {
        btn.textContent = 'Failed';
    }
    setTimeout(() => { btn.disabled = false; btn.innerHTML = orig; }, 2500);
}
