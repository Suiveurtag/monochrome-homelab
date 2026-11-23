// Load the dictionaries for Chinese and Greek only when the lyrics need them.
export async function loadPinyin() {
    const { pinyin } = await import('pinyin-pro');
    return {
        pinyin: (text: string) => pinyin(text, { type: 'array', v: true }).map((reading) => [reading]),
    };
}

export async function loadGreekRomanization() {
    const { transliterate } = await import('transliteration');
    return { default: (text: string) => text.replace(/[\p{Script=Greek}\p{M}]+/gu, (word) => transliterate(word)) };
}
