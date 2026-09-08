/* eslint-disable no-undef */
routerAdd(
    'POST',
    '/api/monochrome/playlists',
    (e) => {
        const service = require(`${__hooks}/playlist-service.cjs`);
        return e.json(200, service.create(e));
    },
    $apis.requireAuth('users'),
    $apis.bodyLimit(18000000)
);

routerAdd(
    'POST',
    '/api/monochrome/playlists/{id}/operations',
    (e) => {
        const service = require(`${__hooks}/playlist-service.cjs`);
        return e.json(200, service.mutate(e));
    },
    $apis.requireAuth('users'),
    $apis.bodyLimit(18000000)
);
