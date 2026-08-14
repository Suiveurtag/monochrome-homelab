import { getTrackArtists, getTrackTitle, getTrackYearDisplay } from './utils.js';
import { isVideoArtwork } from './animated-artwork.js';

const SOURCE_KINDS = new Set(['playlist', 'album', 'artist', 'liked', 'radio', 'single', 'unknown']);

export function normalizeSourceContext(value) {
    const context = value && typeof value === 'object' ? value : {};
    return {
        kind: SOURCE_KINDS.has(context.kind) ? context.kind : 'unknown',
        id: context.id == null ? null : String(context.id),
        label: String(context.label || 'Now playing'),
        href: context.href ? String(context.href) : null,
    };
}

function resolveArtwork(track, api) {
    const animatedSrc = track?.videoUrl || track?.videoCoverUrl || track?.album?.videoCoverUrl || null;
    const coverId = track?.image || track?.cover || track?.album?.cover || null;
    const staticSrc = !coverId
        ? '/assets/appicon.png'
        : /^(?:data:|blob:|https?:|\/)/i.test(String(coverId))
          ? String(coverId)
          : api?.getCoverUrl?.(coverId, '1280') || String(coverId);
    return {
        staticSrc,
        animatedSrc,
        heroSrc: animatedSrc || staticSrc,
        isVideo: Boolean(animatedSrc && (isVideoArtwork(animatedSrc) || /\.m3u8(?:$|[?#])/i.test(animatedSrc))),
    };
}

function resolveImage(value, api) {
    if (!value) return '';
    return /^(?:data:|blob:|https?:|\/)/i.test(String(value))
        ? String(value)
        : api?.getCoverUrl?.(value, '1280') || String(value);
}

function normalizeCredits(track) {
    const credits = [];
    const seen = new Set();
    const push = (name, role, artistId = null) => {
        const cleanName = String(name || '').trim();
        const cleanRole = String(role || 'Contributor').trim();
        if (!cleanName) return;
        const key = `${cleanName.toLocaleLowerCase()}|${cleanRole.toLocaleLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        credits.push({ name: cleanName, role: cleanRole, artistId: artistId == null ? null : String(artistId) });
    };

    for (const credit of Array.isArray(track?.credits) ? track.credits : []) {
        if (typeof credit === 'string') push(credit, 'Contributor');
        else push(credit?.name, credit?.role || credit?.type, credit?.artistId || credit?.id);
    }
    if (track?.credits && !Array.isArray(track.credits) && typeof track.credits === 'object') {
        for (const [role, values] of Object.entries(track.credits)) {
            for (const credit of Array.isArray(values) ? values : [values]) {
                if (typeof credit === 'string') push(credit, role);
                else push(credit?.name, credit?.role || credit?.type || role, credit?.artistId || credit?.id);
            }
        }
    }
    for (const artist of track?.artists?.length ? track.artists : track?.artist ? [track.artist] : []) {
        push(artist?.name, 'Main Artist', artist?.id);
    }
    for (const composer of Array.isArray(track?.composers) ? track.composers : []) {
        push(composer?.name || composer, 'Writer', composer?.id);
    }
    if (typeof track?.composer === 'string') {
        track.composer
            .split(/[,;]/)
            .map((name) => name.trim())
            .filter(Boolean)
            .forEach((name) => push(name, 'Writer'));
    }
    return credits;
}

function normalizeRelatedVideos(artist) {
    const source = artist?.relatedVideos || artist?.videos || [];
    return (Array.isArray(source) ? source : [])
        .map((video) => ({
            id: video?.id == null ? null : String(video.id),
            title: String(video?.title || '').trim(),
            subtitle: String(video?.subtitle || video?.artist || artist?.name || '').trim(),
            thumbnail: String(video?.thumbnail || video?.image || video?.cover || '').trim(),
            href: video?.href || video?.url || null,
            trackId: video?.trackId == null ? null : String(video.trackId),
        }))
        .filter((video) => video.title && (video.href || video.trackId));
}

function normalizeTourDates(artist) {
    return (Array.isArray(artist?.tourDates) ? artist.tourDates : [])
        .map((event, index) => ({
            id: String(event?.id || `${event?.date || 'date'}-${index}`),
            date: String(event?.date || '').trim(),
            time: String(event?.time || '').trim(),
            city: String(event?.city || '').trim(),
            venue: String(event?.venue || '').trim(),
            href: event?.href || event?.url || null,
        }))
        .filter((event) => event.date && (event.city || event.venue));
}

function normalizeBiography(value) {
    const raw = typeof value === 'string' ? value : value?.text || value?.summary || value?.biography || '';
    return String(raw)
        .replace(/<[^>]*>/g, ' ')
        .replace(/\[(?:\/?(?:b|i|url)|url=[^\]]+)\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function releaseYear(track) {
    const rendered = getTrackYearDisplay(track);
    if (typeof rendered === 'string') {
        const match = rendered.match(/\b(?:19|20)\d{2}\b/);
        if (match) return match[0];
    }
    const value = track?.releaseDate || track?.album?.releaseDate;
    const match = String(value || '').match(/\b(?:19|20)\d{2}\b/);
    return match?.[0] || '';
}

export async function buildNowPlayingPanelModel({ track, player, api, sourceContext, signal }) {
    if (!track) {
        return {
            empty: true,
            source: normalizeSourceContext(sourceContext),
            artwork: { staticSrc: '/assets/appicon.png', animatedSrc: null, heroSrc: '/assets/appicon.png', isVideo: false },
            title: 'Nothing playing',
            artists: [],
            artistLine: 'Choose something to play',
            releaseYear: '',
            explicit: false,
            artist: null,
            credits: [],
            relatedVideos: [],
            tourDates: [],
            nextTrack: null,
        };
    }

    const primaryArtist = track.artists?.[0] || track.artist || null;
    let artist = primaryArtist;
    if (primaryArtist?.id && typeof api?.getArtist === 'function') {
        try {
            artist = await api.getArtist(primaryArtist.id);
        } catch {
            artist = primaryArtist;
        }
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let biography = normalizeBiography(artist?.biography);
    if (
        biography === 'Local artist from your self-hosted library.' ||
        biography === 'Local artist from your self-hosted library'
    ) {
        biography = '';
    }
    if (!biography && primaryArtist?.id && typeof api?.getArtistBiography === 'function') {
        try {
            biography = normalizeBiography(await api.getArtistBiography(primaryArtist.id));
        } catch {
            biography = '';
        }
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const queue = player?.getCurrentQueue?.() || [];
    const currentIndex = Number(player?.currentQueueIndex ?? -1);
    const nextTrack = currentIndex >= 0 ? queue[currentIndex + 1] || null : null;
    const artists = (track.artists?.length ? track.artists : track.artist ? [track.artist] : []).map((item) => ({
        id: item?.id == null ? null : String(item.id),
        name: String(item?.name || 'Unknown artist'),
    }));

    return {
        empty: false,
        source: normalizeSourceContext(sourceContext),
        artwork: resolveArtwork(track, api),
        title: getTrackTitle(track),
        artists,
        artistLine: getTrackArtists(track, { fallback: 'Unknown artist' }),
        releaseYear: releaseYear(track),
        explicit: Boolean(track.explicit),
        artist: artist
            ? {
                  id: artist.id == null ? null : String(artist.id),
                  name: String(artist.name || primaryArtist?.name || 'Unknown artist'),
                  picture: resolveImage(artist.picture || primaryArtist?.picture || track.album?.cover, api),
                  banner: resolveImage(artist.banner || artist.picture || primaryArtist?.picture || track.album?.cover, api),
                  biography,
                  monthlyListeners: Number.isFinite(Number(artist.monthlyListeners))
                      ? Number(artist.monthlyListeners)
                      : null,
              }
            : null,
        credits: normalizeCredits(track),
        relatedVideos: normalizeRelatedVideos(artist),
        tourDates: normalizeTourDates(artist),
        nextTrack,
    };
}
