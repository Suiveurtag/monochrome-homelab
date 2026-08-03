/**
 * Narrow compatibility layer between the upstream Spicy Lyrics animator and
 * Monochrome's custom element. Keep platform concerns here so the vendored
 * animator can stay byte-for-byte identical below its import block.
 */

export type LyricsType = "Syllable" | "Line" | "Static";
type ExtendedLyricsType = LyricsType | "None";

class Store<T> {
  private value: T;
  private listeners = new Set<(value: T) => void>();

  constructor(initialValue: T) {
    this.value = initialValue;
  }

  get(): T {
    return this.value;
  }

  set(value: T): void {
    if (Object.is(this.value, value)) return;
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const $currentLyricsType = new Store<ExtendedLyricsType>("None");
export const $simpleLyricsMode = new Store(false);
export const $simpleLyricsModeRenderingType = new Store("calculate");

export const LyricsObject: {
  Types: Record<LyricsType, { Lines: any[] }>;
} = {
  Types: {
    Syllable: { Lines: [] },
    Line: { Lines: [] },
    Static: { Lines: [] },
  },
};

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
  LongerThan: 1500,
  Longer: { Glow: 0.4, YOffset: 0.45, Scale: 1.103 },
  Shorter: { Glow: 0.285, YOffset: 0.1, Scale: 1.09 },
};

export const preHiddenDotLineMs = 500;
export const BlurMultiplier = 1.25;
export const timeOffset = 0;

type VirtualizerHook = {
  setOnNewElementMounted(callback: (() => void) | null): void;
};

let activeOwner: object | null = null;
let activeVirtualizer: VirtualizerHook | null = null;
let onNewElementMounted: (() => void) | null = null;

export function setOnNewElementMounted(callback: (() => void) | null): void {
  onNewElementMounted = callback;
  activeVirtualizer?.setOnNewElementMounted(callback);
}

export function activateRendererState(
  owner: object,
  type: LyricsType,
  lines: any[],
  virtualizer: VirtualizerHook | null,
): void {
  activeOwner = owner;
  if (activeVirtualizer !== virtualizer) {
    activeVirtualizer?.setOnNewElementMounted(null);
    activeVirtualizer = virtualizer;
    activeVirtualizer?.setOnNewElementMounted(onNewElementMounted);
  }
  LyricsObject.Types.Syllable.Lines = type === "Syllable" ? lines : [];
  LyricsObject.Types.Line.Lines = type === "Line" ? lines : [];
  LyricsObject.Types.Static.Lines = type === "Static" ? lines : [];
  $currentLyricsType.set(type);
}

export function releaseRendererState(owner: object): void {
  if (activeOwner !== owner) return;
  activeVirtualizer?.setOnNewElementMounted(null);
  activeVirtualizer = null;
  activeOwner = null;
  LyricsObject.Types.Syllable.Lines = [];
  LyricsObject.Types.Line.Lines = [];
  LyricsObject.Types.Static.Lines = [];
  $currentLyricsType.set("None");
}
