// Pure state helpers for the social surface. Keeping these paths free of DOM
// and PocketBase dependencies makes the realtime edge cases cheap to test.

export function isMutualFriend(following, followers, userId) {
    return Boolean(userId && following?.has(userId) && followers?.has(userId));
}

export function reconcileSentMessage(messages, tempId, record) {
    const list = Array.isArray(messages) ? messages : [];
    const tempIndex = list.findIndex((message) => message.id === tempId);
    const recordIndex = list.findIndex((message) => message.id === record?.id);

    if (recordIndex >= 0) {
        list[recordIndex] = record;
        if (tempIndex >= 0 && tempIndex !== recordIndex) list.splice(tempIndex, 1);
    } else if (tempIndex >= 0) {
        list.splice(tempIndex, 1, record);
    } else if (record) {
        list.push(record);
    }

    list.sort((a, b) => Date.parse(a.created || 0) - Date.parse(b.created || 0));
    return list;
}

const BOOTH_FADE_MS = 30 * 86_400_000;

/**
 * How far back a member sits in the booth: 0 is playing now, 1 is an empty
 * platter at the edge (nothing heard in 30 days, or ever).
 */
export function boothDepth(member, now = Date.now()) {
    if (member.playing) return 0;
    if (!member.track) return 1;
    if (member.online) return 0.18;
    const age = now - (member.lastSeen || 0);
    if (!(age < BOOTH_FADE_MS)) return 1;
    const hours = Math.max(0, age) / 3_600_000;
    return Math.min(0.92, 0.3 + (Math.log1p(hours) / Math.log1p(BOOTH_FADE_MS / 3_600_000)) * 0.62);
}

/** Booth order: live, then online, then most recent listen, then the silent edge. */
export function rankBooth(members, now = Date.now()) {
    return members
        .map((member) => ({ ...member, depth: boothDepth(member, now) }))
        .sort((a, b) => a.depth - b.depth || (b.lastSeen || 0) - (a.lastSeen || 0));
}

export function splitFeedPosts(posts, following) {
    const circle = [];
    const instance = [];
    for (const post of posts || []) {
        if (following?.has(post.author)) circle.push(post);
        else instance.push(post);
    }
    return { circle, instance };
}
