// deno-lint-ignore-file no-explicit-any
const dictionaryUrl = new URL("https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/");

let Analyzer: any;
let Loading: Promise<void> | undefined;

const build = async (): Promise<void> => {
  const [{ default: BrowserDictionaryLoader }, { default: Tokenizer }] = await Promise.all([
    import("kuromoji/src/loader/BrowserDictionaryLoader.js"),
    import("kuromoji/src/Tokenizer.js"),
  ]);
  const loader = new BrowserDictionaryLoader("/dict");
  const loadFile = loader.loadArrayBuffer;
  // Kuromoji joins paths as filesystem paths. Resolve only this loader's files as URLs.
  loader.loadArrayBuffer = (path: string, callback: (...args: any[]) => void) => {
    loadFile(new URL(path.slice(path.lastIndexOf("/") + 1), dictionaryUrl).href, callback);
  };
  Analyzer = await new Promise((resolve, reject) => {
    loader.load((error: Error | null, dictionary: any) => {
      if (error) reject(error);
      else resolve(new Tokenizer(dictionary));
    });
  });
};

/**
 * Loads the tokenizer and its dictionary once. A failed load is forgotten, so
 * the next caller tries again (after a dropped connection, say).
 */
export const init = (): Promise<void> => {
  if (Analyzer !== undefined) return Promise.resolve();
  Loading ??= build().catch((error) => {
    Loading = undefined;
    throw error;
  });
  return Loading;
};

/** Whether the tokenizer is ready to use right now. */
export const isReady = (): boolean => Analyzer !== undefined;

export const parse = (text = ""): Promise<any> => {
  if (text.trim() === "" || Analyzer === undefined) {
    return Promise.resolve([]);
  }

  const result = Analyzer.tokenize(text) as any[];
  for (const token of result) {
    token.verbose = {
      word_id: token.word_id,
      word_type: token.word_type,
      word_position: token.word_position,
    };
    delete token.word_id;
    delete token.word_type;
    delete token.word_position;
  }

  return Promise.resolve(result);
};
