import I_X from '!lucide/x.svg?svg&icon';
import I_PLAY from '!lucide/play.svg?svg&icon';
import I_PAUSE from '!lucide/pause.svg?svg&icon';
import I_VOLUME from '!lucide/volume-2.svg?svg&icon';
import I_MUTE from '!lucide/volume-x.svg?svg&icon';
import I_SHARE from '!lucide/share.svg?svg&icon';
import I_REPLAY from '!lucide/rotate-ccw.svg?svg&icon';
import I_MUSIC from '!lucide/audio-lines.svg?svg&icon';
import { pb } from './accounts/config.js';
import { getVibrantColorFromImage } from './vibrant-color.js';
import {
    EDITIONS,
    POOLS,
    collectEdition,
    editionFor,
    loadCollection,
    loadEditionFont,
} from './listening-recap-editions.js';

// Weekly and monthly recaps: a Wrapped-style story pressed in a collectible edition, ending on a share card.

const escape = (value) =>
    String(value ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
const count = (n) => new Intl.NumberFormat().format(n || 0);
const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyDate = (key) => new Date(`${key}T12:00:00`);
const imageUrl = (url) =>
    url && /^(https?:\/\/|\/api\/files\/|\/assets\/)/i.test(url) && !/\/assets\/appicon\.png/.test(url) ? url : '';
const names = (item) => (item?.artists || []).map((a) => a.name).join(', ');
const plural = (n, word) => `${count(n)} ${n === 1 ? word : `${word}s`}`;
const duration = (seconds) => {
    const total = Math.round(seconds / 60);
    return total < 60 ? `${total} min` : `${Math.floor(total / 60)} h ${total % 60} min`;
};
const hourLabel = (hour) => new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(new Date(2000, 0, 1, hour));
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const SOUND = 'monochrome-recap-sound';

// The recaps that are ready now: last week from Monday, last month from the 1st.
export function readyRecaps(now = new Date()) {
    const monday = new Date(now);
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7);
    const month = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12);
    return [
        { period: 'month', anchor: dateKey(month) },
        { period: 'week', anchor: dateKey(monday) },
    ].map((recap) => ({ ...recap, key: `${recap.period}:${recap.anchor}` }));
}

function recapLabel({ period, anchor }) {
    const start = keyDate(anchor);
    if (period === 'month')
        return {
            short: start.toLocaleDateString(undefined, {
                month: 'long',
                year: start.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
            }),
            long: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        };
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const range = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).formatRange(start, end);
    return { short: range, long: range };
}

// Seeded per listener and recap, so a recap replays the same way on every device.
function seeded(text) {
    let hash = 2166136261;
    for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return () => {
        hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
        hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
        return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
    };
}

export function recapModel(recap, data, uid) {
    const s = data.summary;
    const edition = recap.edition || editionFor(uid, recap.period, recap.anchor);
    const label = recapLabel(recap);
    const tracks = data.top.tracks.slice(0, 5).map((t) => ({
        id: t.id,
        title: t.title,
        artist: names(t),
        cover: imageUrl(t.cover),
        streams: t.streams,
        seconds: t.seconds,
    }));
    const artists = data.top.artists.slice(0, 5).map((a) => {
        const best = data.top.tracks.find((t) => t.artists?.some((artist) => artist.id === a.id));
        return {
            id: a.id,
            name: a.name,
            cover: imageUrl(a.cover) || imageUrl(best?.cover),
            track: best?.id,
            streams: a.streams,
            seconds: a.seconds,
            share: data.artistSeconds ? a.seconds / data.artistSeconds : 0,
        };
    });
    const album = data.top.albums[0];
    const byDay = new Map(data.days.map((day) => [day.key, day]));
    const start = keyDate(recap.anchor);
    const length = recap.period === 'week' ? 7 : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const days = Array.from({ length }, (_, i) => {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        return { date, seconds: byDay.get(dateKey(date))?.seconds || 0 };
    });
    const peakHour = data.hours.indexOf(Math.max(...data.hours));
    const change = s.previousSeconds > 0 ? Math.round((s.seconds / s.previousSeconds - 1) * 100) : null;
    return {
        ...recap,
        edition,
        label,
        data,
        summary: s,
        change,
        tracks,
        artists,
        album: album && {
            title: album.title,
            artist: names(album),
            cover: imageUrl(album.cover),
            seconds: album.seconds,
            track: data.top.tracks.find((t) => t.album?.id === album.id)?.id,
        },
        days,
        hours: data.hours,
        peakHour,
        seed: `${uid}|${recap.key}`,
    };
}

// ---------- Slides ----------

const art = (url, extra = '') =>
    `<span class="stats-recap-art${extra}">${url ? `<img src="${escape(url)}" alt="" decoding="async" />` : `<span class="stats-recap-art-empty">${I_MUSIC(32)}</span>`}</span>`;
