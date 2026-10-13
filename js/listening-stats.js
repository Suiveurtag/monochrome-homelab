import I_CHEVRON_LEFT from '!lucide/chevron-left.svg?svg&icon';
import I_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import I_LOCK from '!lucide/lock-keyhole.svg?svg&icon';
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_MUSIC from '!lucide/audio-lines.svg?svg&icon';
import I_REFRESH from '!lucide/refresh-cw.svg?svg&icon';
import { animateStatsScene } from './listening-stats-scene.js';
import { pb } from './accounts/config.js';
import { listeningTimezoneOffsets } from './listening-timezone.js';

const escape = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const count = (n) => new Intl.NumberFormat().format(n || 0);
const minutes = (n) => count(Math.round((n || 0) / 60));
const dateKey = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const periods = { day: 'Day', week: 'Week', month: 'Month', year: 'Year', lifetime: 'Lifetime' };
const tones = [
    'var(--stats-color-0)',
    'var(--stats-color-1)',
    'var(--stats-color-2)',
    'color-mix(in srgb, var(--stats-color-0) 45%, var(--foreground))',
    'color-mix(in srgb, var(--stats-color-1) 45%, var(--foreground))',
    'var(--muted-foreground)',
    'var(--border)',
];
function cover(item) {
    const url = item.cover;
    return url && /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(url)
        ? `<img src="${escape(url)}" alt="" loading="lazy" onerror="this.hidden=true" />`
        : `<span aria-hidden="true">${I_MUSIC(19)}</span>`;
}
function labelFor(key, period) {
    if (period === 'lifetime') return key;
    if (period === 'day') return `${key.slice(-2)}:00`;
    const date = new Date(`${key}${key.length === 7 ? '-01' : ''}T12:00:00`);
    return date.toLocaleDateString(
        undefined,
        period === 'year'
            ? { month: 'short' }
            : {
                  weekday: period === 'week' ? 'short' : undefined,
                  day: 'numeric',
                  month: period === 'week' ? undefined : 'short',
              }
    );
}
function fullLabel(key, period) {
    if (period === 'day') return `${key.slice(0, 10)} · ${key.slice(-2)}:00`;
    return labelFor(key, period);
}
function periodLabel(data, anchor, period) {
    if (period === 'lifetime') return 'All your listening';
    const format = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const start = data?.start ? new Date(data.start) : new Date(`${anchor}T12:00:00`);
    if (period === 'day') return format.format(start);
    if (period === 'year') return String(start.getFullYear());
    if (period === 'month') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return data?.end ? `${format.format(start)} – ${format.format(new Date(data.end - 1))}` : 'This week';
}

