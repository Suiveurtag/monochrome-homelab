/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
// Debug only: the switch is saved on app_config from the debug console, and the hook does the rest server-side.
onRecordAfterUpdateSuccess((e) => {
    require(`${__hooks}/debug-fake-users.cjs`).onConfigSaved(e.app, e.record);
    e.next();
}, 'app_config');

cronAdd('debug_fake_users', '* * * * *', () => {
    require(`${__hooks}/debug-fake-users.cjs`).tick($app);
});
