import { afterEach, describe, expect, test } from 'vitest';
import {
    isAuthRoute,
    isClientAuthRequired,
    isLocalDevEnvironment,
    shouldUseSelfHostedServices,
    shouldRedirectForAuth,
} from '../auth-gate.js';

afterEach(() => {
    delete window.__MONOCHROME_AUTH_REQUIRED__;
    localStorage.removeItem('monochrome-auth-required');
});

describe('auth-gate', () => {
    test('keeps mandatory auth disabled unless explicitly configured', () => {
        expect(isClientAuthRequired()).toBe(false);

        window.__MONOCHROME_AUTH_REQUIRED__ = true;
        expect(isClientAuthRequired()).toBe(true);

        window.__MONOCHROME_AUTH_REQUIRED__ = false;
        localStorage.setItem('monochrome-auth-required', 'true');
        expect(isClientAuthRequired()).toBe(false);
    });

    test('recognizes only local development hosts for dev auth fallback', () => {
        expect(isLocalDevEnvironment('localhost')).toBe(true);
        expect(isLocalDevEnvironment('127.0.0.1')).toBe(true);
        expect(isLocalDevEnvironment('::1')).toBe(true);
        expect(isLocalDevEnvironment('monochrome.tf')).toBe(false);
    });

    test('allows auth routes while redirecting signed-out app routes when required', () => {
        window.__MONOCHROME_AUTH_REQUIRED__ = true;

        expect(isAuthRoute('/account')).toBe(true);
        expect(isAuthRoute('/reset-password')).toBe(true);
        expect(shouldRedirectForAuth({ user: null, pathname: '/search/test' })).toBe(true);
        expect(shouldRedirectForAuth({ user: { id: 'user-1' }, pathname: '/search/test' })).toBe(false);
        expect(shouldRedirectForAuth({ user: null, pathname: '/account' })).toBe(false);
    });

    test('uses self-hosted services only when mandatory self-hosted auth is enabled', () => {
        expect(shouldUseSelfHostedServices()).toBe(false);

        window.__MONOCHROME_AUTH_REQUIRED__ = true;
        expect(shouldUseSelfHostedServices()).toBe(true);

        window.__MONOCHROME_AUTH_REQUIRED__ = false;
        localStorage.setItem('monochrome-auth-required', 'true');
        expect(shouldUseSelfHostedServices()).toBe(false);
    });
});