class ListeningStats {
    constructor(ui) {
        this.ui = ui;
        this.root = document.getElementById('page-stats');
        this.period = 'week';
        this.anchor = dateKey();
        this.rank = 'tracks';
        this.unit = 'minutes';
        this.historyPage = 1;
        this.generation = 0;
        this.data = null;
        let compactChart = this.root.clientWidth <= 560;
        this.resizeObserver = new ResizeObserver(() => {
            const compact = this.root.clientWidth <= 560;
            if (compact !== compactChart && this.active() && this.data?.summary) {
                const chart = this.root.querySelector('#stats-chart');
                if (chart) chart.innerHTML = this.chart();
            }
            compactChart = compact;
        });
        this.resizeObserver.observe(this.root);
        this.root.addEventListener('click', (event) => void this.click(event));
        this.root.addEventListener('change', (event) => {
            if (event.target.id === 'stats-date') {
                this.anchor = event.target.value || dateKey();
                this.historyPage = 1;
                this.updateUrl();
                void this.load();
            }
        });
        this.root.addEventListener('pointerover', (event) => {
            const target = event.target.closest('[data-chart-point]');
            if (target) this.showPoint(Number(target.dataset.chartPoint));
        });
        this.root.addEventListener('focusin', (event) => {
            const target = event.target.closest('[data-chart-point]');
            if (target) this.showPoint(Number(target.dataset.chartPoint));
        });
        this.root.addEventListener('keydown', (event) => {
            const point = event.target.closest('[data-chart-point]');
            if (!point || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            const points = [...this.root.querySelectorAll('[data-chart-point]')];
            const index = points.indexOf(point);
            const next =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? points.length - 1
                      : Math.min(points.length - 1, Math.max(0, index + (event.key === 'ArrowLeft' ? -1 : 1)));
            event.preventDefault();
            points[next]?.focus();
        });
        window.addEventListener('listening-stream-synced', () => this.scheduleRefresh());
        window.addEventListener('instance-policy-applied', () => {
            if (this.active()) void this.load();
        });
        pb.authStore.onChange(() => {
            this.generation++;
            this.data = null;
            this.root.querySelector('#stats-content').innerHTML = '';
            if (this.active()) void this.load();
        });
        void pb
            .collection('app_config')
            .subscribe('*', () => {
                if (this.active()) void this.load();
            })
            .catch(() => {});
        this.poll = setInterval(() => {
            if (this.active() && !document.hidden) void this.load(true);
        }, 30000);
    }
    active() {
        return this.ui.currentPage === 'stats';
    }
    scheduleRefresh() {
        if (!this.active()) return;
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => void this.load(true), 1500);
    }
    updateUrl() {
        window.history.replaceState({}, '', `/stats?period=${this.period}&date=${this.anchor}`);
    }
    async open() {
        const url = new URL(window.location.href);
        this.period = periods[url.searchParams.get('period')] ? url.searchParams.get('period') : 'week';
        this.anchor = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
            ? url.searchParams.get('date')
            : dateKey();
        this.historyPage = 1;
        await this.load();
    }
    async request(extra = {}) {
        const date = new Date(`${this.anchor}T12:00:00`);
        return pb.send('/api/monochrome/listening/stats', {
            method: 'GET',
            query: {
                period: this.period,
                anchor: this.anchor,
                offset: -date.getTimezoneOffset(),
                offsets: listeningTimezoneOffsets(date.getFullYear(), this.period === 'lifetime'),
                page: this.historyPage,
                ...extra,
            },
            requestKey: null,
        });
    }
    async load(quiet = false) {
        const generation = ++this.generation;
        const uid = pb.authStore.record?.id;
        const content = this.root.querySelector('#stats-content');
        if (!quiet) {
            this.data = null;
            content.innerHTML =
                '<div class="stats-loading" role="status"><span></span><span></span><p>Loading your listening…</p></div>';
        }
        this.root.setAttribute('aria-busy', 'true');
        this.root.querySelector('#stats-export').disabled = true;
        this.updateControls();
        try {
            if (!pb.authStore.isValid) {
                content.innerHTML = this.message(
                    'Sign in to see your listening',
                    'Your listening stats belong to your account and follow you across devices.',
                    I_MUSIC
                );
                return;
            }
            const data = await this.request();
            if (generation !== this.generation || uid !== pb.authStore.record?.id || !this.active()) return;
            this.data = data;
            this.updateControls();
            if (data.locked) {
                content.innerHTML = this.message(
                    data.locked === 'all' ? 'Listening stats are locked' : 'Your recap is under wraps',
                    data.locked === 'all'
                        ? 'The administrator has locked listening stats for everyone. Your music still counts; come back when stats are unlocked.'
                        : 'Year and Lifetime are locked for everyone ahead of the annual recap. You can still explore Day, Week and Month.',
                    I_LOCK
                );
                return;
            }
            this.root.querySelector('#stats-export').disabled = false;
            const focused = document.activeElement?.closest(
                '#stats-content [data-chart-point], #stats-content [data-hour], #stats-content [data-play-track]'
            );
            const focusAttr =
                focused &&
                ['data-chart-point', 'data-hour', 'data-play-track'].find((attr) => focused.hasAttribute(attr));
            const focusValue = focusAttr ? focused.getAttribute(focusAttr) : null;
            content.classList.toggle('stats-update', quiet);
            this.render();
            if (quiet && focusAttr)
                this.root.querySelector(`[${focusAttr}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
            if (quiet) this.root.querySelector('#stats-content').classList.add('stats-update');
            else this.root.querySelector('#stats-content').classList.remove('stats-update');
        } catch (error) {
            if (generation !== this.generation) return;
            this.data = null;
            content.innerHTML = `${this.message('Your stats could not be loaded', error.status === 0 ? 'The server is unreachable. Check your connection and retry; pending listens stay on this device.' : 'Please retry. If the problem continues, contact your instance administrator.', I_REFRESH)}<button type="button" class="btn-secondary stats-retry" data-stats-action="retry">Retry</button>`;
        } finally {
            if (generation === this.generation) this.root.removeAttribute('aria-busy');
        }
    }
    message(title, text, icon) {
        return `<div class="stats-empty" role="status"><span class="stats-empty-icon">${icon(32)}</span><h2>${escape(title)}</h2><p>${escape(text)}</p></div>`;
    }
    updateControls() {
        const locked = this.data?.policy?.longTermLocked;
        for (const button of this.root.querySelectorAll('[data-period]')) {
            button.setAttribute('aria-pressed', String(button.dataset.period === this.period));
            const long = ['year', 'lifetime'].includes(button.dataset.period);
            button.classList.toggle('is-locked', Boolean(long && locked));
            button.innerHTML = `${periods[button.dataset.period]}${long && locked ? I_LOCK(12) : ''}`;
            button.title = long && locked ? 'Locked for the annual recap' : '';
        }
        this.root.querySelector('#stats-period-label').textContent = periodLabel(this.data, this.anchor, this.period);
        const input = this.root.querySelector('#stats-date');
        input.value = this.anchor;
        input.max = dateKey();
        input.disabled = this.period === 'lifetime';
        this.root.querySelector('[data-stats-action="previous"]').disabled = this.period === 'lifetime';
        const current = new Date(`${this.anchor}T12:00:00`),
            today = new Date();
        const same =
            this.period === 'day'
                ? this.anchor >= dateKey()
                : this.period === 'month'
                  ? current.getFullYear() === today.getFullYear() && current.getMonth() === today.getMonth()
                  : this.period === 'year'
                    ? current.getFullYear() === today.getFullYear()
                    : +current > +today - ((today.getDay() + 6) % 7) * 86400000;
        this.root.querySelector('[data-stats-action="next"]').disabled = this.period === 'lifetime' || same;
    }
    render() {
        const d = this.data,
            s = d.summary;
        const comparison =
            s.previousSeconds > 0
                ? `${Math.round((s.seconds / s.previousSeconds - 1) * 100) > 0 ? '+' : ''}${Math.round((s.seconds / s.previousSeconds - 1) * 100)}% vs. previous ${this.period}`
                : 'Time actually spent listening';
        const favorites = d.top.tracks
            .filter((track) => track.cover && !/\/assets\/appicon\.png(?:[?#]|$)/.test(track.cover))
            .slice(0, 3);
        const most = d.top.tracks[0];
        this.root.querySelector('#stats-content').innerHTML = `
            <section class="stats-scene" aria-label="Your listening in this period">
                <div class="stats-ambience" aria-hidden="true"></div>
                <div class="stats-stage">
                    <div class="stats-headline"><div class="stats-total" data-count="${Math.round(s.seconds / 60)}">${minutes(s.seconds)}</div><h2>minutes listened</h2><p class="stats-comparison">${this.period === 'lifetime' ? 'Across your listening history' : comparison}</p>
                    <dl class="stats-stage-metrics"><div><dd>${count(s.streams)}</dd><dt>streams</dt></div><div><dd>${count(s.artists)}</dd><dt>artists</dt></div><div><dd>${count(s.activeDays)}</dd><dt>active days</dt></div></dl>
                    <p class="stats-stage-detail">${count(s.tracks)} tracks · ${count(s.albums)} albums · ${count(s.longestStreak)} day longest streak</p></div>
                    <div class="stats-showcase">
                        <div class="stats-cover-fan" data-cover-count="${favorites.length}"><svg class="stats-orbit" viewBox="0 0 600 350" aria-hidden="true"><ellipse cx="300" cy="175" rx="284" ry="63" transform="rotate(-19 300 175)"/></svg>
                        ${favorites.map((track, i) => `<button type="button" class="stats-cover-card stats-cover-${i}" data-play-track="${escape(track.id)}" aria-label="Play ${escape(track.title)}" style="--stats-order:${i}">${cover(track)}<span class="stats-cover-play">${I_PLAY(24)}</span></button>`).join('')}
                        ${!most ? `<div class="stats-no-cover">${I_MUSIC(48)}<span>Your next favorite starts with a listen.</span></div>` : ''}</div>
                        ${most ? `<div class="stats-showcase-caption"><span><strong><span class="stats-most-label">Your most played · </span>${escape(most.title)}</strong><span>${escape((most.artists || []).map((a) => a.name).join(', '))}</span></span><button type="button" class="stats-hero-play" data-play-track="${escape(most.id)}" aria-label="Play ${escape(most.title)}">${I_PLAY(22)}</button></div>` : ''}
                    </div>
                </div>
                <section class="stats-trend" aria-labelledby="stats-trend-title"><div class="stats-section-header"><div><h2 id="stats-trend-title">Listening activity</h2><p>${this.period === 'day' ? 'Hour by hour' : this.period === 'year' ? 'Month by month' : this.period === 'lifetime' ? 'Year by year' : 'Day by day'}</p></div><div class="stats-segments" role="group" aria-label="Chart measure"><button type="button" data-unit="minutes" aria-pressed="${this.unit === 'minutes'}">Minutes</button><button type="button" data-unit="streams" aria-pressed="${this.unit === 'streams'}">Streams</button></div></div><div id="stats-chart">${this.chart()}</div></section>
            </section>
            ${s.streams === 0 && s.seconds === 0 ? `<div class="stats-first-listen"><strong>${this.period === 'lifetime' ? 'Your listening story starts here' : 'A quiet period'}</strong><span>Listen to a track for 30 seconds to make it count. Stats collect new listens across your signed-in devices.</span><a href="/library">Explore your library ${I_CHEVRON_RIGHT(15)}</a></div>` : ''}
            <div class="stats-analysis">
            <section class="stats-ranking stats-panel" aria-labelledby="stats-ranking-title"><div class="stats-section-header"><div><h2 id="stats-ranking-title">On repeat</h2><p>Your most played music in this period</p></div><div class="stats-segments" role="group" aria-label="Ranking type">${['tracks', 'artists', 'albums'].map((type) => `<button type="button" data-rank="${type}" aria-pressed="${type === this.rank}">${type[0].toUpperCase() + type.slice(1)}</button>`).join('')}</div></div><div id="stats-rank-list">${this.ranking()}</div></section>
<div class="stats-side-rail"><aside class="stats-artists stats-panel" aria-labelledby="stats-artists-title"><div class="stats-section-header"><div><h2 id="stats-artists-title">Your rotation</h2><p>Share of artist listening time</p></div></div>${this.distribution()}</aside>
            <section class="stats-habits stats-panel" aria-labelledby="stats-habits-title"><div class="stats-section-header"><div><h2 id="stats-habits-title">Listening by hour</h2><p>Listening time by hour · ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)}</p></div><span class="stats-habit-note" aria-live="polite">${s.seconds > 0 ? `Peak hour · ${String(d.hours.indexOf(Math.max(...d.hours))).padStart(2, '0')}:00` : 'Your rhythm will appear here'}</span></div><div class="stats-hour-bars">${this.hours()}</div></section>
</div></div>
            <section class="stats-history" aria-labelledby="stats-history-title"><div class="stats-section-header"><div><h2 id="stats-history-title">Listening history</h2><p>Every stream, including repeats</p></div><span>${count(d.historyTotal)} streams</span></div><div id="stats-history-list">${this.history()}</div><div class="stats-history-footer"><span>Page ${count(d.historyPage)} of ${count(Math.max(1, Math.ceil(d.historyTotal / 30)))}</span><div><button type="button" class="stats-icon-button" data-stats-action="history-previous" aria-label="Previous history page" ${d.historyPage <= 1 ? 'disabled' : ''}>${I_CHEVRON_LEFT(18)}</button><button type="button" class="stats-icon-button" data-stats-action="history-next" aria-label="Next history page" ${d.historyPage * 30 >= d.historyTotal ? 'disabled' : ''}>${I_CHEVRON_RIGHT(18)}</button></div></div></section>
            <p class="stats-footnote">A playback session counts once after 30 seconds of heard audio. Pauses and seeks do not add listening time. Only new listens are included; earlier device history cannot be reconstructed reliably. Updated ${new Date(d.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.</p>`;
        animateStatsScene(this.root);
    }
    chart() {
        const items = this.data.activity;
        const values = items.map((p) => (this.unit === 'minutes' ? p.seconds / 60 : p.streams));
        const max = Math.max(1, ...values);
        const ceiling = Math.ceil(max / 4) * 4;
        const width = this.root.clientWidth <= 560 ? 400 : 1000;
        const right = width - 32;
        const span = right - 48;
        const x = (i) => 48 + (i / Math.max(1, items.length - 1)) * span;
        const y = (value) => 194 - (value / ceiling) * 160;
        const coordinates = values.map((v, i) => [x(i), y(v)]);
        const curve = coordinates
            .map(([px, py], i) =>
                i === 0
                    ? `M ${px},${py}`
                    : `C ${coordinates[i - 1][0] + (px - coordinates[i - 1][0]) / 2},${coordinates[i - 1][1]} ${px - (px - coordinates[i - 1][0]) / 2},${py} ${px},${py}`
            )
            .join(' ');
        const ticks = [
            ...new Set([
                0,
                Math.floor((items.length - 1) / 4),
                Math.floor((items.length - 1) / 2),
                Math.floor(((items.length - 1) * 3) / 4),
                items.length - 1,
            ]),
        ];
        return `<figure class="stats-chart-figure"><div class="stats-chart-tooltip" hidden aria-hidden="true"></div><svg class="stats-chart-svg" viewBox="0 0 ${width} 240" preserveAspectRatio="none" role="group" aria-labelledby="stats-chart-caption">
            <defs><linearGradient id="stats-line-colors"><stop stop-color="var(--stats-color-0)"/><stop offset=".5" stop-color="var(--stats-color-1)"/><stop offset="1" stop-color="var(--stats-color-2)"/></linearGradient><linearGradient id="stats-area-color" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--stats-color-0)" stop-opacity=".22"/><stop offset="1" stop-color="var(--stats-color-1)" stop-opacity="0"/></linearGradient></defs>
            ${[0, 2, 4].map((i) => `<line class="stats-gridline" x1="48" x2="${right}" y1="${y((ceiling * i) / 4)}" y2="${y((ceiling * i) / 4)}"/><text x="32" y="${y((ceiling * i) / 4) + 4}" text-anchor="end">${count((ceiling * i) / 4)}</text>`).join('')}
            ${values.some((v) => v > 0) ? `<path class="stats-chart-area" d="${curve} L ${x(items.length - 1)},194 L ${x(0)},194 Z"/><path class="stats-chart-line" d="${curve}" pathLength="1"/>${values.map((v, i) => `<circle class="stats-chart-dot" data-point-dot="${i}" cx="${x(i)}" cy="${y(v)}" r="3"/>`).join('')}` : `<text class="stats-no-activity" x="${width / 2}" y="115" text-anchor="middle">No listening activity in this period</text>`}
            ${ticks
                .filter((i) => i >= 0)
                .map(
                    (i) =>
                        `<text x="${x(i)}" y="224" text-anchor="middle">${escape(labelFor(items[i].key, this.period))}</text>`
                )
                .join('')}
            ${items.map((p, i) => `<rect class="stats-chart-hit" x="${x(i) - Math.min(20, span / Math.max(1, items.length) / 2)}" y="30" width="${Math.min(40, span / Math.max(1, items.length))}" height="165" tabindex="0" role="button" data-chart-point="${i}" aria-label="${escape(fullLabel(p.key, this.period))}: ${minutes(p.seconds)} minutes, ${count(p.streams)} streams"/>`).join('')}
            </svg><figcaption id="stats-chart-caption"><span>Hover, tap or use arrow keys to explore</span><strong id="stats-chart-detail" aria-live="polite">${minutes(this.data.summary.seconds)} min · ${count(this.data.summary.streams)} streams</strong></figcaption></figure>`;
    }
    showPoint(index) {
        const item = this.data?.activity?.[index];
        const detail = this.root.querySelector('#stats-chart-detail');
        this.root
            .querySelectorAll('[data-point-dot]')
            .forEach((dot) => dot.classList.toggle('is-selected', Number(dot.dataset.pointDot) === index));
        this.root
            .querySelectorAll('[data-chart-point]')
            .forEach((point) => point.setAttribute('aria-pressed', String(Number(point.dataset.chartPoint) === index)));
        if (item && detail) {
            const tooltip = this.root.querySelector('.stats-chart-tooltip');
            if (tooltip) {
                tooltip.hidden = false;
                tooltip.textContent = `${fullLabel(item.key, this.period)} · ${minutes(item.seconds)} min · ${count(item.streams)} streams`;
                tooltip.style.left = `${Math.max(15, Math.min(85, 5 + (index / Math.max(1, this.data.activity.length - 1)) * 90))}%`;
            }
            detail.textContent = `${fullLabel(item.key, this.period)} · ${minutes(item.seconds)} min · ${count(item.streams)} streams`;
        }
    }
    distribution() {
        const data = this.data.distribution;
        const total = this.data.artistSeconds;
        const shown = data.reduce((sum, artist) => sum + artist.seconds, 0);
        const entries = total > shown ? [...data, { name: 'Other artists', seconds: total - shown }] : data;
        let offset = 0;
        return `<div class="stats-rotation"><svg class="stats-donut" viewBox="0 0 160 160" role="img" aria-label="Artist listening time distribution"><circle class="stats-donut-track" cx="80" cy="80" r="62"/>${entries
            .map((entry, i) => {
                const share = total ? (entry.seconds / total) * 100 : 0;
                const out = `<circle class="stats-donut-segment" cx="80" cy="80" r="62" pathLength="100" stroke="${tones[i]}" stroke-dasharray="${share} ${100 - share}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"><title>${escape(entry.name)}: ${Math.round(share)}%</title></circle>`;
                offset += share;
                return out;
            })
            .join(
                ''
            )}<text x="80" y="79" text-anchor="middle">${count(this.data.summary.artists)}</text><text class="stats-donut-label" x="80" y="98" text-anchor="middle">artists</text></svg><ul class="stats-legend">${entries.length ? entries.map((a, i) => `<li><span class="stats-swatch" style="--stats-tone:${tones[i]}"></span>${a.id ? `<a href="/artist/${encodeURIComponent(a.id)}">${escape(a.name)}</a>` : `<span>${escape(a.name)}</span>`}<strong>${Math.round((a.seconds / total) * 100)}%</strong></li>`).join('') : '<li class="stats-muted">Your artists will appear after your first stream.</li>'}</ul></div>`;
    }
    hours() {
        const max = Math.max(1, ...this.data.hours);
        return this.data.hours
            .map(
                (seconds, hour) =>
                    `<button type="button" class="stats-hour" style="--stats-bar-ratio:${seconds / max};--stats-tone:${tones[Math.floor(hour / 8)]};--stats-order:${hour}" title="${hour}:00 · ${minutes(seconds)} minutes" aria-label="${hour}:00: ${minutes(seconds)} minutes" data-hour="${hour}"><span></span><small>${hour % 4 === 0 ? String(hour).padStart(2, '0') : ''}</small></button>`
            )
            .join('');
    }
    ranking() {
        const items = this.data.top[this.rank];
        if (!items.length) return '<p class="stats-table-empty">No music to rank in this period yet.</p>';
        const artist = this.rank === 'artists';
        return `<table class="stats-table"><caption class="sr-only">Top ${this.rank} by streams</caption><thead><tr><th scope="col" class="stats-position">#</th><th scope="col">${artist ? 'Artist' : this.rank === 'tracks' ? 'Track' : 'Album'}</th>${this.rank === 'tracks' ? '<th scope="col" class="stats-album-column">Album</th>' : ''}<th scope="col" class="stats-number">Streams</th><th scope="col" class="stats-number stats-time-column">Minutes</th><th scope="col"><span class="sr-only">Open or play</span></th></tr></thead><tbody>${items.map((item, i) => `<tr><td class="stats-position">${String(i + 1).padStart(2, '0')}</td><td><div class="stats-identity"><span class="stats-artwork ${artist ? 'is-artist' : ''}">${cover(item)}</span><span><a href="/${artist ? 'artist' : this.rank === 'albums' ? 'album' : 'track'}/${encodeURIComponent(item.id)}">${escape(item.title || item.name)}</a>${!artist ? `<small>${escape((item.artists || []).map((a) => a.name).join(', '))}</small>` : ''}</span></div></td>${this.rank === 'tracks' ? `<td class="stats-album-column">${escape(item.album?.title || 'Single')}</td>` : ''}<td class="stats-number"><strong>${count(item.streams)}</strong></td><td class="stats-number stats-time-column">${minutes(item.seconds)}</td><td class="stats-row-action">${this.rank === 'tracks' ? `<button type="button" class="stats-icon-button" data-play-track="${escape(item.id)}" aria-label="Play ${escape(item.title)}">${I_PLAY(16)}</button>` : `<a class="stats-icon-button" href="/${artist ? 'artist' : 'album'}/${encodeURIComponent(item.id)}" aria-label="Open ${escape(item.name || item.title)}">${I_CHEVRON_RIGHT(16)}</a>`}</td></tr>`).join('')}</tbody></table>`;
    }
    history() {
        if (!this.data.history.length)
            return '<p class="stats-table-empty">Qualified listens will appear here, with their date and listening time.</p>';
        return `<ul class="stats-history-items">${this.data.history.map((session) => `<li><span class="stats-artwork">${cover(session.track)}</span><span class="stats-history-track"><a href="/track/${encodeURIComponent(session.track.id)}">${escape(session.track.title)}</a><small>${escape((session.track.artists || []).map((a) => a.name).join(', '))}</small></span><time datetime="${new Date(session.startedAt).toISOString()}">${new Date(session.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}<small>${new Date(session.startedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</small></time><span class="stats-history-duration">${Math.floor(session.seconds / 60)}:${String(Math.floor(session.seconds % 60)).padStart(2, '0')}<small>${session.ended ? 'listened' : 'in progress'}</small></span><button class="stats-icon-button" type="button" data-play-track="${escape(session.track.id)}" aria-label="Play ${escape(session.track.title)}">${I_PLAY(16)}</button></li>`).join('')}</ul>`;
    }
    async click(event) {
        const button = event.target.closest('button, [data-chart-point]');
        if (!button || button.disabled) return;
        if (button.dataset.period) {
            this.period = button.dataset.period;
            this.historyPage = 1;
            this.updateUrl();
            await this.load();
        }
        if (button.dataset.unit && this.data?.summary) {
            this.unit = button.dataset.unit;
            this.root.querySelector('#stats-chart').innerHTML = this.chart();
            for (const b of this.root.querySelectorAll('[data-unit]'))
                b.setAttribute('aria-pressed', String(b.dataset.unit === this.unit));
        }
        if (button.dataset.rank && this.data?.summary) {
            this.rank = button.dataset.rank;
            this.root.querySelector('#stats-rank-list').innerHTML = this.ranking();
            for (const b of this.root.querySelectorAll('[data-rank]'))
                b.setAttribute('aria-pressed', String(b.dataset.rank === this.rank));
        }
        if (button.dataset.chartPoint !== undefined) this.showPoint(Number(button.dataset.chartPoint));
        if (button.dataset.hour !== undefined) {
            const hour = Number(button.dataset.hour);
            this.root.querySelector('.stats-habit-note').textContent =
                `${String(hour).padStart(2, '0')}:00 · ${minutes(this.data.hours[hour])} minutes listened`;
        }
        if (button.dataset.playTrack) {
            button.disabled = true;
            try {
                const track = await this.ui.api.getTrackMetadata(button.dataset.playTrack);
                await this.ui.player.setQueue([track]);
                await this.ui.player.playAtIndex(0);
            } catch {
                this.root.querySelector('#stats-feedback').textContent =
                    'This track is no longer available in your library.';
            } finally {
                button.disabled = false;
            }
        }
        const action = button.dataset.statsAction;
        if (action === 'retry' || action === 'refresh') await this.load();
        if (action === 'previous' || action === 'next' || action === 'today') {
            const date = new Date(`${this.anchor}T12:00:00`),
                dir = action === 'previous' ? -1 : 1;
            if (action === 'today') this.anchor = dateKey();
            else {
                if (this.period === 'month') {
                    date.setDate(1);
                    date.setMonth(date.getMonth() + dir);
                } else if (this.period === 'year') {
                    date.setMonth(0, 1);
                    date.setFullYear(date.getFullYear() + dir);
                } else date.setDate(date.getDate() + dir * (this.period === 'week' ? 7 : 1));
                this.anchor = dateKey(date);
            }
            this.historyPage = 1;
            this.updateUrl();
            await this.load();
        }
        if (action === 'history-next' || action === 'history-previous') {
            this.historyPage += action === 'history-next' ? 1 : -1;
            await this.load(true);
        }
        if (action === 'export') {
            button.disabled = true;
            try {
                const data = await this.request({ export: 'true' });
                if (data.locked) {
                    await this.load();
                    return;
                }
                const blob = new Blob(
                    [JSON.stringify({ ...data, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }, null, 2)],
                    { type: 'application/json' }
                );
                const url = URL.createObjectURL(blob),
                    a = document.createElement('a');
                a.href = url;
                a.download = `monochrome-listening-${this.period}-${this.anchor}.json`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch {
                this.root.querySelector('#stats-feedback').textContent =
                    'Export failed. Check your connection and retry.';
            } finally {
                button.disabled = !this.data?.summary;
            }
        }
    }
}
let instance;
export async function renderListeningStats(ui) {
    instance ||= new ListeningStats(ui);
    await instance.open();
}
