import { describe, expect, test } from 'vitest';
import {
    buildTrackVersionUpdates,
    getTrackVersionGroup,
    getTrackVersionLabel,
    normalizeAlternativeVersionIds,
} from './track-versions.js';

describe('track version groups', () => {
    const original = {
        id: 'original',
        title: 'Afterglow',
        versionGroupId: 'versions:original',
        alternativeVersionIds: ['instrumental'],
        versionLabel: 'Original',
    };
    const instrumental = {
        id: 'instrumental',
        title: 'Afterglow (Instrumental)',
        versionGroupId: 'versions:original',
        alternativeVersionIds: ['original'],
        versionLabel: 'Instrumental',
    };
    const demo = { id: 'demo', title: 'Afterglow Demo', versionLabel: 'Demo' };

    test('normalizes sibling ids and resolves a symmetric group', () => {
        expect(normalizeAlternativeVersionIds(['original', 'instrumental', 'instrumental'], 'original')).toEqual([
            'instrumental',
        ]);
        expect(getTrackVersionGroup(instrumental, [original, instrumental, demo]).map((track) => track.id)).toEqual([
            'instrumental',
            'original',
        ]);
    });

    test('adds and removes members while keeping every sibling symmetric', () => {
        const linked = buildTrackVersionUpdates(original, [original, instrumental, demo], ['instrumental', 'demo'], {
            versionLabel: 'Album version',
        });
        const byId = new Map(linked.map(({ updated }) => [updated.id, updated]));

        expect(byId.get('original')).toMatchObject({
            versionGroupId: 'versions:original',
            alternativeVersionIds: ['instrumental', 'demo'],
            versionLabel: 'Album version',
        });
        expect(byId.get('instrumental').alternativeVersionIds).toEqual(['original', 'demo']);
        expect(byId.get('demo').alternativeVersionIds).toEqual(['original', 'instrumental']);

        const unlinked = buildTrackVersionUpdates(original, [original, instrumental, demo], [], {});
        expect(unlinked.map(({ updated }) => updated)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: 'original', versionGroupId: null, alternativeVersionIds: [] }),
                expect.objectContaining({ id: 'instrumental', versionGroupId: null, alternativeVersionIds: [] }),
            ])
        );
    });

    test('infers familiar labels without restricting custom labels', () => {
        expect(getTrackVersionLabel({ title: 'Afterglow (Sped Up)' })).toBe('Sped Up');
        expect(getTrackVersionLabel({ title: 'Afterglow', versionLabel: 'Tape room take' })).toBe('Tape room take');
    });
});
