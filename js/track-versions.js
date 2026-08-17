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
    return track?.image || track?.cover || track?.album?.cover || '/assets/appicon.png';
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

export function buildTrackVersionUpdates(currentTrack, allTracks, selectedIds, currentFields = {}) {
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

    const existingGroupId = [...memberIds].map((id) => trackMap.get(id)?.versionGroupId).find(Boolean);
    const versionGroupId = memberIds.size > 1 ? String(existingGroupId || `versions:${currentId}`) : null;
    const memberIdList = [...memberIds];

    return [...affectedIds]
        .map((id) => trackMap.get(id))
        .filter(Boolean)
        .map((track) => {
            const id = String(track.id);
            const isMember = memberIds.has(id) && memberIds.size > 1;
            return {
                track,
                updated: {
                    ...track,
                    ...(id === currentId ? currentFields : {}),
                    versionGroupId: isMember ? versionGroupId : null,
                    alternativeVersionIds: isMember ? memberIdList.filter((memberId) => memberId !== id) : [],
                },
            };
        });
}
