/**
 * Admin dashboard analytics charts (Recharts + React, UMD globals).
 * Exposes window.renderDashboardCharts(data) where `data` is the payload
 * from GET /api/admin/analytics. No JSX — uses React.createElement.
 */
(function () {
    'use strict';

    if (!window.React || !window.ReactDOM || !window.Recharts) {
        console.error('[dashboard-charts] React / Recharts UMD bundles not loaded');
        return;
    }

    var h = React.createElement;
    var R = window.Recharts;
    var ResponsiveContainer = R.ResponsiveContainer,
        ComposedChart = R.ComposedChart,
        Area = R.Area,
        Line = R.Line,
        Bar = R.Bar,
        XAxis = R.XAxis,
        YAxis = R.YAxis,
        CartesianGrid = R.CartesianGrid,
        Tooltip = R.Tooltip,
        Legend = R.Legend,
        PieChart = R.PieChart,
        Pie = R.Pie,
        Cell = R.Cell,
        BarChart = R.BarChart,
        defs = null;

    // Brand palette
    var NAVY = '#1a1a2e',
        GOLD = '#d4af6a',
        GREEN = '#27ae60',
        ORANGE = '#f39c12',
        BLUE = '#3498db',
        RED = '#e94560',
        PURPLE = '#9b59b6';

    var STATUS_COLORS = {
        pending: ORANGE,
        processing: BLUE,
        confirmed: BLUE,
        shipped: NAVY,
        delivered: GREEN,
        completed: GREEN,
        cancelled: RED,
        refunded: RED
    };
    var PIE_FALLBACK = [GOLD, NAVY, GREEN, BLUE, ORANGE, PURPLE, RED];

    // Cache React roots per mount element so re-renders don't warn/leak
    var roots = {};
    function rootFor(id) {
        var el = document.getElementById(id);
        if (!el) return null;
        if (!roots[id]) roots[id] = ReactDOM.createRoot(el);
        return roots[id];
    }

    function ksh(v) {
        return 'KSh ' + Number(v || 0).toLocaleString('en-KE');
    }

    function shortDate(iso) {
        // iso = "YYYY-MM-DD"
        var p = String(iso).split('-');
        if (p.length < 3) return iso;
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10);
    }

    function emptyState(msg) {
        return h('div', { className: 'chart-empty' },
            h('span', { className: 'icon' }, '📊'),
            h('span', null, msg || 'No data yet')
        );
    }

    function currencyTooltip(props) {
        if (!props || !props.active || !props.payload || !props.payload.length) return null;
        return h('div', { className: 'recharts-default-tooltip' },
            h('p', { className: 'recharts-tooltip-label' }, props.label),
            props.payload.map(function (entry, i) {
                var isMoney = entry.dataKey === 'revenue';
                return h('p', {
                    key: i,
                    style: { color: entry.color, margin: '2px 0' }
                }, entry.name + ': ' + (isMoney ? ksh(entry.value) : entry.value));
            })
        );
    }

    /* ---------- Revenue & orders trend (line/area + bar) ---------- */
    function renderRevenueTrend(rows) {
        var root = rootFor('chart-revenue');
        if (!root) return;
        if (!rows || !rows.length || rows.every(function (r) { return !r.revenue && !r.orders; })) {
            root.render(emptyState('No revenue in the last 30 days'));
            return;
        }
        root.render(
            h(ResponsiveContainer, { width: '100%', height: '100%' },
                h(ComposedChart, { data: rows, margin: { top: 10, right: 16, left: 0, bottom: 0 } },
                    h('defs', null,
                        h('linearGradient', { id: 'revGrad', x1: 0, y1: 0, x2: 0, y2: 1 },
                            h('stop', { offset: '5%', stopColor: GOLD, stopOpacity: 0.45 }),
                            h('stop', { offset: '95%', stopColor: GOLD, stopOpacity: 0.03 })
                        )
                    ),
                    h(CartesianGrid, { strokeDasharray: '3 3', stroke: '#eef0f3', vertical: false }),
                    h(XAxis, { dataKey: 'date', tickFormatter: shortDate, tickLine: false, axisLine: { stroke: '#e9ecef' }, minTickGap: 24 }),
                    h(YAxis, { yAxisId: 'left', tickFormatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }, tickLine: false, axisLine: false, width: 48 }),
                    h(YAxis, { yAxisId: 'right', orientation: 'right', allowDecimals: false, tickLine: false, axisLine: false, width: 30 }),
                    h(Tooltip, { content: currencyTooltip, labelFormatter: shortDate }),
                    h(Legend, { iconType: 'circle', wrapperStyle: { paddingTop: 8 } }),
                    h(Area, { yAxisId: 'left', type: 'monotone', dataKey: 'revenue', name: 'Revenue', stroke: GOLD, strokeWidth: 2.5, fill: 'url(#revGrad)' }),
                    h(Line, { yAxisId: 'right', type: 'monotone', dataKey: 'orders', name: 'Orders', stroke: NAVY, strokeWidth: 2, dot: false })
                )
            )
        );
    }

    /* ---------- Orders by status (donut pie) ---------- */
    function renderStatusPie(rows) {
        var root = rootFor('chart-status');
        if (!root) return;
        if (!rows || !rows.length) {
            root.render(emptyState('No orders yet'));
            return;
        }
        var data = rows.map(function (r) { return { name: r.status, value: r.count }; });
        root.render(
            h(ResponsiveContainer, { width: '100%', height: '100%' },
                h(PieChart, null,
                    h(Tooltip, null),
                    h(Legend, { iconType: 'circle', verticalAlign: 'bottom', height: 36 }),
                    h(Pie, {
                        data: data, dataKey: 'value', nameKey: 'name',
                        cx: '50%', cy: '45%', innerRadius: 55, outerRadius: 90,
                        paddingAngle: 2, stroke: '#fff', strokeWidth: 2,
                        label: function (d) { return d.value; }
                    },
                        data.map(function (d, i) {
                            return h(Cell, { key: i, fill: STATUS_COLORS[d.name] || PIE_FALLBACK[i % PIE_FALLBACK.length] });
                        })
                    )
                )
            )
        );
    }

    /* ---------- Revenue by category (vertical bars) ---------- */
    function renderCategoryBar(rows) {
        var root = rootFor('chart-category');
        if (!root) return;
        if (!rows || !rows.length) {
            root.render(emptyState('No category sales yet'));
            return;
        }
        root.render(
            h(ResponsiveContainer, { width: '100%', height: '100%' },
                h(BarChart, { data: rows, margin: { top: 10, right: 16, left: 0, bottom: 0 } },
                    h(CartesianGrid, { strokeDasharray: '3 3', stroke: '#eef0f3', vertical: false }),
                    h(XAxis, { dataKey: 'category', tickLine: false, axisLine: { stroke: '#e9ecef' }, interval: 0, angle: rows.length > 4 ? -18 : 0, textAnchor: rows.length > 4 ? 'end' : 'middle', height: rows.length > 4 ? 60 : 30 }),
                    h(YAxis, { tickFormatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }, tickLine: false, axisLine: false, width: 48 }),
                    h(Tooltip, { content: currencyTooltip, cursor: { fill: 'rgba(212,175,106,0.08)' } }),
                    h(Bar, { dataKey: 'revenue', name: 'Revenue', radius: [6, 6, 0, 0], maxBarSize: 56 },
                        rows.map(function (r, i) {
                            return h(Cell, { key: i, fill: PIE_FALLBACK[i % PIE_FALLBACK.length] });
                        })
                    )
                )
            )
        );
    }

    /* ---------- Top products (horizontal bars) ---------- */
    function renderTopProducts(rows) {
        var root = rootFor('chart-topproducts');
        if (!root) return;
        if (!rows || !rows.length) {
            root.render(emptyState('No product sales yet'));
            return;
        }
        var data = rows.slice().reverse().map(function (r) {
            return { name: r.name.length > 24 ? r.name.slice(0, 22) + '…' : r.name, revenue: r.revenue, units: r.units };
        });
        root.render(
            h(ResponsiveContainer, { width: '100%', height: '100%' },
                h(BarChart, { data: data, layout: 'vertical', margin: { top: 6, right: 24, left: 8, bottom: 6 } },
                    h(CartesianGrid, { strokeDasharray: '3 3', stroke: '#eef0f3', horizontal: false }),
                    h(XAxis, { type: 'number', tickFormatter: function (v) { return v >= 1000 ? (v / 1000) + 'k' : v; }, tickLine: false, axisLine: { stroke: '#e9ecef' } }),
                    h(YAxis, { type: 'category', dataKey: 'name', tickLine: false, axisLine: false, width: 140 }),
                    h(Tooltip, { content: currencyTooltip, cursor: { fill: 'rgba(26,26,46,0.05)' } }),
                    h(Bar, { dataKey: 'revenue', name: 'Revenue', fill: NAVY, radius: [0, 6, 6, 0], maxBarSize: 26 })
                )
            )
        );
    }

    window.renderDashboardCharts = function (data) {
        if (!data) return;
        try { renderRevenueTrend(data.revenueByDay); } catch (e) { console.error('revenue chart', e); }
        try { renderStatusPie(data.ordersByStatus); } catch (e) { console.error('status chart', e); }
        try { renderCategoryBar(data.revenueByCategory); } catch (e) { console.error('category chart', e); }
        try { renderTopProducts(data.topProducts); } catch (e) { console.error('top products chart', e); }
    };
})();