const at = (ms) => `style="--d:${ms}ms"`;
const counter = (value, delay, label) =>
    `<span data-recap-count="${value}" data-recap-delay="${delay}" aria-hidden="true">${count(value)}</span><span class="sr-only">${escape(label ?? count(value))}</span>`;
function listenerType(hour) {
    if (hour >= 5 && hour < 11) return 'Morning person';
    if (hour >= 11 && hour < 17) return 'Daytime listener';
    if (hour >= 17 && hour < 22) return 'Evening listener';
    return 'Night owl';
}

const SLIDES = {
    intro: (m) => ({
        duration: 5600,
        track: m.tracks[0]?.id,
        html: `<div class="stats-recap-prop" aria-hidden="true"><i></i><i></i><i></i>${art(m.tracks[0]?.cover)}</div>
            <p class="stats-recap-kicker stats-recap-in" ${at(350)}>Your ${m.period} in music</p>
            <h2 class="stats-recap-title stats-recap-big" ${at(600)}>${escape(m.label.short)}</h2>
            <p class="stats-recap-chip stats-recap-in" ${at(1300)}>${escape(EDITIONS[m.edition].name)} edition</p>`,
    }),
    minutes: (m) => ({
        duration: 6800,
        track: m.tracks[0]?.id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>This ${m.period} you listened for</p>
            <p class="stats-recap-number stats-recap-big" ${at(450)}>${counter(Math.round(m.summary.seconds / 60), 450, `${count(Math.round(m.summary.seconds / 60))} minutes`)}</p>
            <p class="stats-recap-unit stats-recap-in" ${at(900)}>minutes</p>
            <p class="stats-recap-note stats-recap-in" ${at(1900)}>That's ${duration(m.summary.seconds)} of music, across ${plural(m.summary.streams, 'stream')}.</p>
            ${m.change === null ? `<p class="stats-recap-chip stats-recap-in" ${at(2500)}>Your first ${m.period} on record</p>` : `<p class="stats-recap-chip stats-recap-in" ${at(2500)}>${m.change === 0 ? `Same as the ${m.period} before` : `${m.change > 0 ? '+' : '−'}${Math.abs(m.change)}% on the ${m.period} before`}</p>`}`,
    }),
    days: (m) => {
        const max = Math.max(1, ...m.days.map((d) => d.seconds));
        const peak = m.days.findIndex((d) => d.seconds === max);
        return {
            duration: 6600,
            track: m.tracks[1]?.id || m.tracks[0]?.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your loudest day was</p>
            <h2 class="stats-recap-title stats-recap-big" ${at(450)}>${escape(m.days[peak].date.toLocaleDateString(undefined, { weekday: 'long' }))}</h2>
            <div class="stats-recap-week" role="img" aria-label="Minutes listened each day">${m.days
                .map(
                    (d, i) =>
                        `<span class="${i === peak ? 'is-peak' : ''}" style="--h:${(d.seconds / max).toFixed(3)};--i:${i}"><i></i><small>${escape(d.date.toLocaleDateString(undefined, { weekday: 'narrow' }))}</small></span>`
                )
                .join('')}</div>
            <p class="stats-recap-note stats-recap-in" ${at(1700)}>${duration(max)} of music in one day.</p>`,
        };
    },
    streak: (m) => {
        const active = m.days.filter((d) => d.seconds > 0).length;
        return {
            duration: 6600,
            track: m.tracks[1]?.id || m.tracks[0]?.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>You pressed play on</p>
            <h2 class="stats-recap-title stats-recap-big" ${at(450)}>${counter(active, 450)} of ${m.days.length} days</h2>
            <div class="stats-recap-streak" aria-hidden="true">${m.days.map((d, i) => `<i class="${d.seconds ? 'is-on' : ''}" style="--i:${i}"></i>`).join('')}</div>
            <p class="stats-recap-note stats-recap-in" ${at(1900)}>${m.summary.longestStreak > 1 ? `Your longest run: ${m.summary.longestStreak} days in a row.` : 'Every listen counted.'}</p>`,
        };
    },
    calendar: (m) => {
        const max = Math.max(1, ...m.days.map((d) => d.seconds));
        const active = m.days.filter((d) => d.seconds > 0).length;
        const offset = (m.days[0].date.getDay() + 6) % 7;
        const weekdays = Array.from({ length: 7 }, (_, i) =>
            new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' })
        );
        return {
            duration: 7600,
            track: m.tracks[1]?.id || m.tracks[0]?.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>You showed up on</p>
            <h2 class="stats-recap-title stats-recap-big" ${at(450)}>${counter(active, 450)} of ${m.days.length} days</h2>
            <div class="stats-recap-calendar" role="img" aria-label="Days you listened this month">${weekdays.map((d) => `<b>${escape(d)}</b>`).join('')}${'<span></span>'.repeat(offset)}${m.days
                .map(
                    (d, i) =>
                        `<i class="${d.seconds ? 'is-on' : ''}" style="--a:${(0.25 + (d.seconds / max) * 0.75).toFixed(2)};--i:${i}"></i>`
                )
                .join('')}</div>
            <p class="stats-recap-note stats-recap-in" ${at(2600)}>${m.summary.longestStreak > 1 ? `Longest streak: ${m.summary.longestStreak} days in a row.` : 'Every listen counted.'}</p>`,
        };
    },
    topTrack: (m) => {
        const t = m.tracks[0];
        return {
            duration: 7200,
            track: t.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your song of the ${m.period}</p>
            <div class="stats-recap-hero stats-recap-big" ${at(450)}>${art(t.cover)}</div>
            <h2 class="stats-recap-name stats-recap-in" ${at(1200)}>${escape(t.title)}</h2>
            <p class="stats-recap-by stats-recap-in" ${at(1400)}>${escape(t.artist)}</p>
            <p class="stats-recap-chip stats-recap-in" ${at(2000)}>Played ${t.streams === 1 ? 'once' : `${count(t.streams)} times`}</p>`,
        };
    },
    onRepeat: (m) => ({
        duration: 7600,
        track: m.tracks[0].id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>On repeat</p>
            <ol class="stats-recap-list">${m.tracks
                .map(
                    (t, i) =>
                        `<li class="stats-recap-in" ${at(500 + i * 260)}><b>${i + 1}</b>${art(t.cover)}<span><strong>${escape(t.title)}</strong><small>${escape(t.artist)}</small></span><em>${count(t.streams)}×</em></li>`
                )
                .join('')}</ol>`,
    }),
    topArtist: (m) => {
        const a = m.artists[0];
        return {
            duration: 7200,
            track: a.track || m.tracks[0]?.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your artist of the ${m.period}</p>
            <div class="stats-recap-hero is-artist stats-recap-big" ${at(450)}>${art(a.cover)}</div>
            <h2 class="stats-recap-name stats-recap-in" ${at(1200)}>${escape(a.name)}</h2>
            <p class="stats-recap-chip stats-recap-in" ${at(1900)}>${duration(a.seconds)} · ${Math.round(a.share * 100)}% of your listening</p>`,
        };
    },
    lineup: (m) => ({
        duration: 7800,
        track: m.artists[1]?.track || m.tracks[0]?.id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your ${escape(m.label.short)} lineup</p>
            <div class="stats-recap-lineup">${m.artists
                .map(
                    (a, i) =>
                        `<p class="stats-recap-in${i ? '' : ' is-headliner'}" ${at(500 + i * 420)}>${escape(a.name)}</p>`
                )
                .join('')}</div>
            <p class="stats-recap-note stats-recap-in" ${at(600 + m.artists.length * 420)}>${plural(m.summary.artists, 'artist')} played this ${m.period}.</p>`,
    }),
    album: (m) => ({
        duration: 6800,
        track: m.album.track || m.tracks[0]?.id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Album of the ${m.period}</p>
            <div class="stats-recap-hero stats-recap-big" ${at(450)}>${art(m.album.cover)}</div>
            <h2 class="stats-recap-name stats-recap-in" ${at(1200)}>${escape(m.album.title)}</h2>
            <p class="stats-recap-by stats-recap-in" ${at(1400)}>${escape(m.album.artist)}</p>
            <p class="stats-recap-chip stats-recap-in" ${at(1900)}>${duration(m.album.seconds)} spent inside it</p>`,
    }),
    clock: (m) => {
        const max = Math.max(1, ...m.hours);
        // 24 spokes around a clock face, longest where you listened most.
        const spokes = m.hours
            .map((seconds, hour) => {
                const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
                const inner = 34,
                    outer = inner + 6 + (seconds / max) * 52;
                const [x1, y1, x2, y2] = [inner, inner, outer, outer].map((r, i) =>
                    (100 + r * (i % 2 ? Math.sin(angle) : Math.cos(angle))).toFixed(1)
                );
                return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${hour === m.peakHour ? 'is-peak' : ''}" style="--i:${hour}" />`;
            })
            .join('');
        return {
            duration: 6800,
            track: m.tracks[2]?.id || m.tracks[0]?.id,
            html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your listening peaked at ${escape(hourLabel(m.peakHour))}</p>
            <h2 class="stats-recap-title stats-recap-big" ${at(450)}>${listenerType(m.peakHour)}</h2>
            <svg class="stats-recap-clock" viewBox="0 0 200 200" role="img" aria-label="Listening by hour of day"><circle cx="100" cy="100" r="28" />${spokes}</svg>`,
        };
    },
    variety: (m) => ({
        duration: 6600,
        track: m.tracks[2]?.id || m.tracks[0]?.id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(200)}>Your ${m.period} in numbers</p>
            <dl class="stats-recap-figures">${[
                [m.summary.tracks, 'tracks'],
                [m.summary.artists, 'artists'],
                [m.summary.albums, 'albums'],
                [m.summary.streams, 'streams'],
            ]
                .map(
                    ([value, noun], i) =>
                        `<div class="stats-recap-in" ${at(450 + i * 300)}><dd>${counter(value, 450 + i * 300)}</dd><dt>${value === 1 ? noun.slice(0, -1) : noun}</dt></div>`
                )
                .join('')}</dl>`,
    }),
    outro: (m) => ({
        duration: 0,
        track: m.tracks[0]?.id,
        html: `<p class="stats-recap-kicker stats-recap-in" ${at(150)}>That was your ${m.period === 'week' ? 'week' : escape(m.label.short)}</p>
            <div class="stats-recap-card stats-recap-big" ${at(350)}><canvas role="img" aria-label="Your ${m.period} share card"></canvas></div>
            <div class="stats-recap-actions stats-recap-in" ${at(1100)}><button type="button" class="stats-recap-primary" data-recap-action="share">${I_SHARE(18)}<span>Share</span></button><button type="button" data-recap-action="replay">${I_REPLAY(18)}<span>Watch again</span></button></div>`,
    }),
};

