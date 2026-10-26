/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
routerAdd(
    'POST',
    '/api/monochrome/listening/sessions',
    (e) => {
        return e.json(200, require(`${__hooks}/listening-service.cjs`).saveSession(e));
    },
    $apis.requireAuth('users'),
    $apis.bodyLimit(240000)
);

routerAdd(
    'GET',
    '/api/monochrome/listening/stats',
    (e) => {
        e.response.header().set('Cache-Control', 'no-store');
        return e.json(200, require(`${__hooks}/listening-service.cjs`).stats(e));
    },
    $apis.requireAuth('users')
);

routerAdd(
    'POST',
    '/api/monochrome/listening/schedule-preview',
    (e) => {
        return e.json(200, require(`${__hooks}/listening-service.cjs`).preview(e));
    },
    $apis.requireAuth('users'),
    $apis.bodyLimit(4000)
);
