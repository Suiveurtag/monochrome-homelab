// Library search: forgiving matching (accents, spacing, punctuation, typos), lyrics, field filters and
// popularity ranking. Pure functions only, so the index can be built once and queried on every keystroke.

const STOPWORDS = new Set([
    'the',
    'a',
    'an',
    'and',
    'feat',
    'ft',
    'featuring',
    'with',
    'by',
    'of',
    'le',
    'la',
    'les',
    'de',
    'des',
    'du',
    'et',
]);
const FILTER_KEYS = { artist: 'artist', by: 'artist', album: 'album', title: 'title', song: 'title' };
const LYRIC_KEYS = new Set(['lyrics', 'lyric', 'lyr', 'paroles']);
const YEAR_KEYS = new Set(['year', 'annee', 'y']);
const FEAT_PATTERN = /[([]\s*(?:feat\.?|ft\.?|featuring|with)\s+([^)\]]+)[)\]]/gi;
const ARTIST_SPLIT = /\s*(?:,|;|\/|&|\bx\b|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\bvs\.?)\s*/i;

const WEIGHTS = { title: 1, artist: 0.95, album: 0.74, version: 0.6, year: 0.5, lyrics: 0.46 };
const MIN_SCORE = 30;
const POPULARITY_BOOST = 14;

