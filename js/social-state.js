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

export function splitFeedPosts(posts, following) {
    const circle = [];
    const instance = [];
    for (const post of posts || []) {
        if (following?.has(post.author)) circle.push(post);
        else instance.push(post);
    }
    return { circle, instance };
}