// Week and month tell different stories; seeded picks keep each recap from feeling like the last one.
function storyFor(m) {
    const random = seeded(m.seed);
    const pick = (...options) => options[Math.floor(random() * options.length)];
    const order =
        m.period === 'week'
            ? [
                  'intro',
                  'minutes',
                  pick('days', 'streak'),
                  'topTrack',
                  'onRepeat',
                  'topArtist',
                  pick('clock', 'variety'),
                  'outro',
              ]
            : [
                  'intro',
                  'minutes',
                  'calendar',
                  'topTrack',
                  'onRepeat',
                  'topArtist',
                  'lineup',
                  pick('album', 'variety'),
                  'clock',
                  'outro',
              ];
    const possible = {
        topTrack: m.tracks.length > 0,
        onRepeat: m.tracks.length > 1,
        topArtist: m.artists.length > 0,
        lineup: m.artists.length > 2,
        album: Boolean(m.album?.cover),
    };
    return order.filter((name) => possible[name] !== false).map((name) => ({ name, ...SLIDES[name](m) }));
}

// ---------- Soundtrack ----------

// Plays the recap's songs from their hook, pausing the main player while it does.
class Soundtrack {
    constructor(ui) {
        this.ui = ui;
        try {
            this.muted = localStorage.getItem(SOUND) === 'off';
        } catch {
            this.muted = false;
        }
    }
    async cue(trackId) {
        this.wanted = trackId;
        if (this.muted || this.closed || !trackId || trackId === this.playing) return;
        this.playing = trackId;
        let meta;
        try {
            meta = await this.ui?.api?.getTrackMetadata(trackId);
        } catch {
            /* A missing track keeps the current song going. */
        }
        if (this.playing !== trackId || this.closed || this.muted || !meta?.serverAudioUrl) return;
        const main = this.ui?.player?.activeElement;
        if (!this.held && main && !main.paused) {
            this.held = main;
            await this.ui.player.pauseWithFade?.(main).catch(() => main.pause());
        }
        const next = new Audio();
        next.preload = 'auto';
        next.src = meta.serverAudioUrl;
        next.volume = 0;
        try {
            await new Promise((resolve, reject) => {
                next.addEventListener('loadedmetadata', resolve, { once: true });
                next.addEventListener('error', reject, { once: true });
            });
            if (Number.isFinite(next.duration)) next.currentTime = Math.min(next.duration * 0.3, 75);
            if (this.playing !== trackId || this.closed || this.muted) return;
            await next.play();
        } catch {
            return;
        }
        const previous = this.audio;
        this.audio = next;
        void fade(next, 0.75, 1400);
        if (previous) void fade(previous, 0, 900).then(() => previous.pause());
    }
    setMuted(muted) {
        this.muted = muted;
        try {
            localStorage.setItem(SOUND, muted ? 'off' : 'on');
        } catch {
            /* Sound simply follows the default next time. */
        }
        if (muted) {
            this.release();
        } else {
            this.playing = null;
            void this.cue(this.wanted);
        }
    }
    release() {
        const audio = this.audio;
        this.audio = null;
        this.playing = null;
        if (audio) void fade(audio, 0, 600).then(() => audio.pause());
        if (this.held) {
            const main = this.held;
            this.held = null;
            void this.ui.player.playWithFade?.(main).catch(() => main.play().catch(() => {}));
        }
    }
    stop() {
        this.closed = true;
        this.release();
    }
}
function fade(audio, to, ms) {
    const from = audio.volume,
        start = performance.now();
    return new Promise((resolve) => {
        const step = (now) => {
            const t = Math.min(1, (now - start) / ms);
            audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
            if (t < 1) requestAnimationFrame(step);
            else resolve();
        };
        requestAnimationFrame(step);
    });
}

