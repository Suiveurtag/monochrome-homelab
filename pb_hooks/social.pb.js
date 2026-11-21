/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
// Social routes and record hooks. Logic lives in social-service.cjs.
// Handlers run in isolated runtimes, so each one requires the service itself.

routerAdd('GET', '/api/monochrome/social/home', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).home(e)), $apis.requireAuth('users'));
routerAdd('POST', '/api/monochrome/social/presence', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).updatePresence(e)), $apis.requireAuth('users'), $apis.bodyLimit(16000));
routerAdd('POST', '/api/monochrome/social/settings', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).updateSettings(e)), $apis.requireAuth('users'), $apis.bodyLimit(2000));
routerAdd('POST', '/api/monochrome/social/reactions', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).react(e)), $apis.requireAuth('users'), $apis.bodyLimit(8000));
routerAdd('POST', '/api/monochrome/social/notes', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).postNote(e)), $apis.requireAuth('users'), $apis.bodyLimit(8000));
routerAdd('DELETE', '/api/monochrome/social/notes', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).deleteNote(e)), $apis.requireAuth('users'));
routerAdd('POST', '/api/monochrome/social/polls', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).createPoll(e)), $apis.requireAuth('users'), $apis.bodyLimit(16000));
routerAdd('POST', '/api/monochrome/social/polls/{id}/vote', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).votePoll(e)), $apis.requireAuth('users'), $apis.bodyLimit(1000));
routerAdd('POST', '/api/monochrome/social/polls/{id}/close', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).closePoll(e)), $apis.requireAuth('users'));
routerAdd('DELETE', '/api/monochrome/social/polls/{id}', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).deletePoll(e)), $apis.requireAuth('users'));
routerAdd('GET', '/api/monochrome/social/member/{username}', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).member(e)), $apis.requireAuth('users'));
routerAdd('POST', '/api/monochrome/social/messages/dm', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).openDm(e)), $apis.requireAuth('users'), $apis.bodyLimit(1000));

onRecordCreateRequest((e) => {
    require(`${__hooks}/social-service.cjs`).guardMessage(e);
    e.next();
}, 'social_messages');

onRecordAfterCreateSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).touchConversation(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'social_messages');

onRecordAfterCreateSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).onFollowChange(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'social_follows');

onRecordAfterDeleteSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).onFollowChange(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'social_follows');

onRecordAfterCreateSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).onBlock(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'social_blocks');

onRecordAfterDeleteSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).onUnblock(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'social_blocks');

onRecordAfterCreateSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).syncProfile(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'DB_users');

onRecordAfterUpdateSuccess((e) => {
    e.next();
    try {
        require(`${__hooks}/social-service.cjs`).syncProfile(e.app, e.record);
    } catch (error) {
        console.warn('[social] hook skipped:', error);
    }
}, 'DB_users');

cronAdd('social_sweep', '*/10 * * * *', () => {
    require(`${__hooks}/social-service.cjs`).sweep($app);
});

routerAdd('GET', '/api/monochrome/social/online', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).onlineCount(e)), $apis.requireAuth('users'));
routerAdd('GET', '/api/monochrome/social/presence/{id}', (e) => e.json(200, require(`${__hooks}/social-service.cjs`).presenceOf(e)), $apis.requireAuth('users'));

// DB_users feeds the public profile mirror: only its owner may create or change it.
onRecordCreateRequest((e) => {
    require(`${__hooks}/social-service.cjs`).guardAccountRecord(e);
    e.next();
}, 'DB_users');

onRecordUpdateRequest((e) => {
    require(`${__hooks}/social-service.cjs`).guardAccountRecord(e);
    e.next();
}, 'DB_users');
