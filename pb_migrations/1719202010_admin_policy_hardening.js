/* eslint-disable no-undef, @typescript-eslint/triple-slash-reference */
/// <reference path="../pb_data/types.d.ts" />

const ACTIVE_MEMBER = '@request.auth.id != "" && @request.auth.access_status = "active"';
const ADMIN = '@request.auth.role = "admin"';
const CONFIG = '@collection.app_config';
const RULE_FIELDS = ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule'];
const SOCIAL_COLLECTIONS = [
    'social_profiles',
    'social_presence',
    'social_messages',
    'social_follows',
    'social_conversations',
    'social_posts',
    'social_post_likes',
    'social_post_comments',
    'social_pins',
    'social_mutes',
    'social_reads',
    'social_blocks',
];

const socialGate = `${ACTIVE_MEMBER} && (${ADMIN} || ${CONFIG}.feature_social = true)`;
const partyGate = `${ACTIVE_MEMBER} && (${ADMIN} || (${CONFIG}.feature_parties = true && ${CONFIG}.allow_parties = true))`;

function wrapRule(rule, gate) {
    if (rule === null) return null;
    return `${gate} && (${String(rule).trim() || 'true'})`;
}

function unwrapRule(rule, gate) {
    if (rule === null) return null;
    const prefix = `${gate} && (`;
    if (!rule.startsWith(prefix) || !rule.endsWith(')')) return rule;
    const original = rule.slice(prefix.length, -1);
    return original === 'true' ? '' : original;
}

function findOptionalCollection(app, name) {
    try {
        return app.findCollectionByNameOrId(name);
    } catch {
        return null;
    }
}

migrate(
    (app) => {
        for (const name of SOCIAL_COLLECTIONS) {
            const collection = findOptionalCollection(app, name);
            if (!collection) continue;
            for (const field of RULE_FIELDS) collection[field] = wrapRule(collection[field], socialGate);
            app.save(collection);
        }

        const parties = findOptionalCollection(app, 'parties');
        if (parties) {
            parties.createRule = wrapRule(parties.createRule, partyGate);
            app.save(parties);
        }
    },
    (app) => {
        for (const name of SOCIAL_COLLECTIONS) {
            const collection = findOptionalCollection(app, name);
            if (!collection) continue;
            for (const field of RULE_FIELDS) collection[field] = unwrapRule(collection[field], socialGate);
            app.save(collection);
        }

        const parties = findOptionalCollection(app, 'parties');
        if (parties) {
            parties.createRule = unwrapRule(parties.createRule, partyGate);
            app.save(parties);
        }
    }
);
