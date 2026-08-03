/* Monochrome boundary for Spicy Lyrics' optional developer logger. */

export default class Logger {
    public readonly prefix: string;
    public isEnabled = false;

    constructor(prefix?: string) {
        this.prefix = `[Spicy Lyrics]${prefix ? ` (${prefix})` : ''}`;
    }

    info(...args: unknown[]): void {
        if (this.isEnabled) console.info(this.prefix, ...args);
    }

    debug(...args: unknown[]): void {
        if (this.isEnabled) console.debug(this.prefix, ...args);
    }

    warn(...args: unknown[]): void {
        console.warn(this.prefix, ...args);
    }

    error(...args: unknown[]): void {
        console.error(this.prefix, ...args);
    }
}