export function normalizeSearchText(value) {
    return String(value ?? '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[’'`´]/g, '')
        .replace(/&/g, ' and ')
        .replace(/\$/g, 's')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

const compactOf = (norm) => norm.replace(/ /g, '');
const tokensOf = (norm) => (norm ? norm.split(' ') : []);

function makeField(value) {
    const norm = normalizeSearchText(value);
    const tokens = tokensOf(norm);
    // Joined neighbours let "pinkpantheress" find "Pink Pantheress" token by token.
    const joined = [];
    for (let i = 0; i < tokens.length - 1; i++) joined.push(tokens[i] + tokens[i + 1]);
    return { norm, compact: compactOf(norm), tokens: [...tokens, ...joined] };
}

function makeQueryText(value) {
    const norm = normalizeSearchText(value);
    const all = tokensOf(norm);
    const meaningful = all.filter((t) => !STOPWORDS.has(t));
    return { norm, compact: compactOf(norm), tokens: meaningful.length ? meaningful : all };
}

/** Optimal string alignment distance, abandoned as soon as it exceeds `max`. */
export function editDistance(a, b, max = 2) {
    if (a === b) return 0;
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prevPrev = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prevPrev && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                v = Math.min(v, prevPrev[j - 2] + 1);
            }
            cur[j] = v;
            if (v < rowMin) rowMin = v;
        }
        if (rowMin > max) return max + 1;
        prevPrev = prev;
        prev = cur;
    }
    return prev[b.length];
}

const allowedTypos = (length) => (length >= 8 ? 2 : length >= 4 ? 1 : 0);

function tokenQuality(queryToken, fieldTokens, isLast) {
    let best = 0;
    const typos = allowedTypos(queryToken.length);
    for (const token of fieldTokens) {
        if (token === queryToken) return 1;
        if (token.startsWith(queryToken) && (isLast || queryToken.length >= 3)) {
            best = Math.max(best, 0.84);
            continue;
        }
        if (!typos || best >= 0.7) continue;
        const d = editDistance(queryToken, token, typos);
        if (d <= typos) best = Math.max(best, 0.72 - d * 0.08);
        else if (isLast && token.length > queryToken.length) {
            // Still typing: compare against the start of the word.
            const p = editDistance(queryToken, token.slice(0, queryToken.length), 1);
            if (p <= 1) best = Math.max(best, 0.6);
        }
    }
    return best;
}

/** Mean quality of every query token found in the field tokens; 0 when any token is missing. */
function coverage(queryTokens, fieldTokens) {
    if (!queryTokens.length || !fieldTokens.length) return 0;
    let total = 0;
    for (let i = 0; i < queryTokens.length; i++) {
        const isLast = i === queryTokens.length - 1;
        let quality = tokenQuality(queryTokens[i], fieldTokens, isLast);
        // "pink pantheress" typed apart can still meet a single field word.
        if (quality < 1 && i + 1 < queryTokens.length) {
            const pair = tokenQuality(
                queryTokens[i] + queryTokens[i + 1],
                fieldTokens,
                i + 1 === queryTokens.length - 1
            );
            if (pair > quality) {
                total += pair * 2;
                i++;
                continue;
            }
        }
        if (!quality) return 0;
        total += quality;
    }
    return total / queryTokens.length;
}

function scoreField(field, q) {
    if (!field?.norm || !q.norm) return 0;
    const longEnough = q.compact.length >= 3;
    if (field.norm === q.norm || (longEnough && field.compact === q.compact)) return 1;
    if (field.norm.startsWith(q.norm) || (longEnough && field.compact.startsWith(q.compact))) return 0.88;
    if (` ${field.norm}`.includes(` ${q.norm}`)) return 0.78;
    if (q.compact.length >= 5 && field.compact.includes(q.compact)) return 0.56;
    const tokens = coverage(q.tokens, field.tokens);
    if (tokens) return 0.62 * tokens;
    if (q.compact.length >= 5) {
        const typos = q.compact.length >= 9 ? 2 : 1;
        const whole = editDistance(q.compact, field.compact, typos);
        if (whole <= typos) return 0.6 - whole * 0.07;
        if (field.compact.length > q.compact.length) {
            const start = editDistance(q.compact, field.compact.slice(0, q.compact.length), typos);
            if (start <= typos) return 0.5 - start * 0.07;
        }
    }
    return 0;
}

/** Plain lyric lines from LRC, TTML or plain text. */
export function lyricsToLines(raw) {
    if (!raw || typeof raw !== 'string') return [];
    let text = raw;
    if (/<(?:tt|p|span|div)\b/i.test(text)) {
        text = text
            .replace(/<\/(?:p|div)>|<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&apos;|&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }
    return text
        .split(/\r?\n/)
        .map((line) =>
            line
                .replace(/\[[^\]]*\]/g, '')
                .replace(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g, '')
                .trim()
        )
        .filter((line) => /[\p{L}\p{N}]/u.test(line));
}

function makeLyrics(raw) {
    const lines = lyricsToLines(raw);
    if (!lines.length) return null;
    const norms = lines.map(normalizeSearchText);
    const starts = [];
    let joined = '';
    for (const norm of norms) {
        starts.push(joined.length);
        joined += `${norm} `;
    }
    return { lines, starts, joined, padded: ` ${joined}` };
}

function findLyric(lyrics, q) {
    if (!lyrics || q.norm.length < 4) return null;
    const isPhrase = q.norm.includes(' ');
    if (!isPhrase && q.norm.length < 5) return null;
    const at = lyrics.padded.indexOf(` ${q.norm}`);
    if (at < 0) return null;
    let line = 0;
    while (line + 1 < lyrics.starts.length && lyrics.starts[line + 1] <= at) line++;
    return { line: lyrics.lines[line], words: q.norm.split(' ').length };
}

export function parseSearchQuery(raw) {
    const filters = { artist: [], album: [], title: [] };
    const negated = { artist: [], album: [], title: [] };
    const lyrics = [];
    const years = [];
    const phrases = [];
    const excludes = [];
    const pattern = /(-?)(?:([\p{L}]+):)?(?:"([^"]*)"?|(\S+))/gu;
    const free = [];
    let m;
    while ((m = pattern.exec(String(raw ?? '')))) {
        const [, minus, keyRaw, quoted, bare] = m;
        const value = quoted ?? bare ?? '';
        const key = normalizeSearchText(keyRaw || '');
        if (!value.trim()) continue;
        if (minus && !key) {
            excludes.push(normalizeSearchText(value));
            continue;
        }
        if (minus && FILTER_KEYS[key]) negated[FILTER_KEYS[key]].push(makeQueryText(value));
        else if (FILTER_KEYS[key]) filters[FILTER_KEYS[key]].push(makeQueryText(value));
        else if (LYRIC_KEYS.has(key)) lyrics.push(makeQueryText(value));
        else if (YEAR_KEYS.has(key)) years.push(value.trim());
        else {
            const text = keyRaw && !quoted ? `${keyRaw}:${value}` : value;
            if (quoted !== undefined) phrases.push(makeQueryText(text));
            free.push(text);
        }
    }
    const text = makeQueryText(free.join(' '));
    const hasFilters =
        filters.artist.length || filters.album.length || filters.title.length || lyrics.length || years.length;
    return { text, filters, negated, lyrics, years, phrases, excludes: excludes.filter(Boolean), hasFilters, raw };
}

function splitArtistNames(names) {
    const out = new Set();
    for (const name of names) {
        if (!name) continue;
        out.add(name);
        for (const part of String(name).split(ARTIST_SPLIT)) if (part.trim()) out.add(part.trim());
    }
    return [...out];
}

function featuredInTitle(title) {
    const names = [];
    for (const m of String(title || '').matchAll(FEAT_PATTERN)) names.push(m[1]);
    return names;
}

const yearOf = (date) => {
    const match = String(date || '').match(/\b(1[89]\d{2}|20\d{2})\b/);
    return match ? match[1] : '';
};

function entry(kind, item, fields, extra = {}) {
    const merged = [fields.title, fields.album, fields.version].filter(Boolean).flatMap((f) => f.tokens);
    return { kind, item, fields, all: [...merged, ...(fields.artistTokens || [])], ...extra };
}

function artistField(names) {
    const fields = splitArtistNames(names).map(makeField);
    return {
        norm: fields.map((f) => f.norm).join(' '),
        list: fields,
        tokens: fields.flatMap((f) => f.tokens),
    };
}

function scoreArtistField(field, q) {
    if (!field?.list?.length) return 0;
    let best = 0;
    for (const f of field.list) best = Math.max(best, scoreField(f, q));
    return best;
}

export function buildSearchIndex({ tracks = [], albums = [], artists = [], playlists = [] } = {}) {
    const trackEntries = tracks.map((track) => {
        const names = [
            ...(track.artists || []).map((a) => a?.name),
            track.artist?.name,
            ...featuredInTitle(track.title),
        ];
        const artist = artistField(names);
        const fields = {
            title: makeField(String(track.title || '').replace(FEAT_PATTERN, '')),
            artist,
            album: makeField(track.album?.title),
            version: makeField(track.versionLabel || track.version),
            year: yearOf(track.album?.releaseDate || track.releaseDate),
            artistTokens: artist.tokens,
        };
        return entry('track', track, fields, { lyrics: makeLyrics(track.lyrics) });
    });
    const albumEntries = albums.map((album) => {
        const artist = artistField([album.artist?.name, ...(album.artists || []).map((a) => a?.name)]);
        return entry('album', album, {
            title: makeField(album.title),
            artist,
            year: yearOf(album.releaseDate),
            artistTokens: artist.tokens,
        });
    });
    const artistEntries = artists.map((artist) => {
        const field = artistField([artist.name]);
        return entry('artist', artist, { artist: field, artistTokens: field.tokens });
    });
    const playlistEntries = playlists.map((playlist) =>
        entry('playlist', playlist, { title: makeField(playlist.title || playlist.name) })
    );
    return { tracks: trackEntries, albums: albumEntries, artists: artistEntries, playlists: playlistEntries };
}

function passesFilters(e, parsed) {
    const { fields } = e;
    for (const q of parsed.filters.artist) if (scoreArtistField(fields.artist, q) < 0.5) return false;
    for (const q of parsed.filters.album) {
        const target = e.kind === 'track' ? fields.album : e.kind === 'album' ? fields.title : null;
        if (scoreField(target, q) < 0.5) return false;
    }
    for (const q of parsed.filters.title) {
        if (e.kind !== 'track' || scoreField(fields.title, q) < 0.5) return false;
    }
    for (const q of parsed.negated.artist) if (scoreArtistField(fields.artist, q) >= 0.5) return false;
    for (const q of parsed.negated.album) {
        const target = e.kind === 'track' ? fields.album : e.kind === 'album' ? fields.title : null;
        if (scoreField(target, q) >= 0.5) return false;
    }
    for (const q of parsed.negated.title) if (e.kind === 'track' && scoreField(fields.title, q) >= 0.5) return false;
    for (const year of parsed.years) if (!fields.year || !String(fields.year).startsWith(year)) return false;
    for (const q of parsed.lyrics) if (!findLyric(e.lyrics, q)) return false;
    for (const q of parsed.phrases) {
        const haystack = [fields.title?.norm, fields.artist?.norm, fields.album?.norm, e.lyrics?.joined]
            .filter(Boolean)
            .join(' ');
        if (!` ${haystack} `.includes(` ${q.norm} `)) return false;
    }
    if (parsed.excludes.length) {
        const words = new Set(
            [fields.title, fields.album, fields.version, fields.artist].filter(Boolean).flatMap((f) => f.tokens)
        );
        if (parsed.excludes.some((x) => x.split(' ').every((t) => words.has(t)))) return false;
    }
    return true;
}

function scoreEntry(e, parsed) {
    const q = parsed.text;
    if (!q.norm) {
        if (!parsed.hasFilters && !parsed.phrases.length) return null;
        const lyric = parsed.lyrics.length ? findLyric(e.lyrics, parsed.lyrics[0]) : null;
        return { score: 60, field: lyric ? 'lyrics' : 'filter', lyric: lyric?.line || null };
    }
    const { fields } = e;
    let best = 0;
    let field = null;
    const consider = (name, value) => {
        const weighted = value * WEIGHTS[name];
        if (weighted > best) {
            best = weighted;
            field = name;
        }
    };
    if (fields.title) consider('title', scoreField(fields.title, q));
    if (fields.artist) consider('artist', scoreArtistField(fields.artist, q));
    if (fields.album) consider('album', scoreField(fields.album, q));
    if (fields.version) consider('version', scoreField(fields.version, q));
    if (fields.year && q.tokens.length === 1 && q.norm === fields.year) consider('year', 1);

    // "blinding lights weeknd": words spread over title, artist and album.
    if (q.tokens.length >= 2 && e.all.length) {
        const cross = coverage(q.tokens, e.all) * 0.8;
        if (cross > best) {
            best = cross;
            field = 'mixed';
        }
    }

    let lyric = null;
    if (best < 0.7 && e.lyrics) {
        lyric = findLyric(e.lyrics, q);
        if (lyric) consider('lyrics', Math.min(1, 0.78 + lyric.words * 0.04));
        if (field !== 'lyrics') lyric = null;
    }
    const score = best * 100;
    if (score < MIN_SCORE) return null;
    return { score, field, lyric: lyric?.line || null };
}

function rank(entries, parsed, popularity, limit) {
    let max = 1;
    for (const e of entries) max = Math.max(max, popularity(e.item));
    const scale = Math.log1p(max);
    const results = [];
    for (const e of entries) {
        if (!passesFilters(e, parsed)) continue;
        const hit = scoreEntry(e, parsed);
        if (!hit) continue;
        const streams = popularity(e.item);
        const boost = streams > 0 ? (Math.log1p(streams) / scale) * POPULARITY_BOOST : 0;
        results.push({ item: e.item, score: hit.score + boost, relevance: hit.score, streams, ...hit });
    }
    results.sort((a, b) => b.score - a.score || b.streams - a.streams);
    return results.slice(0, limit);
}

/**
 * @param {ReturnType<typeof buildSearchIndex>} index
 * @param {string} query
 * @param {{ streams?: (id: string) => number, limits?: Partial<Record<'tracks'|'albums'|'artists'|'playlists', number>> }} options
 */
export function searchLibrary(index, query, { streams = () => 0, limits = {} } = {}) {
    const parsed = parseSearchQuery(query);
    const trackStreams = (track) => streams(track.id) || 0;
    const groupStreams = new Map();
    const sumFor = (key, track) => groupStreams.set(key, (groupStreams.get(key) || 0) + trackStreams(track));
    for (const { item } of index.tracks) {
        if (item.album?.id) sumFor(`album:${item.album.id}`, item);
        for (const artist of item.artists?.length ? item.artists : [item.artist]) {
            if (artist?.id) sumFor(`artist:${artist.id}`, item);
        }
    }
    const lyricOnly = parsed.lyrics.length > 0 || parsed.filters.title.length > 0;
    return {
        parsed,
        tracks: rank(index.tracks, parsed, trackStreams, limits.tracks ?? 50),
        albums: lyricOnly
            ? []
            : rank(index.albums, parsed, (a) => groupStreams.get(`album:${a.id}`) || 0, limits.albums ?? 24),
        artists:
            lyricOnly || parsed.filters.album.length || parsed.years.length
                ? []
                : rank(index.artists, parsed, (a) => groupStreams.get(`artist:${a.id}`) || 0, limits.artists ?? 24),
        playlists: parsed.hasFilters ? [] : rank(index.playlists, parsed, () => 0, limits.playlists ?? 24),
    };
}

/** Most streamed tracks of the instance, one per version group. */
export function popularTracks(index, streams, limit = 5) {
    const seen = new Set();
    return index.tracks
        .map(({ item }) => ({ item, streams: streams(item.id) || 0 }))
        .filter((r) => r.streams > 0)
        .sort((a, b) => b.streams - a.streams)
        .filter(({ item }) => {
            const key = item.versionGroupId || item.id;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .slice(0, limit);
}

/** [start, end) ranges of `text` whose words begin with a query word, ignoring case and accents. */
export function highlightRanges(text, query) {
    const queryNorm = normalizeSearchText(query);
    // The whole query glued together also counts, so "pink pantheress" lights up all of "PinkPantheress".
    const tokens = [...tokensOf(queryNorm), compactOf(queryNorm)].filter((t) => t.length > 0);
    if (!tokens.length || !text) return [];
    const ranges = [];
    for (const m of String(text).matchAll(/[\p{L}\p{N}’']+/gu)) {
        const word = m[0];
        const norm = normalizeSearchText(word).replace(/ /g, '');
        const token = tokens.filter((t) => norm.startsWith(t)).sort((a, b) => b.length - a.length)[0];
        if (!token) continue;
        let end = 0;
        while (end < word.length && normalizeSearchText(word.slice(0, end)).replace(/ /g, '').length < token.length)
            end++;
        ranges.push([m.index, m.index + end]);
    }
    return ranges;
}
