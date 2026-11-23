import { ProcessLyrics } from './vendor/spicy-lyrics/upstream/ProcessLyrics.ts';
import { init as loadJapaneseDictionary } from './vendor/spicy-lyrics/upstream/KuromojiAnalyzer.ts';

function syllablesFor(line) {
    return line.words.map((word) => ({
        Text: word.text.trim(),
        IsPartOfWord: word.isPartOfWord,
        TransliteratedText: word.romanized,
        TransliteratedIsPartOfWord: word.romanizedPartOfWord,
    }));
}

function applySyllables(line, syllables) {
    const words = line.words.map((word, index) => ({
        ...word,
        romanized: syllables[index].TransliteratedText,
        romanizedPartOfWord: syllables[index].TransliteratedIsPartOfWord,
    }));
    if (!words.some((word) => word.romanized !== undefined)) return line;
    return {
        ...line,
        words,
        romanized: words.map((word, index) => {
            const text = (word.romanized ?? word.text).trim();
            return index < words.length - 1 && !(word.romanizedPartOfWord ?? word.isPartOfWord) ? `${text} ` : text;
        }).join('').trim(),
    };
}

export async function romanizeLyrics(lines, language, { onDictionaryReady } = {}) {
    const type = lines[0]?.syncType === 'Static' ? 'Static'
        : lines.some((line) => line.syncType === 'Syllable') ? 'Syllable' : 'Line';
    const vocalGroups = lines.map((line) => ({
        Type: 'Vocal',
        Text: line.text,
        TransliteratedText: line.romanized,
        Lead: { Syllables: syllablesFor(line) },
        Background: (line.backgrounds ?? []).map((background) => ({ Syllables: syllablesFor(background) })),
    }));
    const complete = await ProcessLyrics({
        Type: type,
        Content: vocalGroups,
        Lines: vocalGroups,
        Language: language === 'ja' ? 'jpn' : undefined,
    });
    if (!complete && language === 'ja' && onDictionaryReady) {
        // Use kana while the dictionary loads, then replace it with the complete reading.
        void loadJapaneseDictionary().then(() => romanizeLyrics(lines, language)).then(onDictionaryReady, () => {});
    }
    return lines.map((line, index) => {
        const vocal = vocalGroups[index];
        if (type !== 'Syllable') return { ...line, romanized: vocal.TransliteratedText };
        return {
            ...applySyllables(line, vocal.Lead.Syllables),
            backgrounds: line.backgrounds?.map((background, i) => applySyllables(background, vocal.Background[i].Syllables)),
        };
    });
}
