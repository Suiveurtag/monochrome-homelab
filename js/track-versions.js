const VERSION_LABEL_PATTERN =
    /\b(instrumental|sped[ -]?up|slowed(?:[ -]?down)?|demo|single(?: version)?|radio edit|acoustic|live|remix|original)\b/i;

export function normalizeAlternativeVersionIds(ids, currentId = null) {
    const current = currentId == null ? null : String(currentId);
    return [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => id && id !== current))];
}

export function getTrackVersionLabel(track, { fallback = 'Version' } = {}) {
    const explicit = String(track?.versionLabel || track?.version || '').trim();
    if (explicit) return explicit;
    const title = String(track?.title || '');
    const match = title.match(VERSION_LABEL_PATTERN);
    if (!match) return fallback;
    return match[1].replace(/[- ]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getTrackVersionArtwork(track) {
    return track?.image || track?.cover || track?.serverCoverUrl || track?.album?.cover || '/assets/appicon.png';
}

export function getTrackVersionGroup(track, allTracks = []) {
    if (!track) return [];
    const currentId = String(track.id);
    const groupId = String(track.versionGroupId || '');
    const linkedIds = new Set(normalizeAlternativeVersionIds(track.alternativeVersionIds, currentId));
    const members = allTracks.filter((candidate) => {
        const candidateId = String(candidate?.id ?? '');
        if (!candidateId) return false;
        if (candidateId === currentId || linkedIds.has(candidateId)) return true;
        if (groupId && String(candidate.versionGroupId || '') === groupId) return true;
        return normalizeAlternativeVersionIds(candidate.alternativeVersionIds, candidateId).includes(currentId);
    });
    if (!members.some((candidate) => String(candidate.id) === currentId)) members.unshift(track);
    return members.sort((a, b) => {
        if (String(a.id) === currentId) return -1;
        if (String(b.id) === currentId) return 1;
        return getTrackVersionLabel(a).localeCompare(getTrackVersionLabel(b));
    });
}

export function getTrackVersionMainId(track, allTracks = []) {
    if (!track) return null;
    const members = getTrackVersionGroup(track, allTracks);
    const memberIds = new Set(members.map((member) => String(member.id)));
    const declared = members.map((member) => String(member.versionMainTrackId || '')).find((id) => memberIds.has(id));
    if (declared) return declared;

    const legacyGroupMain = String(track.versionGroupId || '').replace(/^versions:/, '');
    if (legacyGroupMain && memberIds.has(legacyGroupMain)) return legacyGroupMain;
    return String(members.find((member) => !member.hideFromArtistPage)?.id || track.id);
}

export function getTrackVersionMainTrack(track, allTracks = []) {
    if (!track) return null;
    const members = getTrackVersionGroup(track, allTracks);
    const mainId = getTrackVersionMainId(track, members);
    return members.find((member) => String(member.id) === mainId) || track;
}

export function getTrackDisplayAlbum(track, allTracks = []) {
    if (!track) return null;
    if (track.hideFromArtistPage && track.versionMainAlbum) return track.versionMainAlbum;
    if (track.album) return track.album;
    if (track.versionMainAlbum) return track.versionMainAlbum;
    const mainTrack = getTrackVersionMainTrack(track, allTracks);
    return mainTrack?.album || mainTrack?.versionMainAlbum || null;
}

export function getTrackPlayerArtwork(track, allTracks = []) {
    if (
        track?.versionMainTrackId &&
        String(track.versionMainTrackId) !== String(track.id) &&
        track.versionMainAlbum?.cover
    ) {
        return track.versionMainAlbum.cover;
    }
    const mainTrack = getTrackVersionMainTrack(track, allTracks);
    return getTrackVersionArtwork(mainTrack || track);
}

export function hydrateTrackVersionDisplayMetadata(tracks = []) {
    const source = Array.isArray(tracks) ? tracks : [];
    return source.map((track) => {
        const mainTrack = getTrackVersionMainTrack(track, source);
        return {
            ...track,
            versionMainTrackId: track.versionGroupId ? String(mainTrack?.id || track.id) : null,
            versionMainAlbum: mainTrack?.album || mainTrack?.versionMainAlbum || null,
        };
    });
}

export function buildTrackVersionUpdates(currentTrack, allTracks, selectedIds, currentFields = {}, mainTrackId = null) {
    const currentId = String(currentTrack.id);
    const trackMap = new Map(allTracks.map((track) => [String(track.id), track]));
    trackMap.set(currentId, currentTrack);

    const memberIds = new Set([currentId, ...normalizeAlternativeVersionIds(selectedIds, currentId)]);
    const affectedIds = new Set(memberIds);
    const affectedGroupIds = new Set();

    for (const id of memberIds) {
        const member = trackMap.get(id);
        if (!member) continue;
        if (member.versionGroupId) affectedGroupIds.add(String(member.versionGroupId));
        for (const linkedId of normalizeAlternativeVersionIds(member.alternativeVersionIds, id)) {
            affectedIds.add(linkedId);
        }
    }
    if (currentTrack.versionGroupId) affectedGroupIds.add(String(currentTrack.versionGroupId));

    for (const track of trackMap.values()) {
        const id = String(track.id);
        if (affectedGroupIds.has(String(track.versionGroupId || ''))) affectedIds.add(id);
        if (
            normalizeAlternativeVersionIds(track.alternativeVersionIds, id).some((linkedId) => memberIds.has(linkedId))
        ) {
            affectedIds.add(id);
        }
    }

    const requestedMainId = String(mainTrackId || currentTrack.versionMainTrackId || currentId);
    const resolvedMainId = memberIds.has(requestedMainId) ? requestedMainId : currentId;
    const existingGroupId = [...memberIds].map((id) => trackMap.get(id)?.versionGroupId).find(Boolean);
    const versionGroupId = memberIds.size > 1 ? String(existingGroupId || `versions:${resolvedMainId}`) : null;
    const memberIdList = [...memberIds];
    const requestedMainTrack =
        resolvedMainId === currentId ? { ...currentTrack, ...currentFields } : trackMap.get(resolvedMainId);
    const mainAlbum =
        requestedMainTrack?.album ||
        requestedMainTrack?.versionMainAlbum ||
        currentTrack.album ||
        currentTrack.versionMainAlbum ||
        null;

    return [...affectedIds]
        .map((id) => trackMap.get(id))
        .filter(Boolean)
        .map((track) => {
            const id = String(track.id);
            const isMember = memberIds.has(id) && memberIds.size > 1;
            const merged = {
                ...track,
                ...(id === currentId ? currentFields : {}),
                versionGroupId: isMember ? versionGroupId : null,
                versionMainTrackId: isMember ? resolvedMainId : null,
                versionMainAlbum: isMember ? mainAlbum : null,
                alternativeVersionIds: isMember ? memberIdList.filter((memberId) => memberId !== id) : [],
            };
            const isMain = isMember && id === resolvedMainId;
            const hiddenAlternative = isMember && !isMain && Boolean(merged.hideFromArtistPage);
            return {
                track,
                updated: {
                    ...merged,
                    cover: merged.cover || merged.serverCoverUrl || merged.album?.cover || null,
                    album: hiddenAlternative ? null : merged.album || merged.versionMainAlbum || null,
                    hideFromArtistPage: isMain || !isMember ? false : Boolean(merged.hideFromArtistPage),
                },
            };
        });
}
