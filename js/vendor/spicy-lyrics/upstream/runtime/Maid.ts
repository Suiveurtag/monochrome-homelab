/*
 * Compatibility copy of Spicy Lyrics' Maid lifecycle helper.
 * Scheduler cleanup is intentionally omitted: the embedded lyrics runtime only
 * gives DOM observers and cleanup callbacks to this class.
 */

export type MaidItem =
    | MutationObserver
    | ResizeObserver
    | Element
    | (() => void)
    | { Destroy?: () => void };

function uuidv4(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = (Math.random() * 16) | 0;
        return (character === 'x' ? random : (random & 0x3) | 0x8).toString(16);
    });
}

function cleanItem(item: MaidItem): void {
    if (typeof item === 'function') {
        item();
    } else if (item instanceof MutationObserver || item instanceof ResizeObserver) {
        item.disconnect();
    } else if (item instanceof Element) {
        item.remove();
    } else if (typeof item === 'object' && item !== null && typeof item.Destroy === 'function') {
        item.Destroy();
    }
}

export class Maid {
    private _items = new Map<string, MaidItem>();
    private _destroyed = false;

    Give<T extends MaidItem>(item: T, key?: string): T {
        const itemKey = key ?? uuidv4();
        if (this._destroyed) {
            cleanItem(item);
            return item;
        }
        if (this._items.has(itemKey)) cleanItem(this._items.get(itemKey)!);
        this._items.set(itemKey, item);
        return item;
    }

    Destroy(): void {
        for (const item of this._items.values()) cleanItem(item);
        this._items.clear();
        this._destroyed = true;
    }
}
