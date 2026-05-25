export function isLocalDevEnvironment(hostname = window.location.hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function isClientAuthRequired() {
    if (typeof window === 'undefined') return false;
    if (window.__MONOCHROME_AUTH_REQUIRED__ === true) return true;
    if (window.__MONOCHROME_AUTH_REQUIRED__ === false) return false;
    return localStorage.getItem('monochrome-auth-required') === 'true';
}

export function isAuthRoute(pathname = window.location.pathname) {
    const path = pathname.replace(/\/+$/, '') || '/';
    return path === '/account' || path === '/login' || path === '/login.html' || path === '/reset-password';
}

export function shouldRedirectForAuth({ user, pathname = window.location.pathname } = {}) {
    return isClientAuthRequired() && !user && !isAuthRoute(pathname);
}
