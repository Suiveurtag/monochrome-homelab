import I_CHEVRON_RIGHT from '!lucide/chevron-right.svg?svg&icon';
import I_LOCK from '!lucide/lock-keyhole.svg?svg&icon';
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_MUSIC from '!lucide/audio-lines.svg?svg&icon';
import I_REFRESH from '!lucide/refresh-cw.svg?svg&icon';
import { animateStatsScene, syncStatsSegments, transitionStatsContent } from './listening-stats-scene.js';
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
    'var(--stats-glow-0)',
    'var(--stats-glow-1)',
    'var(--stats-glow-2)',
    'color-mix(in oklch, var(--stats-glow-0), var(--stats-glow-2))',
    'color-mix(in oklch, var(--stats-glow-1), var(--stats-glow-2))',
];
const otherTone = 'color-mix(in srgb, var(--muted-foreground) 55%, transparent)';
const imageUrl = (url) => (url && /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(url) ? url : '');
const artistNames = (item) => (item.artists || []).map((a) => a.name).join(', ');
function cover(item, eager = false) {
    const url = imageUrl(item.cover);
    // Stage artwork is read for its colors, so it asks for CORS; a host without CORS still shows the cover.
    return url
        ? `<img src="${escape(url)}" alt="" ${eager ? `crossorigin="anonymous" loading="eager" onerror="if(this.crossOrigin)this.removeAttribute('crossorigin');else this.hidden=true"` : 'loading="lazy" onerror="this.hidden=true"'} />`
        : `<span aria-hidden="true">${I_MUSIC(19)}</span>`;
}
const hourLabel = (hour) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, hour));
const keyDate = (key) => new Date(`${key}${key.length === 7 ? '-01' : ''}T12:00:00`);
// The chart's line gradient; the selected point takes the color under it.
const chartHue = ['var(--stats-glow-1)', 'var(--stats-glow-0)', 'var(--stats-glow-2)', 'var(--stats-glow-1)'];
// grain is the chart bucket: hour, day, week, month or year.
function labelFor(key, grain, period) {
    if (grain === 'year') return key;
    if (grain === 'hour') return hourLabel(Number(key.slice(-2)));
    return keyDate(key).toLocaleDateString(
        undefined,
        grain === 'month'
            ? { month: 'short', year: period === 'lifetime' ? 'numeric' : undefined }
            : {
                  weekday: period === 'week' ? 'short' : undefined,
                  day: 'numeric',
                  month: period === 'week' ? undefined : 'short',
              }
    );
}
function fullLabel(key, grain) {
    if (grain === 'hour' || grain === 'year') return labelFor(key, grain);
    const date = keyDate(key);
    if (grain === 'month') return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (grain === 'week')
        return `Week of ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dayLabel(key) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dateKey()) return 'Today';
    if (key === dateKey(yesterday)) return 'Yesterday';
    const date = keyDate(key);
    return date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
}
// Lifetime arrives by year; a short history is regrouped from its days so the curve keeps a shape.
export function lifetimeSeries(data, today = new Date()) {
    const listened = data.days.filter((day) => day.seconds || day.streams);
    const end = new Date(today);
    end.setHours(12, 0, 0, 0);
    const first = listened.length ? keyDate(listened[0].key) : end;
    const span = (end - first) / 86400000;
    const grain = span < 60 ? 'day' : span < 180 ? 'week' : span < 1460 ? 'month' : 'year';
    if (grain === 'year') return { grain, items: data.activity };
    const bucketOf = (date) => {
        const start = new Date(date);
        if (grain === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        return dateKey(start).slice(0, grain === 'month' ? 7 : 10);
    };
    const buckets = new Map();
    // A week of context keeps a first listen from becoming a single point; calendar days stay DST-safe.
    const weekBefore = new Date(end);
    weekBefore.setDate(weekBefore.getDate() - 6);
    for (const cursor = new Date(Math.min(+first, +weekBefore)); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = bucketOf(cursor);
        if (!buckets.has(key)) buckets.set(key, { key, seconds: 0, streams: 0 });
    }
    for (const day of listened) {
        const bucket = buckets.get(bucketOf(keyDate(day.key)));
        if (!bucket) continue;
        bucket.seconds += day.seconds;
        bucket.streams += day.streams;
    }
    return { grain, items: [...buckets.values()] };
}
function periodLabel(data, anchor, period) {
    if (period === 'lifetime')
        return data?.earliest
            ? `Since ${new Date(data.earliest).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
            : 'All your listening';
    const format = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const start = data?.start ? new Date(data.start) : new Date(`${anchor}T12:00:00`);
    if (period === 'day') return format.format(start);
    if (period === 'year') return String(start.getFullYear());
    if (period === 'month') return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return data?.end ? format.formatRange(start, new Date(data.end - 1)) : 'This week';
}

const HISTORY_PAGE = 30;

class ListeningStats {
    constructor(ui) {
        this.ui = ui;
        this.root = document.getElementById('page-stats');
        this.period = 'week';
        this.anchor = dateKey();
        this.rank = 'tracks';
        this.rankExpanded = false;
        this.unit = 'minutes';
        this.generation = 0;
        this.data = null;
        this.loadedKey = '';
        this.historyItems = [];
        this.historyRevealed = new Set();
        this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
        let compactChart = this.root.clientWidth <= 560;
        this.resizeObserver = new ResizeObserver(() => {
            const compact = this.root.clientWidth <= 560;
            if (compact !== compactChart && this.active() && this.data?.summary) {
                const chart = this.root.querySelector('#stats-chart');
                if (chart) chart.innerHTML = this.chart();
            }
            compactChart = compact;
            syncStatsSegments(this.root);
        });
        this.resizeObserver.observe(this.root);
        this.root.addEventListener('click', (event) => void this.click(event));
        this.root.addEventListener('change', (event) => {
            if (event.target.id === 'stats-date') {
                this.anchor = event.target.value || dateKey();
                this.updateUrl();
                void this.load();
            }
        });
        const inspect = (event, passive) => {
            const point = event.target.closest('[data-chart-point]');
            if (point) this.showPoint(Number(point.dataset.chartPoint), passive);
            const hour = event.target.closest('[data-hour]');
            if (hour) this.showHour(Number(hour.dataset.hour));
            const slice = event.target.closest('.stats-rotation [data-slice]');
            if (slice) this.highlightSlice(slice.dataset.slice);
        };
        this.root.addEventListener('pointerover', (event) => inspect(event, true));
        this.root.addEventListener('focusin', (event) => inspect(event, false));
        this.root.addEventListener('focusout', (event) => {
            const plot = event.target.closest('.stats-chart-plot');
            if (plot && !plot.contains(event.relatedTarget) && !plot.matches(':hover')) this.showPoint(-1);
        });
        this.root.addEventListener('pointerout', (event) => {
            const left = (selector) => {
                const element = event.target.closest(selector);
                return element && !element.contains(event.relatedTarget);
            };
            // Touch taps keep their selection; a mouse leaving the chart hides the point.
            if (
                event.pointerType === 'mouse' &&
                left('.stats-chart-plot') &&
                !document.activeElement?.closest('.stats-chart-plot')
            )
                this.showPoint(-1);
            if (left('.stats-hour-bars')) this.showHour();
            if (left('.stats-rotation')) this.highlightSlice();
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
            this.root.querySelector('#stats-recaps').replaceChildren();
            if (this.active()) {
                void this.load();
                void this.showRecaps();
            }
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
    feedback(text) {
        const element = this.root.querySelector('#stats-feedback');
        element.textContent = text;
        clearTimeout(this.feedbackTimer);
        this.feedbackTimer = setTimeout(() => (element.textContent = ''), 6000);
    }
    async open() {
        const url = new URL(window.location.href);
        this.period = periods[url.searchParams.get('period')] ? url.searchParams.get('period') : 'week';
        this.anchor = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
            ? url.searchParams.get('date')
            : dateKey();
        void this.showRecaps();
        // Coming back replays the entrance from the last result, then refreshes quietly.
        if (this.data?.summary && this.loadedKey === `${this.period}:${this.anchor}`) {
            this.updateControls();
            this.render(false);
            await this.load(true);
        } else await this.load();
    }
    async request(extra = {}) {
        const { period = this.period, anchor = this.anchor } = extra;
        const date = new Date(`${anchor}T12:00:00`);
        return pb.send('/api/monochrome/listening/stats', {
            method: 'GET',
            query: {
                offset: -date.getTimezoneOffset(),
                offsets: listeningTimezoneOffsets(date.getFullYear(), period === 'lifetime'),
                ...extra,
                period,
                anchor,
            },
            requestKey: null,
        });
    }
    // Weekly and monthly recaps announce themselves above the period controls.
    async showRecaps() {
        try {
            const { showRecapNotices } = await import('./listening-recap.js');
            await showRecapNotices(this.root.querySelector('#stats-recaps'), {
                request: (period, anchor) => this.request({ period, anchor }),
                ui: this.ui,
            });
        } catch {
            /* Recaps are an extra; the stats stay usable without them. */
        }
    }
    async load(quiet = false) {
        if (quiet && this.root.hasAttribute('aria-busy')) return;
        const generation = ++this.generation;
        const uid = pb.authStore.record?.id;
        const content = this.root.querySelector('#stats-content');
        const retained = !quiet && Boolean(this.data?.summary);
        content.classList.toggle('stats-pending', retained);
        content.inert = retained;
        if (!quiet && !retained) {
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
            if (
                quiet &&
                this.data?.summary &&
                data.summary &&
                JSON.stringify({ ...this.data, generatedAt: 0 }) === JSON.stringify({ ...data, generatedAt: 0 })
            ) {
                this.data = data;
                this.root.querySelector('#stats-export').disabled = false;
                this.updateControls();
                return;
            }
            this.data = data;
            this.loadedKey = `${this.period}:${this.anchor}`;
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
                '#stats-content [data-chart-point], #stats-content [data-hour], #stats-content [data-play-track], #stats-content [data-stats-action]'
            );
            const focusAttr =
                focused &&
                ['data-chart-point', 'data-hour', 'data-play-track', 'data-stats-action'].find((attr) =>
                    focused.hasAttribute(attr)
                );
            const focusValue = focusAttr ? focused.getAttribute(focusAttr) : null;
            this.render(quiet);
            if (quiet && focusAttr)
                this.root.querySelector(`[${focusAttr}="${CSS.escape(focusValue)}"]`)?.focus({ preventScroll: true });
        } catch (error) {
            if (generation !== this.generation) return;
            this.data = null;
            content.innerHTML = `${this.message('Your stats could not be loaded', error.status === 0 ? 'The server is unreachable. Check your connection and retry; pending listens stay on this device.' : 'Please retry. If the problem continues, contact your instance administrator.', I_REFRESH)}<button type="button" class="btn-secondary stats-retry" data-stats-action="retry">Retry</button>`;
        } finally {
            if (generation === this.generation) {
                this.root.removeAttribute('aria-busy');
                content.classList.remove('stats-pending');
                content.inert = false;
            }
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
        const label = this.root.querySelector('#stats-period-label');
        const nextLabel = periodLabel(this.data, this.anchor, this.period);
        if (label.textContent !== nextLabel) {
            label.textContent = nextLabel;
            transitionStatsContent(label);
        }
        syncStatsSegments(this.root);
        const lifetime = this.period === 'lifetime';
        const input = this.root.querySelector('#stats-date');
        input.value = this.anchor;
        input.max = dateKey();
        input.disabled = lifetime;
        this.root.querySelector('[data-stats-action="pick-date"]').disabled = lifetime;
        this.root.querySelector('[data-stats-action="previous"]').disabled = lifetime;
        // Compare the period each date falls in, so a Monday afternoon still counts as this week.
        const periodOf = (key) => {
            const date = keyDate(key);
            if (this.period === 'week') date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
            return dateKey(date).slice(0, this.period === 'year' ? 4 : this.period === 'month' ? 7 : 10);
        };
        this.root.querySelector('.stats-share-cta-label').textContent =
            this.period === 'lifetime' ? 'Share all time' : `Share your ${this.period}`;
        const current = lifetime || periodOf(this.anchor) >= periodOf(dateKey());
        this.root.querySelector('[data-stats-action="next"]').disabled = current;
        this.root.querySelector('[data-stats-action="today"]').hidden = current;
    }
    render(quiet) {
        const d = this.data,
            s = d.summary;
        const content = this.root.querySelector('#stats-content');
        // Every arrival plays the entrance; only background refreshes update in place.
        content.classList.toggle('stats-update', quiet);
        this.series =
            this.period === 'lifetime'
                ? lifetimeSeries(d)
                : { grain: { day: 'hour', week: 'day', month: 'day', year: 'month' }[this.period], items: d.activity };
        this.dayTotals = new Map(d.days.map((day) => [day.key, day]));
        if (quiet) {
            // Keep the pages already scrolled through; newer and updated sessions replace their copies.
            const fresh = new Set(d.history.map((session) => session.sessionId));
            this.historyItems = [
                ...d.history,
                ...this.historyItems.filter((session) => !fresh.has(session.sessionId)),
            ].sort((a, b) => b.startedAt - a.startedAt);
        } else {
            this.historyItems = [...d.history];
            this.historyRevealed.clear();
            this.rankExpanded = false;
        }
        this.historyDone = this.historyItems.length >= d.historyTotal;
        this.historyError = false;
        const change = s.previousSeconds > 0 ? Math.round((s.seconds / s.previousSeconds - 1) * 100) : null;
        const comparison =
            this.period === 'lifetime'
                ? 'Across your listening history'
                : change === null
                  ? 'Time actually spent listening'
                  : change === 0
                    ? `Same as the previous ${this.period}`
                    : `${change > 0 ? '+' : ''}${change}% vs. previous ${this.period}`;
        const favorites = d.top.tracks
            .filter((track) => imageUrl(track.cover) && !/\/assets\/appicon\.png(?:[?#]|$)/.test(track.cover))
            .slice(0, 3);
        const most = d.top.tracks[0];
        // The orbit is drawn twice: its far half behind the covers, its near half in front of them.
        // Its viewBox matches the orbit box's aspect, so the ring reaches past the outer covers.
        const orbit = (front) =>
            `<svg class="stats-orbit${front ? ' is-front' : ''}" viewBox="0 0 740 320" aria-hidden="true"><clipPath id="stats-orbit-${front ? 'near' : 'far'}"><rect x="-20" y="${front ? 160 : -60}" width="780" height="${front ? 220 : 221}"/></clipPath><linearGradient id="stats-spark-fade-${front ? 'near' : 'far'}" gradientUnits="userSpaceOnUse" gradientTransform="rotate(-8 370 160)" x1="0" y1="130" x2="0" y2="160"><stop offset="0" stop-color="${front ? 'black' : 'white'}"/><stop offset="1" stop-color="${front ? 'white' : 'black'}"/></linearGradient><mask id="stats-spark-${front ? 'near' : 'far'}" maskUnits="userSpaceOnUse" x="-200" y="-200" width="1140" height="720"><rect x="-200" y="-200" width="1140" height="720" fill="url(#stats-spark-fade-${front ? 'near' : 'far'})"/></mask><g transform="rotate(-8 370 160)" clip-path="url(#stats-orbit-${front ? 'near' : 'far'})"><ellipse class="stats-orbit-ring" cx="370" cy="160" rx="352" ry="84" pathLength="1"/></g><g mask="url(#stats-spark-${front ? 'near' : 'far'})"><g transform="rotate(-8 370 160)"><ellipse class="stats-orbit-spark" cx="370" cy="160" rx="352" ry="84" pathLength="1"/></g></g></svg>`;
        const by = {
            hour: 'hour by hour',
            day: 'day by day',
            week: 'week by week',
            month: 'month by month',
            year: 'year by year',
        }[this.series.grain];
        content.innerHTML = `
            <section class="stats-scene" aria-label="Your listening in this period">
                <div class="stats-stage">
                    <div class="stats-headline"><div class="stats-total" data-count="${Math.round(s.seconds / 60)}">${minutes(s.seconds)}</div><h2>minutes listened</h2><p class="stats-comparison${change < 0 ? ' is-down' : ''}">${comparison}</p>
                    <dl class="stats-stage-metrics"><div><dd>${count(s.streams)}</dd><dt>streams</dt></div><div><dd>${count(s.artists)}</dd><dt>artists</dt></div><div><dd>${count(s.activeDays)}</dd><dt>active ${s.activeDays === 1 ? 'day' : 'days'}</dt></div></dl>
                    <p class="stats-stage-detail">${count(s.tracks)} ${s.tracks === 1 ? 'track' : 'tracks'} · ${count(s.albums)} ${s.albums === 1 ? 'album' : 'albums'} · longest streak ${count(s.longestStreak)} ${s.longestStreak === 1 ? 'day' : 'days'}</p></div>
                    <div class="stats-showcase">
                        <div class="stats-cover-fan" data-cover-count="${favorites.length}">${favorites.length ? orbit(false) : ''}
                        ${favorites.map((track, i) => `<button type="button" class="stats-cover-card stats-cover-${i}" data-play-track="${escape(track.id)}" aria-label="Play ${escape(track.title)}" style="--stats-order:${i};--stats-glow:var(--stats-glow-${i})">${cover(track, true)}<span class="stats-cover-play">${I_PLAY(26)}</span></button>`).join('')}
                        ${favorites.length ? orbit(true) : `<div class="stats-no-cover">${I_MUSIC(48)}<span>${most ? 'Artwork appears here for your most played music.' : 'Your next favorite starts with a listen.'}</span></div>`}</div>
                        ${most ? `<div class="stats-showcase-caption"><p><span class="stats-most-label">Your most played</span><strong>${escape(most.title)}</strong><small>${escape(artistNames(most))} · ${count(most.streams)} ${most.streams === 1 ? 'stream' : 'streams'}</small></p><button type="button" class="stats-hero-play" data-play-track="${escape(most.id)}" aria-label="Play ${escape(most.title)}">${I_PLAY(22)}</button></div>` : ''}
                    </div>
                </div>
                <section class="stats-trend" aria-labelledby="stats-trend-title"><h2 id="stats-trend-title" class="sr-only">Listening activity, ${by}</h2><div class="stats-segments stats-units" role="group" aria-label="Chart measure"><button type="button" data-unit="minutes" aria-pressed="${this.unit === 'minutes'}">Minutes</button><button type="button" data-unit="streams" aria-pressed="${this.unit === 'streams'}">Streams</button></div><div id="stats-chart">${this.chart()}</div></section>
            </section>
            ${s.streams === 0 && s.seconds === 0 ? `<div class="stats-first-listen"><strong>${this.period === 'lifetime' ? 'Your listening story starts here' : 'A quiet period'}</strong><span>Listen to a track for 30 seconds to make it count. Stats collect new listens across your signed-in devices.</span><a href="/library">Explore your library ${I_CHEVRON_RIGHT(15)}</a></div>` : ''}
            <div class="stats-analysis">
            <section class="stats-ranking stats-panel" aria-labelledby="stats-ranking-title"><div class="stats-section-header"><h2 id="stats-ranking-title">On repeat</h2><div class="stats-segments" role="group" aria-label="Ranking type">${['tracks', 'artists', 'albums'].map((type) => `<button type="button" data-rank="${type}" aria-pressed="${type === this.rank}">${type[0].toUpperCase() + type.slice(1)}</button>`).join('')}</div></div><div id="stats-rank-list">${this.ranking()}</div></section>
            <div class="stats-side-rail"><section class="stats-artists stats-panel" aria-labelledby="stats-artists-title"><div class="stats-section-header"><h2 id="stats-artists-title">Your rotation</h2></div>${this.distribution()}</section>
            <section class="stats-habits stats-panel" aria-labelledby="stats-habits-title"><div class="stats-section-header"><h2 id="stats-habits-title">Listening by hour</h2><span class="stats-habit-note" aria-live="polite"></span></div>${this.hours()}</section>
            </div></div>
            <section class="stats-history" aria-labelledby="stats-history-title"><div class="stats-section-header"><div><h2 id="stats-history-title">Listening history</h2><p>Every stream, including repeats</p></div><span>${count(d.historyTotal)} ${d.historyTotal === 1 ? 'stream' : 'streams'}</span></div>${d.historyTotal ? '<div id="stats-history-list"></div><div class="stats-history-footer"></div>' : '<p class="stats-table-empty">Qualified listens will appear here, grouped by day.</p>'}</section>
            <p class="stats-footnote">A playback session counts once after 30 seconds of heard audio. Pauses and seeks do not add listening time. Only new listens are included; earlier device history cannot be reconstructed reliably. Hours use ${escape(Intl.DateTimeFormat().resolvedOptions().timeZone)} time. Updated ${new Date(d.generatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}.</p>`;
        this.root.querySelector('.stats-share-cta-covers').innerHTML = favorites
            .map((track, i) => `<img src="${escape(imageUrl(track.cover))}" alt="" style="--i:${i}" />`)
            .join('');
        this.showHour();
        this.setupHistory();
        animateStatsScene(this.root);
        syncStatsSegments(this.root);
    }
    chart() {
        const items = this.series.items;
        const values = items.map((p) => (this.unit === 'minutes' ? p.seconds / 60 : p.streams));
        const max = Math.max(1, ...values);
        const step = Math.max(2, 10 ** Math.floor(Math.log10(max)) / 5);
        // The light comes out from behind the covers on the far half, crosses the near half and slips behind them again.
        // The far clip overlaps the near one by a unit so no hairline shows where they meet;
        // the light is masked with a soft cross-fade instead, so its glow is not cut along that line.
        const ceiling = Math.ceil((max * 1.05) / step) * step;
        const compact = this.root.clientWidth <= 560;
        // The SVG stretches to its box, so text, dots and the tooltip live in HTML and strokes don't scale.
        const width = compact ? 400 : 1000;
        const height = 120;
        const x = (i) => 10 + (i / Math.max(1, items.length - 1)) * (width - 20);
        const y = (value) => height - 1 - (value / ceiling) * (height - 9);
        const points = values.map((v, i) => [x(i), y(v)]);
        const curve = points
            .map(([px, py], i) => {
                if (!i) return `M ${px},${py}`;
                const [ox, oy] = points[i - 1];
                return `C ${(ox + px) / 2},${oy} ${(ox + px) / 2},${py} ${px},${py}`;
            })
            .join(' ');
        const active = values.some((v) => v > 0);
        this.peak = active ? values.indexOf(Math.max(...values)) : -1;
        const tickStep = Math.ceil(items.length / (compact ? 4 : 7));
        const column = (width - 20) / Math.max(1, items.length - 1);
        const { grain } = this.series;
        return `<figure class="stats-chart-figure"><div class="stats-chart-plot">
            <svg class="stats-chart-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="group" aria-labelledby="stats-trend-title">
            <defs><linearGradient id="stats-hue" gradientUnits="userSpaceOnUse" x1="0" x2="${width}" y1="0" y2="0">${chartHue.map((color, i) => `<stop offset="${i / (chartHue.length - 1)}" style="stop-color:${color}"/>`).join('')}</linearGradient>
            <linearGradient id="stats-fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".4"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <linearGradient id="stats-sweep-light"><stop stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
            <pattern id="stats-stems" width="${compact ? 4 : 5}" height="${height}" patternUnits="userSpaceOnUse"><rect width="1" height="${height}" fill="#fff" fill-opacity=".5"/></pattern>
            <mask id="stats-area-mask"><rect width="${width}" height="${height}" fill="url(#stats-fade)"/></mask>
            <mask id="stats-stem-mask"><rect width="${width}" height="${height}" fill="url(#stats-stems)"/></mask>
            <mask id="stats-sweep-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${width}" height="${height}"><rect class="stats-chart-sweep" x="${-width / 6}" width="${width / 6}" height="${height}" fill="url(#stats-sweep-light)"/></mask>
            <clipPath id="stats-under-curve"><path d="${curve} L ${x(items.length - 1)},${height} L ${x(0)},${height} Z"/></clipPath></defs>
            ${[ceiling, ceiling / 2].map((v) => `<line class="stats-gridline" x1="0" x2="${width}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}<line class="stats-baseline" x1="0" x2="${width}" y1="${height - 0.5}" y2="${height - 0.5}"/>
            ${active ? `<g clip-path="url(#stats-under-curve)"><rect width="${width}" height="${height}" fill="url(#stats-hue)" mask="url(#stats-area-mask)"/><rect class="stats-chart-stems" width="${width}" height="${height}" fill="url(#stats-hue)" mask="url(#stats-stem-mask)"/></g><path class="stats-chart-glow" d="${curve}"/><path class="stats-chart-line" d="${curve}"/><path class="stats-chart-shine" d="${curve}" mask="url(#stats-sweep-mask)"/>` : ''}
            ${items.map((p, i) => `<rect class="stats-chart-hit" x="${x(i) - column / 2}" y="0" width="${column}" height="${height}" tabindex="${i === Math.max(0, this.peak) ? 0 : -1}" role="button" aria-pressed="false" data-chart-point="${i}" data-x="${((x(i) / width) * 100).toFixed(2)}" data-y="${((y(values[i]) / height) * 100).toFixed(2)}" aria-label="${escape(fullLabel(p.key, grain))}: ${minutes(p.seconds)} minutes, ${count(p.streams)} streams"/>`).join('')}
            </svg>${active ? '' : '<p class="stats-no-activity">No listening activity in this period</p>'}<div class="stats-chart-marker" aria-hidden="true"><i></i></div><div class="stats-chart-tooltip" aria-hidden="true"></div></div>
            <div class="stats-chart-y" aria-hidden="true">${[ceiling, ceiling / 2, 0].map((v) => `<span style="top:${((y(v) / height) * 100).toFixed(2)}%">${count(v)}</span>`).join('')}</div>
            <div class="stats-chart-x" aria-hidden="true">${items
                .map((p, i) =>
                    i % tickStep
                        ? ''
                        : `<span class="${i === 0 ? 'is-start' : i === items.length - 1 ? 'is-end' : ''}" style="left:${((x(i) / width) * 100).toFixed(2)}%">${escape(labelFor(p.key, grain, this.period))}</span>`
                )
                .join('')}</div>
            <figcaption id="stats-chart-detail" class="sr-only" aria-live="polite">${minutes(this.data.summary.seconds)} minutes · ${count(this.data.summary.streams)} streams in this period</figcaption></figure>`;
    }
    showPoint(index, passive = false) {
        const plot = this.root.querySelector('.stats-chart-plot');
        const item = this.series?.items[index];
        const point = plot?.querySelector(`[data-chart-point="${index}"]`);
        if (!plot) return;
        if (!item || !point || this.peak < 0) {
            plot.classList.remove('has-point');
            return;
        }
        // Take the color of the gradient under the point.
        const t = (Number(point.dataset.x) / 100) * (chartHue.length - 1),
            from = Math.min(chartHue.length - 2, Math.floor(t));
        plot.style.setProperty('--stats-x', `${point.dataset.x}%`);
        plot.style.setProperty('--stats-y', `${point.dataset.y}%`);
        plot.style.setProperty(
            '--stats-point',
            `color-mix(in srgb, ${chartHue[from]} ${Math.round((1 - (t - from)) * 100)}%, ${chartHue[from + 1]})`
        );
        plot.classList.toggle('is-near-top', Number(point.dataset.y) < 45);
        // Appear in place; the marker glides only between points.
        if (!plot.classList.contains('has-point')) {
            void plot.offsetWidth;
            plot.classList.add('has-point');
        }
        for (const other of plot.querySelectorAll('[data-chart-point]')) {
            other.setAttribute('aria-pressed', String(other === point));
            other.tabIndex = other === point ? 0 : -1;
        }
        const time = `${minutes(item.seconds)} ${Math.round(item.seconds / 60) === 1 ? 'minute' : 'minutes'}`,
            plays = `${count(item.streams)} ${item.streams === 1 ? 'stream' : 'streams'}`;
        const [main, sub] = this.unit === 'streams' ? [plays, time] : [time, plays];
        const label = fullLabel(item.key, this.series.grain);
        plot.querySelector('.stats-chart-tooltip').innerHTML =
            `<span>${escape(label)}</span><strong>${main}</strong><small>${sub}</small>`;
        if (!passive) this.root.querySelector('#stats-chart-detail').textContent = `${label}: ${main}, ${sub}`;
    }
    showHour(hour) {
        const note = this.root.querySelector('.stats-habit-note');
        if (!note || !this.data?.hours) return;
        const peak = this.data.hours.indexOf(Math.max(...this.data.hours));
        for (const bar of this.root.querySelectorAll('[data-hour]'))
            bar.classList.toggle('is-selected', Number(bar.dataset.hour) === hour);
        note.textContent =
            hour !== undefined
                ? `${hourLabel(hour)} · ${minutes(this.data.hours[hour])} min`
                : this.data.summary.seconds > 0
                  ? `Peak hour · ${hourLabel(peak)}`
                  : 'Your rhythm will appear here';
    }
    highlightSlice(slice) {
        const rotation = this.root.querySelector('.stats-rotation');
        if (!rotation) return;
        rotation.classList.toggle('has-active', slice !== undefined);
        for (const element of rotation.querySelectorAll('[data-slice]'))
            element.classList.toggle('is-active', element.dataset.slice === slice);
    }
    distribution() {
        const total = this.data.artistSeconds;
        const pictures = new Map(this.data.top.artists.map((artist) => [artist.id, artist.cover]));
        const entries = this.data.distribution.map((artist, i) => ({
            ...artist,
            cover: pictures.get(artist.id),
            tone: tones[i % tones.length],
        }));
        const shown = entries.reduce((sum, artist) => sum + artist.seconds, 0);
        if (total > shown) entries.push({ name: 'Other artists', seconds: total - shown, tone: otherTone });
        const live = entries.filter((entry) => entry.seconds > 0).length;
        const share = (entry) => (total > 0 ? Math.max(0, entry.seconds / total) : 0);
        // Round caps reach past each arc end, so the gap leaves room for both caps plus air.
        const cap = (6.5 / 64) * (180 / Math.PI);
        const gap = live > 1 ? cap * 2 + 3.5 : 0;
        const polar = (angle) => [
            80 + 64 * Math.cos((angle * Math.PI) / 180),
            80 + 64 * Math.sin((angle * Math.PI) / 180),
        ];
        let offset = -90;
        let conic = 0;
        const stops = [];
        const arcs = entries
            .map((entry, i) => {
                const sweep = share(entry) * 360;
                const start = offset;
                offset += sweep;
                if (!sweep) return '';
                stops.push(`${entry.tone} ${conic}deg ${(conic += sweep)}deg`);
                const from = sweep > gap ? start + gap / 2 : start + sweep / 2;
                const to = sweep > gap ? start + sweep - gap / 2 : from + 0.01;
                const [sx, sy] = polar(from),
                    [ex, ey] = polar(to);
                const d =
                    live === 1
                        ? 'M 80 16 A 64 64 0 1 1 79.99 16'
                        : `M ${sx.toFixed(2)} ${sy.toFixed(2)} A 64 64 0 ${to - from > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
                return `<path class="stats-donut-segment" data-slice="${i}" d="${d}" pathLength="1" style="--stats-order:${i};stroke:${entry.tone}"><title>${escape(entry.name)}: ${Math.round(share(entry) * 100)}%</title></path>`;
            })
            .join('');
        return `<div class="stats-rotation"><div class="stats-donut-wrap" style="--stats-conic:conic-gradient(${stops.join(',') || 'transparent 0deg 360deg'})"><svg class="stats-donut" viewBox="0 0 160 160" role="img" aria-label="Artist listening time distribution"><circle class="stats-donut-track" cx="80" cy="80" r="64"/>${arcs}</svg><p class="stats-donut-total"><strong>${count(this.data.summary.artists)}</strong><span>artists</span></p></div><ul class="stats-legend">${entries.length ? entries.map((a, i) => `<li data-slice="${i}" style="--stats-tone:${a.tone}"><span class="stats-swatch"></span><span class="stats-legend-avatar">${imageUrl(a.cover) ? `<img src="${escape(imageUrl(a.cover))}" alt="" loading="lazy" onerror="this.hidden=true" />` : ''}</span>${a.id ? `<a href="/artist/${encodeURIComponent(a.id)}">${escape(a.name)}</a>` : `<span>${escape(a.name)}</span>`}<strong>${Math.round(share(a) * 100)}%</strong></li>`).join('') : '<li class="stats-muted">Your artists will appear after your first stream.</li>'}</ul></div>`;
    }
    hours() {
        const max = Math.max(1, ...this.data.hours);
        const peak = this.data.hours.indexOf(Math.max(...this.data.hours));
        const bars = this.data.hours
            .map((seconds, hour) => {
                // Blend the three cover colors around the clock.
                const position = (hour / 24) * 3,
                    from = Math.floor(position),
                    mix = Math.round((position - from) * 100);
                const tone = `color-mix(in oklch, var(--stats-glow-${from}) ${100 - mix}%, var(--stats-glow-${(from + 1) % 3}))`;
                return `<button type="button" class="stats-hour${seconds && hour === peak ? ' is-peak' : ''}" style="--stats-bar-ratio:${(seconds / max).toFixed(4)};--stats-tone:${tone};--stats-order:${hour}" aria-label="${escape(hourLabel(hour))}: ${minutes(seconds)} minutes" data-hour="${hour}"><i><span></span></i><small>${hour % 3 === 0 ? escape(hourLabel(hour)) : ''}</small></button>`;
            })
            .join('');
        return `<div class="stats-hour-chart"><div class="stats-hour-axis" aria-hidden="true"><span>${minutes(max)}</span><span>${minutes(max / 2)}</span><span>0</span></div><div class="stats-hour-bars">${bars}</div></div>`;
    }
    ranking() {
        const all = this.data.top[this.rank];
        if (!all.length) return '<p class="stats-table-empty">No music to rank in this period yet.</p>';
        const items = this.rankExpanded ? all : all.slice(0, 10);
        const artist = this.rank === 'artists';
        const more =
            all.length > 10
                ? `<button type="button" class="stats-more" data-stats-action="rank-more" aria-expanded="${this.rankExpanded}">${this.rankExpanded ? 'Show top 10' : `Show all ${count(all.length)}`}</button>`
                : '';
        return `<table class="stats-table"><caption class="sr-only">Top ${this.rank} by streams</caption><thead><tr><th scope="col" class="stats-position">#</th><th scope="col">${artist ? 'Artist' : this.rank === 'tracks' ? 'Track' : 'Album'}</th><th scope="col" class="stats-number">Streams</th><th scope="col" class="stats-number stats-time-column">Minutes</th><th scope="col" class="stats-row-action"><span class="sr-only">Open or play</span></th></tr></thead><tbody>${items.map((item, i) => `<tr style="--stats-order:${Math.min(i, 12)}"><td class="stats-position">${i + 1}</td><td><div class="stats-identity"><span class="stats-artwork ${artist ? 'is-artist' : ''}">${cover(item)}</span><span><a href="/${artist ? 'artist' : this.rank === 'albums' ? 'album' : 'track'}/${encodeURIComponent(item.id)}">${escape(item.title || item.name)}</a>${!artist ? `<small>${escape(artistNames(item))}</small>` : ''}</span></div></td><td class="stats-number">${count(item.streams)}</td><td class="stats-number stats-time-column">${minutes(item.seconds)}</td><td class="stats-row-action">${this.rank === 'tracks' ? `<button type="button" class="stats-icon-button" data-play-track="${escape(item.id)}" aria-label="Play ${escape(item.title)}">${I_PLAY(16)}</button>` : `<a class="stats-icon-button" href="/${artist ? 'artist' : 'album'}/${encodeURIComponent(item.id)}" aria-label="Open ${escape(item.name || item.title)}">${I_CHEVRON_RIGHT(16)}</a>`}</td></tr>`).join('')}</tbody></table>${more}`;
    }
    historyRow(session) {
        const pending = !this.reducedMotion.matches && !this.historyRevealed.has(session.sessionId);
        const at = new Date(session.startedAt);
        return `<li${pending ? ' class="is-pending"' : ''} data-session="${escape(session.sessionId)}"><span class="stats-artwork">${cover(session.track)}</span><span class="stats-history-track"><a href="/track/${encodeURIComponent(session.track.id)}">${escape(session.track.title)}</a><small>${escape(artistNames(session.track))}</small></span><time datetime="${at.toISOString()}">${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time><span class="stats-history-duration">${Math.floor(session.seconds / 60)}:${String(Math.floor(session.seconds % 60)).padStart(2, '0')}${session.ended ? '' : '<small>in progress</small>'}</span><button class="stats-icon-button" type="button" data-play-track="${escape(session.track.id)}" aria-label="Play ${escape(session.track.title)}">${I_PLAY(16)}</button></li>`;
    }
    // Appends sessions into day groups, continuing the last day when a page splits it.
    appendHistory(sessions) {
        const list = this.root.querySelector('#stats-history-list');
        if (!list) return;
        const groups = [];
        for (const session of sessions) {
            const key = dateKey(new Date(session.startedAt));
            if (groups.at(-1)?.key !== key) groups.push({ key, rows: '' });
            groups.at(-1).rows += this.historyRow(session);
        }
        for (const { key, rows } of groups) {
            const last = list.lastElementChild;
            if (last?.dataset.day === key) {
                last.querySelector('ul').insertAdjacentHTML('beforeend', rows);
                continue;
            }
            const day = this.dayTotals.get(key);
            const meta = day
                ? `${count(day.streams)} ${day.streams === 1 ? 'stream' : 'streams'} · ${minutes(day.seconds)} min`
                : '';
            list.insertAdjacentHTML(
                'beforeend',
                `<section class="stats-history-day" data-day="${key}" aria-label="${escape(dayLabel(key))}"><h3><span>${escape(dayLabel(key))}</span><small>${meta}</small></h3><ul class="stats-history-items">${rows}</ul></section>`
            );
        }
        for (const row of list.querySelectorAll('li.is-pending')) this.historyRevealObserver?.observe(row);
    }
    // Rows reveal like the queue panel's history; the footer loads the next page before it is reached.
    setupHistory() {
        this.historyToken = (this.historyToken || 0) + 1;
        this.historyRevealObserver?.disconnect();
        this.historyPageObserver?.disconnect();
        const footer = this.root.querySelector('.stats-history-footer');
        if (!footer) return;
        this.historyRevealObserver = new IntersectionObserver(
            (entries) => {
                let order = 0;
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    const row = entry.target;
                    row.style.setProperty('--queue-delay', `${Math.min(order++, 4) * 34}ms`);
                    row.classList.replace('is-pending', 'is-revealed');
                    this.historyRevealed.add(row.dataset.session);
                    this.historyRevealObserver.unobserve(row);
                }
            },
            { rootMargin: '0px 0px 56px', threshold: 0.08 }
        );
        this.historyPageObserver = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) void this.loadMoreHistory();
            },
            { rootMargin: '0px 0px 640px' }
        );
        this.appendHistory(this.historyItems);
        this.historyFooter();
        this.historyPageObserver.observe(footer);
    }
    historyFooter() {
        const footer = this.root.querySelector('.stats-history-footer');
        if (!footer) return;
        footer.innerHTML = this.historyError
            ? `<span>More history could not be loaded.</span><button type="button" class="stats-more" data-stats-action="history-retry">Retry</button>`
            : this.historyDone
              ? `<span>${this.period === 'lifetime' ? 'This is where your listening story begins.' : 'You reached the start of this period.'}</span>`
              : '<span class="stats-history-loading"><i></i>Loading earlier listens…</span>';
    }
    async loadMoreHistory() {
        if (this.historyLoading || this.historyDone || this.historyError || !this.data?.summary) return;
        this.historyLoading = true;
        // Only a re-render invalidates a page in flight; background polls leave it alone.
        const token = this.historyToken;
        const known = new Set(this.historyItems.map((session) => session.sessionId));
        try {
            const next = await this.request({
                view: 'history',
                page: Math.floor(this.historyItems.length / HISTORY_PAGE) + 1,
            });
            if (token !== this.historyToken) return;
            const added = (next.history || []).filter((session) => !known.has(session.sessionId));
            this.historyItems.push(...added);
            this.historyDone = !next.history?.length || this.historyItems.length >= this.data.historyTotal;
            this.appendHistory(added);
        } catch {
            if (token === this.historyToken) this.historyError = true;
        } finally {
            this.historyLoading = false;
            this.historyFooter();
            // Re-observing reports the footer again, so a short page, or a render meanwhile, keeps loading.
            const footer = this.root.querySelector('.stats-history-footer');
            if (footer && !this.historyDone) {
                this.historyPageObserver?.unobserve(footer);
                this.historyPageObserver?.observe(footer);
            }
        }
    }
    async click(event) {
        const button = event.target.closest('button, [data-chart-point]');
        if (!button || button.disabled) return;
        const action = button.dataset.statsAction;
        if (action === 'pick-date') {
            // showPicker needs this click's activation, so it runs before anything awaits.
            const input = this.root.querySelector('#stats-date');
            try {
                input.showPicker();
            } catch {
                input.focus();
            }
            return;
        }
        if (button.dataset.period) {
            this.period = button.dataset.period;
            this.updateUrl();
            await this.load();
        }
        if (button.dataset.unit && this.data?.summary) {
            this.unit = button.dataset.unit;
            this.root.querySelector('#stats-chart').innerHTML = this.chart();
            transitionStatsContent(this.root.querySelector('#stats-chart'));
            for (const b of this.root.querySelectorAll('[data-unit]'))
                b.setAttribute('aria-pressed', String(b.dataset.unit === this.unit));
        }
        if ((button.dataset.rank || action === 'rank-more') && this.data?.summary) {
            if (button.dataset.rank) this.rank = button.dataset.rank;
            else this.rankExpanded = !this.rankExpanded;
            this.root.querySelector('#stats-rank-list').innerHTML = this.ranking();
            transitionStatsContent(this.root.querySelector('#stats-rank-list'));
            for (const b of this.root.querySelectorAll('[data-rank]'))
                b.setAttribute('aria-pressed', String(b.dataset.rank === this.rank));
            if (action === 'rank-more' && !this.rankExpanded)
                this.root.querySelector('.stats-ranking').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        syncStatsSegments(this.root);
        if (button.dataset.chartPoint !== undefined) this.showPoint(Number(button.dataset.chartPoint));
        if (button.dataset.hour !== undefined) this.showHour(Number(button.dataset.hour));
        if (button.dataset.playTrack) {
            button.disabled = true;
            try {
                const track = await this.ui.api.getTrackMetadata(button.dataset.playTrack);
                await this.ui.player.setQueue([track]);
                await this.ui.player.playAtIndex(0);
            } catch {
                this.feedback('This track is no longer available in your library.');
            } finally {
                button.disabled = false;
            }
        }
        if (action === 'retry' || action === 'refresh') await this.load();
        if (action === 'history-retry') {
            this.historyError = false;
            this.historyFooter();
            await this.loadMoreHistory();
        }
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
            this.updateUrl();
            await this.load();
        }
        if (action === 'export' && this.data?.summary) {
            try {
                const { openStatsShare } = await import('./listening-stats-share.js');
                const style = getComputedStyle(this.root);
                openStatsShare({
                    data: this.data,
                    period: this.period,
                    anchor: this.anchor,
                    label: periodLabel(this.data, this.anchor, this.period),
                    colors: [0, 1, 2].map((i) => style.getPropertyValue(`--stats-color-${i}`).trim()),
                    user: pb.authStore.record,
                    exportData: () => this.request({ export: 'true' }),
                    returnFocus: button,
                });
            } catch {
                this.feedback('Sharing could not open. Check your connection and retry.');
            }
        }
    }
}
let instance;
export async function renderListeningStats(ui) {
    instance ||= new ListeningStats(ui);
    await instance.open();
}