// ---------- Player ----------

const scene = '<span class="stats-recap-scene" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';

class RecapPlayer {
    constructor(model, ui) {
        this.model = model;
        this.ui = ui;
        this.slides = storyFor(model);
        this.index = -1;
        this.elapsed = 0;
        this.sound = new Soundtrack(ui);
        this.root = document.createElement('dialog');
        this.root.className = `stats-recap stats-ed-${model.edition}`;
        this.root.setAttribute('aria-label', `Your ${model.period} recap, ${model.label.long}`);
        this.root.innerHTML = `<div class="stats-recap-surround" aria-hidden="true">${scene}</div>
            <div class="stats-recap-frame" tabindex="-1">${scene}
                <button type="button" class="stats-recap-zone is-prev" data-recap-step="-1" aria-label="Previous"></button>
                <button type="button" class="stats-recap-zone is-next" data-recap-step="1" aria-label="Next"></button>
                <div class="stats-recap-slides" aria-live="polite"></div>
                <div class="stats-recap-top">
                    <div class="stats-recap-progress" aria-hidden="true">${this.slides.map(() => '<i><b></b></i>').join('')}</div>
                    <div class="stats-recap-bar">
                        <span class="stats-recap-edition"><i class="stats-ed-swatch stats-ed-${model.edition}">${scene}</i>${escape(EDITIONS[model.edition].name)}</span>
                        <button type="button" class="stats-recap-control" data-recap-action="pause" aria-label="Pause" aria-pressed="false">${I_PAUSE(18)}</button>
                        <button type="button" class="stats-recap-control" data-recap-action="sound" aria-pressed="${!this.sound.muted}" aria-label="Music">${this.sound.muted ? I_MUTE(18) : I_VOLUME(18)}</button>
                        <button type="button" class="stats-recap-control" data-recap-action="close" aria-label="Close recap">${I_X(20)}</button>
                    </div>
                </div>
            </div>`;
        document.body.append(this.root);
        // Edition faces can land after a slide is laid out; display type is fitted again when they do.
        this.refit = () => {
            const slide = this.root.querySelector('.stats-recap-slide.is-active');
            if (slide) fitText(slide);
        };
        document.fonts.addEventListener('loadingdone', this.refit);
        void loadEditionFont(model.edition).then(this.refit);
        this.bind();
    }
    bind() {
        const root = this.root;
        let holdTimer;
        root.addEventListener('pointerdown', (event) => {
            if (!event.target.closest('.stats-recap-zone') || event.button) return;
            clearTimeout(holdTimer);
            this.held = false;
            holdTimer = setTimeout(() => {
                this.held = true;
                this.setPaused(true, true);
            }, 240);
        });
        const release = () => {
            clearTimeout(holdTimer);
            if (this.held) this.setPaused(false, true);
        };
        root.addEventListener('pointerup', release);
        root.addEventListener('pointercancel', release);
        root.addEventListener('click', (event) => {
            const zone = event.target.closest('[data-recap-step]');
            if (zone) {
                // A hold paused the story; letting go only resumes it.
                if (this.held) this.held = false;
                else this.go(this.index + Number(zone.dataset.recapStep));
                return;
            }
            const action = event.target.closest('[data-recap-action]')?.dataset.recapAction;
            if (action === 'close') this.close();
            else if (action === 'pause') this.setPaused(!this.paused);
            else if (action === 'sound') this.toggleSound(event.target.closest('button'));
            else if (action === 'replay') this.go(0);
            else if (action === 'share') void this.share(event.target.closest('button'));
            else if (action === 'unlock-share') {
                this.dismissUnlock();
                void this.share(this.root.querySelector('[data-recap-action="share"]'));
            } else if (action === 'unlock-close') this.dismissUnlock();
        });
        root.addEventListener('keydown', (event) => {
            if (event.target.closest('.stats-recap-unlock')) return;
            if (event.key === 'ArrowRight') this.go(this.index + 1);
            else if (event.key === 'ArrowLeft') this.go(this.index - 1);
            else if (event.key === ' ' && !event.target.closest('button:not(.stats-recap-zone)')) {
                event.preventDefault();
                this.setPaused(!this.paused);
            } else return;
            event.preventDefault();
        });
        root.addEventListener('cancel', (event) => {
            event.preventDefault();
            if (this.root.querySelector('.stats-recap-unlock')) this.dismissUnlock();
            else this.close();
        });
        root.addEventListener('close', () => this.cleanup());
        this.onPopState = () => this.close();
        window.addEventListener('popstate', this.onPopState);
    }
    open() {
        this.root.showModal();
        // The story itself takes focus, so arrows and Space steer it without a button lighting up.
        this.root.querySelector('.stats-recap-frame').focus({ preventScroll: true });
        this.go(0);
        let last = performance.now();
        const tick = (now) => {
            const dt = Math.min(100, now - last);
            last = now;
            const slide = this.slides[this.index];
            if (!this.paused && !document.hidden) this.elapsed += dt;
            const progress = slide.duration ? Math.min(1, this.elapsed / slide.duration) : 1;
            this.bars[this.index]?.style.setProperty('--p', progress.toFixed(4));
            for (const element of this.counters) {
                const t = reduced.matches ? 1 : Math.min(1, Math.max(0, (this.elapsed - element.delay) / 1500));
                const value = Math.round(element.value * (1 - Math.pow(1 - t, 4)));
                if (value !== element.shown) element.node.textContent = count((element.shown = value));
            }
            if (slide.duration && this.elapsed >= slide.duration) this.go(this.index + 1);
            this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
    }
    go(index) {
        if (index < 0 || index >= this.slides.length) return;
        if (index === this.index && index !== 0) return;
        const container = this.root.querySelector('.stats-recap-slides');
        const previous = container.querySelector('.stats-recap-slide.is-active');
        if (previous) {
            previous.classList.replace('is-active', 'is-leaving');
            previous.inert = true;
            setTimeout(() => previous.remove(), reduced.matches ? 0 : 520);
        }
        const forward = index >= this.index;
        this.index = index;
        this.elapsed = 0;
        const slide = this.slides[index];
        const element = document.createElement('section');
        element.className = `stats-recap-slide is-active stats-recap-slide-${slide.name}${forward ? '' : ' is-back'}`;
        element.setAttribute('aria-roledescription', 'slide');
        element.setAttribute('aria-label', `${index + 1} of ${this.slides.length}`);
        element.innerHTML = slide.html;
        container.append(element);
        fitText(element);
        this.bars = [...this.root.querySelectorAll('.stats-recap-progress i')];
        this.bars.forEach((bar, i) => bar.style.setProperty('--p', i < index ? '1' : '0'));
        this.counters = [...element.querySelectorAll('[data-recap-count]')].map((node) => ({
            node,
            value: Number(node.dataset.recapCount),
            delay: Number(node.dataset.recapDelay) || 0,
            shown: -1,
        }));
        void this.sound.cue(slide.track);
        if (slide.name === 'outro') void this.finish(element);
    }
    setPaused(paused, held = false) {
        this.paused = paused;
        this.root.classList.toggle('is-paused', paused);
        const button = this.root.querySelector('[data-recap-action="pause"]');
        if (held) return;
        button.setAttribute('aria-pressed', String(paused));
        button.setAttribute('aria-label', paused ? 'Play' : 'Pause');
        button.innerHTML = paused ? I_PLAY(18) : I_PAUSE(18);
    }
    toggleSound(button) {
        this.sound.setMuted(!this.sound.muted);
        button.setAttribute('aria-pressed', String(!this.sound.muted));
        button.innerHTML = this.sound.muted ? I_MUTE(18) : I_VOLUME(18);
        if (!this.sound.muted) void this.sound.cue(this.slides[this.index].track);
    }
    shareContext(returnFocus) {
        return {
            data: this.model.data,
            period: this.model.period,
            anchor: this.model.anchor,
            label: this.model.label.long,
            colors: this.colors || ['', '', ''],
            user: pb.authStore.record,
            edition: this.model.edition,
            returnFocus,
        };
    }
    async finish(element) {
        const canvas = element.querySelector('canvas');
        const { buildShareModel, drawShareCard } = await import('./listening-stats-share.js');
        this.colors ||= await coverColors(this.model.tracks);
        const picks = {
            format: 'story',
            style: this.model.edition,
            headline: 'minutes',
            artists: true,
            tracks: true,
            totals: true,
            clock: false,
            handle: true,
        };
        await drawShareCard(canvas, buildShareModel(this.shareContext()), picks).catch(() => {});
        if (this.revealed || !this.root.open) return;
        this.revealed = true;
        const result = await collectEdition(this.model.key, this.model.edition);
        window.dispatchEvent(new CustomEvent('listening-recap-watched', { detail: { key: this.model.key } }));
        this.revealTimer = setTimeout(
            () => (result.fresh ? this.unlock(canvas, result.owned) : this.toast(result.owned)),
            reduced.matches ? 200 : 1500
        );
    }
    async share(button) {
        const { openStatsShare } = await import('./listening-stats-share.js');
        this.colors ||= await coverColors(this.model.tracks);
        openStatsShare(this.shareContext(button));
    }
    // A first find gets the full-screen reveal; an edition already collected gets a quiet note.
    unlock(source, owned) {
        const edition = EDITIONS[this.model.edition];
        const total = Object.keys(EDITIONS).length;
        const overlay = document.createElement('div');
        overlay.className = `stats-recap-unlock stats-ed-${this.model.edition}`;
        overlay.setAttribute('role', 'alertdialog');
        overlay.setAttribute('aria-labelledby', 'stats-recap-unlock-name');
        overlay.setAttribute('aria-describedby', 'stats-recap-unlock-meta');
        overlay.innerHTML = `<div class="stats-recap-unlock-rays" aria-hidden="true"></div>
            <div class="stats-recap-unlock-burst" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--a:${i * 20}deg;--r:${(0.6 + ((i * 7) % 5) * 0.12).toFixed(2)};--i:${i}"></i>`).join('')}</div>
            <div class="stats-recap-unlock-stage">
                <p class="stats-recap-unlock-kicker">New edition unlocked</p>
                <div class="stats-recap-unlock-card">${scene}<canvas aria-hidden="true"></canvas><span class="stats-recap-unlock-sheen"></span></div>
                <h2 class="stats-recap-unlock-name" id="stats-recap-unlock-name">${escape(edition.name)}</h2>
                <p class="stats-recap-unlock-meta" id="stats-recap-unlock-meta">${edition.period === 'week' ? 'Weekly' : 'Monthly'} edition · ${owned} of ${total} collected. It is now a style on your share cards.</p>
                <div class="stats-recap-unlock-actions"><button type="button" class="stats-recap-primary" data-recap-action="unlock-share">${I_SHARE(18)}<span>Share in ${escape(edition.name)}</span></button><button type="button" data-recap-action="unlock-close">Keep it</button></div>
            </div>`;
        const copy = overlay.querySelector('canvas');
        if (source?.width) {
            copy.width = source.width;
            copy.height = source.height;
            copy.getContext('2d').drawImage(source, 0, 0);
        }
        this.root.append(overlay);
        const card = overlay.querySelector('.stats-recap-unlock-card');
        overlay.addEventListener('pointermove', (event) => {
            if (reduced.matches || event.pointerType !== 'mouse') return;
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--ry', `${((event.clientX - rect.left) / rect.width - 0.5) * 22}deg`);
            card.style.setProperty('--rx', `${((event.clientY - rect.top) / rect.height - 0.5) * -16}deg`);
            card.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        });
        this.setPaused(true);
        this.root.querySelector('.stats-recap-frame').inert = true;
        overlay.querySelector('[data-recap-action="unlock-share"]').focus({ preventScroll: true });
    }
    dismissUnlock() {
        const overlay = this.root.querySelector('.stats-recap-unlock');
        if (!overlay || overlay.classList.contains('is-leaving')) return;
        overlay.classList.add('is-leaving');
        setTimeout(() => overlay.remove(), reduced.matches ? 0 : 420);
        this.root.querySelector('.stats-recap-frame').inert = false;
        this.setPaused(false);
        this.root.querySelector('[data-recap-action="share"]')?.focus({ preventScroll: true });
    }
    toast(owned) {
        const edition = EDITIONS[this.model.edition];
        const note = document.createElement('p');
        note.className = 'stats-recap-toast';
        note.setAttribute('role', 'status');
        note.innerHTML = `<i class="stats-ed-swatch stats-ed-${this.model.edition}">${scene}</i><span><strong>${escape(edition.name)} edition</strong><small>Already in your collection · ${owned} of ${Object.keys(EDITIONS).length}</small></span>`;
        this.root.querySelector('.stats-recap-frame').append(note);
        setTimeout(() => note.classList.add('is-leaving'), 4200);
        setTimeout(() => note.remove(), 4800);
    }
    close() {
        if (!this.root.open || this.root.classList.contains('is-closing')) return;
        this.root.classList.add('is-closing');
        setTimeout(() => this.root.close(), reduced.matches ? 0 : 280);
    }
    cleanup() {
        cancelAnimationFrame(this.frame);
        clearTimeout(this.revealTimer);
        window.removeEventListener('popstate', this.onPopState);
        document.fonts.removeEventListener('loadingdone', this.refit);
        this.sound.stop();
        this.root.remove();
        this.onClose?.();
    }
}

// Display type shrinks until its longest word fits the frame, instead of breaking mid-word.
function fitText(slide) {
    for (const node of slide.querySelectorAll(
        '.stats-recap-title, .stats-recap-name, .stats-recap-number, .stats-recap-lineup p'
    )) {
        node.style.removeProperty('font-size');
        const over = node.scrollWidth / node.clientWidth;
        if (over > 1.01) node.style.fontSize = `${parseFloat(getComputedStyle(node).fontSize) / over}px`;
    }
}

async function coverColors(tracks) {
    const colors = await Promise.all(
        [0, 1, 2].map(
            (i) =>
                new Promise((resolve) => {
                    const url = tracks[i % Math.max(1, tracks.length)]?.cover;
                    if (!url) return resolve('');
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => {
                        try {
                            resolve(getVibrantColorFromImage(img) || '');
                        } catch {
                            resolve('');
                        }
                    };
                    img.onerror = () => resolve('');
                    img.src = url;
                })
        )
    );
    return colors;
}

// ---------- Notices on the stats page ----------

const loaded = new Map();
function loadRecap(recap, request, uid) {
    const key = `${uid}|${recap.key}`;
    if (!loaded.has(key)) {
        const promise = request(recap.period, recap.anchor)
            .then((data) => (data?.summary?.streams && !data.locked ? recapModel(recap, data, uid) : null))
            .catch(() => {
                loaded.delete(key);
                return null;
            });
        loaded.set(key, promise);
    }
    return loaded.get(key);
}

export async function openRecap(model, ui, onClose) {
    await Promise.race([loadEditionFont(model.edition), new Promise((resolve) => setTimeout(resolve, 900))]);
    const player = new RecapPlayer(model, ui);
    player.onClose = onClose;
    player.open();
    return player;
}

let generation = 0;
export async function showRecapNotices(container, { request, ui }) {
    const current = ++generation;
    const uid = pb.authStore.record?.id;
    if (!uid) {
        container.replaceChildren();
        return;
    }
    const [models, collection] = await Promise.all([
        Promise.all(readyRecaps().map((recap) => loadRecap(recap, request, uid))),
        loadCollection(),
    ]);
    if (current !== generation || uid !== pb.authStore.record?.id) return;
    const ready = models.filter(Boolean);
    for (const model of ready) void loadEditionFont(model.edition);
    const previous = new Set([...container.children].map((card) => card.dataset.recap));
    container.innerHTML = ready
        .map((m) => {
            const seen = Boolean(collection.watched[m.key]);
            const owned = Boolean(collection.editions[m.edition]);
            const covers = m.tracks.filter((t) => t.cover).slice(0, 3);
            return `<button type="button" class="stats-recap-notice stats-ed-${m.edition}${seen ? ' is-seen' : ''}${previous.has(m.key) ? '' : ' is-new'}" data-recap="${m.key}">${scene}
                <span class="stats-recap-notice-covers" aria-hidden="true">${covers.map((t, i) => `<img src="${escape(t.cover)}" alt="" style="--i:${i}" />`).join('')}</span>
                <span class="stats-recap-notice-text">
                    <span class="stats-recap-notice-kicker">${owned ? '' : '<b>New edition</b>'}${escape(EDITIONS[m.edition].name)}</span>
                    <strong>${seen ? `Your ${m.period === 'week' ? 'week' : escape(m.label.short)}, again` : `Your ${m.period === 'week' ? 'week' : escape(m.label.short)} is ready`}</strong>
                    <small>${escape(m.label.long)} · ${duration(m.summary.seconds)}</small>
                </span>
                <span class="stats-recap-notice-play" aria-hidden="true">${seen ? I_REPLAY(20) : I_PLAY(22)}</span>
                <span class="sr-only">${seen ? 'Watch again' : 'Watch your recap'}</span>
            </button>`;
        })
        .join('');
    container.onclick = async (event) => {
        const card = event.target.closest('[data-recap]');
        const model = ready.find((m) => m.key === card?.dataset.recap);
        if (!model || card.disabled) return;
        card.disabled = true;
        try {
            await openRecap(model, ui, () => {
                if (card.isConnected) card.focus({ preventScroll: true });
                void showRecapNotices(container, { request, ui });
            });
        } finally {
            card.disabled = false;
        }
    };
    container.onpointermove = (event) => {
        const card = event.target.closest('.stats-recap-notice');
        if (!card || event.pointerType !== 'mouse' || reduced.matches) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--gx', `${((event.clientX - rect.left) / rect.width) * 100}%`);
        card.style.setProperty('--gy', `${((event.clientY - rect.top) / rect.height) * 100}%`);
    };
    // Development: window.monochromeRecap('week', 'vinyl') previews any edition on the latest data.
    if (import.meta.env.DEV)
        window.monochromeRecap = async (period = 'week', edition) => {
            const recap = readyRecaps().find((r) => r.period === period);
            if (edition && !POOLS[period].includes(edition)) throw new Error(`${edition} is not a ${period} edition`);
            const model = await loadRecap(recap, request, uid);
            if (!model) throw new Error(`No listening in the last ${period}`);
            return openRecap({ ...model, edition: edition || model.edition }, ui);
        };
}
