export type TrackSourceKind = 'external' | 'server-upload' | 'server-local' | 'browser-local' | 'podcast' | 'tracker';
export type ExternalProvider = 'tidal' | 'qobuz' | 'hifi' | 'unknown';
export type TrackKey = string;

export interface TrackSourceRef {
    kind: TrackSourceKind;
    provider?: ExternalProvider;
    sourceId: string;
}

export interface HybridTrack {
    trackKey: TrackKey;
    source: TrackSourceRef;
    id: string | number;
    type?: 'track' | 'video';
    title: string | null;
    duration?: number | null;
    explicit?: boolean;
    artists?: Array<{ id?: string | number; name: string | null }>;
    artist?: { id?: string | number; name: string | null } | null;
    album?: {
        id?: string | number;
        title?: string | null;
        cover?: string | null;
        releaseDate?: string | null;
        vibrantColor?: string | null;
        artist?: { id?: string | number; name: string | null } | null;
        numberOfTracks?: number | null;
        mediaMetadata?: { tags?: string[] } | null;
    } | null;
    isrc?: string | null;
    audioQuality?: string | null;
    mediaMetadata?: { tags?: string[] } | null;
    playback?: {
        mode: 'api-stream' | 'remote-url' | 'browser-file' | 'podcast' | 'tracker';
        url?: string;
        mimeType?: string;
    };
    addedAt?: number | null;
    updatedAt?: number | null;
}

export interface TrackMetadataOverride {
    trackKey: TrackKey;
    fields: Partial<Pick<HybridTrack, 'title' | 'artists' | 'artist' | 'album' | 'explicit' | 'isrc' | 'duration'>>;
    updatedAt: number;
}

export interface PlaylistTrackEntry {
    trackKey: TrackKey;
    source: TrackSourceRef;
    snapshot: HybridTrack;
    addedAt: number;
}

type TrackLike = Partial<HybridTrack> & {
    id?: string | number | null;
    uuid?: string | number | null;
    trackId?: string | number | null;
    source?: Partial<TrackSourceRef> | null;
    isLocal?: boolean;
    isPodcast?: boolean;
    isTracker?: boolean;
    remoteUrl?: string | null;
    audioUrl?: string | null;
    enclosureUrl?: string | null;
    enclosureType?: string | null;
    file?: File | Blob | null;
};

const SOURCE_KINDS = new Set<TrackSourceKind>([
    'external',
    'server-upload',
    'server-local',
    'browser-local',
    'podcast',
    'tracker',
]);
const EXTERNAL_PROVIDERS = new Set<ExternalProvider>(['tidal', 'qobuz', 'hifi', 'unknown']);

function isTrackSourceKind(value: unknown): value is TrackSourceKind {
    return typeof value === 'string' && SOURCE_KINDS.has(value);
}

function normalizeProvider(value: unknown): ExternalProvider | undefined {
    if (typeof value !== 'string') return undefined;
    const provider = value.toLowerCase() as ExternalProvider;
    return EXTERNAL_PROVIDERS.has(provider) ? provider : 'unknown';
}

function stripKnownProviderPrefix(id: string): { provider?: ExternalProvider; sourceId: string } {
    if (id.startsWith('t:')) return { provider: 'tidal', sourceId: id.slice(2) };
    if (id.startsWith('q:')) return { provider: 'qobuz', sourceId: id.slice(2) };
    if (id.startsWith('h:')) return { provider: 'hifi', sourceId: id.slice(2) };
    return { sourceId: id };
}

function normalizeSourceRef(track: TrackLike): TrackSourceRef {
    if (isTrackSourceKind(track.source?.kind) && track.source.sourceId != null) {
        const source: TrackSourceRef = {
            kind: track.source.kind,
            sourceId: String(track.source.sourceId),
        };
        const provider = normalizeProvider(track.source.provider);
        if (provider) source.provider = provider;
        return source;
    }

    const rawId = track.id ?? track.trackId ?? track.uuid ?? '';
    const id = String(rawId);
    const prefixed = stripKnownProviderPrefix(id);

    if (track.isTracker || id.startsWith('tracker-')) {
        return { kind: 'tracker', sourceId: prefixed.sourceId || id };
    }

    if (track.isPodcast || id.startsWith('podcast_') || track.enclosureUrl) {
        return { kind: 'podcast', sourceId: prefixed.sourceId || id };
    }

    if (track.isLocal) {
        return { kind: 'browser-local', sourceId: prefixed.sourceId || id };
    }

    const provider = prefixed.provider || normalizeProvider((track as { provider?: unknown }).provider) || 'tidal';
    return { kind: 'external', provider, sourceId: prefixed.sourceId || id };
}

export function makeTrackKey(source: TrackSourceRef): TrackKey {
    const provider = source.provider || 'none';
    return `v1:${source.kind}:${provider}:${encodeURIComponent(source.sourceId)}`;
}

export function getTrackKey(track: TrackLike | string | number | null | undefined): TrackKey | null {
    if (track == null) return null;
    if (typeof track === 'string' || typeof track === 'number') {
        const prefixed = stripKnownProviderPrefix(String(track));
        return makeTrackKey({
            kind: 'external',
            provider: prefixed.provider || 'tidal',
            sourceId: prefixed.sourceId,
        });
    }
    if (track.trackKey) return track.trackKey;
    return makeTrackKey(normalizeSourceRef(track));
}

export function withTrackIdentity<T extends TrackLike>(track: T): T & { trackKey: TrackKey; source: TrackSourceRef } {
    const source = normalizeSourceRef(track);
    const trackKey = track.trackKey || makeTrackKey(source);
    return { ...track, source, trackKey };
}

function minifyArtist(artist: unknown): { id?: string | number; name: string | null } | null {
    if (!artist || typeof artist !== 'object') return null;
    const value = artist as { id?: string | number; name?: string | null };
    return { id: value.id, name: value.name || null };
}

function minifyArtists(artists: unknown): Array<{ id?: string | number; name: string | null }> {
    return Array.isArray(artists)
        ? artists
              .map(minifyArtist)
              .filter((artist): artist is { id?: string | number; name: string | null } => artist !== null)
        : [];
}

export function minifyHybridTrack(track: TrackLike): HybridTrack {
    const identified = withTrackIdentity(track);
    const artist = minifyArtist(identified.artist) || minifyArtists(identified.artists)[0] || null;
    const artists = minifyArtists(identified.artists).length > 0 ? minifyArtists(identified.artists) : artist ? [artist] : [];

    const playback =
        identified.playback ||
        (identified.isLocal
            ? { mode: 'browser-file' as const }
            : identified.isPodcast
              ? { mode: 'podcast' as const, url: identified.enclosureUrl || undefined, mimeType: identified.enclosureType || undefined }
              : identified.isTracker
                ? { mode: 'tracker' as const, url: identified.remoteUrl || identified.audioUrl || undefined }
                : identified.remoteUrl || identified.audioUrl
                  ? { mode: 'remote-url' as const, url: identified.remoteUrl || identified.audioUrl || undefined }
                  : { mode: 'api-stream' as const });

    return {
        id: identified.id ?? identified.source.sourceId,
        trackKey: identified.trackKey,
        source: identified.source,
        type: identified.type === 'video' ? 'video' : 'track',
        title: identified.title || null,
        duration: identified.duration || null,
        explicit: identified.explicit || false,
        artist,
        artists,
        album: identified.album
            ? {
                  id: identified.album.id,
                  title: identified.album.title || null,
                  cover: identified.album.cover || null,
                  releaseDate: identified.album.releaseDate || null,
                  vibrantColor: identified.album.vibrantColor || null,
                  artist: minifyArtist(identified.album.artist),
                  numberOfTracks: identified.album.numberOfTracks || null,
                  mediaMetadata: identified.album.mediaMetadata ? { tags: identified.album.mediaMetadata.tags || [] } : null,
              }
            : null,
        isrc: identified.isrc || null,
        audioQuality: identified.audioQuality || null,
        mediaMetadata: identified.mediaMetadata ? { tags: identified.mediaMetadata.tags || [] } : null,
        playback,
        addedAt: identified.addedAt || null,
        updatedAt: identified.updatedAt || null,
        copyright: (identified as { copyright?: string | null }).copyright || null,
        trackNumber: (identified as { trackNumber?: number | null }).trackNumber || null,
        streamStartDate: (identified as { streamStartDate?: string | null }).streamStartDate || null,
        version: (identified as { version?: string | null }).version || null,
        mixes: (identified as { mixes?: Record<string, string> | null }).mixes || null,
        isLocal: identified.isLocal || identified.source.kind === 'browser-local' || undefined,
        isTracker: identified.isTracker || identified.source.kind === 'tracker' || undefined,
        trackerInfo: (identified as { trackerInfo?: unknown }).trackerInfo || null,
        isPodcast: identified.isPodcast || identified.source.kind === 'podcast' || undefined,
        enclosureUrl: identified.enclosureUrl || null,
        enclosureType: identified.enclosureType || null,
        enclosureLength: (identified as { enclosureLength?: number | string | null }).enclosureLength || null,
        audioUrl: identified.audioUrl || identified.remoteUrl || null,
        remoteUrl: identified.remoteUrl || null,
    } as HybridTrack;
}

export function applyTrackOverrides<T extends TrackLike>(track: T, override?: TrackMetadataOverride | null): T & Partial<HybridTrack> {
    const identified = withTrackIdentity(track);
    if (!override || override.trackKey !== identified.trackKey) return identified;
    return {
        ...identified,
        ...override.fields,
        album: override.fields.album ? { ...identified.album, ...override.fields.album } : identified.album,
        updatedAt: override.updatedAt,
    };
}

export function isSameTrack(a: TrackLike | string | number | null | undefined, b: TrackLike | string | number | null | undefined): boolean {
    const aKey = getTrackKey(a);
    const bKey = getTrackKey(b);
    if (aKey && bKey) return aKey === bKey;

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        return a.id != null && b.id != null && a.id == b.id;
    }

    if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
        return String(a) === String(b);
    }

    return false;
}
