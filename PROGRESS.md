# Refactor Progress

This is the detailed progress log for multi-session Codex work. Keep it current, concise, and factual.

For future Codex discussions, start with `HANDOFF.md` and `AGENTS.md`. Use this file only when the short handoff does not contain enough detail.

## Current State

- Date: 2026-05-30
- Branch: main
- Last known commit before current checkpoint: d850835
- Current milestone: Self-Hosted Checkpoint 21 - Clarify Migration From Existing Services (complete)
- Risk level: Medium

The repo now has an additive hybrid track identity layer, a non-production local upload server prototype, mandatory self-hosted auth gating, server-side account approval, a basic in-app admin account management panel, a dedicated Uploaded Music tab, server-side search for uploaded music, shared server metadata editing for structured uploads, embedded audio metadata extraction on upload, a self-hosted radio backend model, a dedicated Library > Radio surface, YouTube clip associations visible from song UI, a self-hosted public profile fallback for approved users, internal self-hosted share links for songs and playlists, social contact invitations, minimal 1:1 chat between accepted contacts, self-hosted listening parties for accepted contacts, and an explicit frontend boundary for self-hosted-only service fallbacks. Existing `track.id` playback/route behavior is preserved, while persisted tracks can carry source-aware `trackKey` and `source` metadata for external API tracks, browser-local files, podcasts, tracker tracks, local server uploads, radio streams, and future YouTube video identities.

Self-Hosted Checkpoints 1 through 21 are complete: `docs/ARCHITECTURE.md` now contains a concise "Self-Hosted Contract Map"; `js/track-model.ts` has additive future source kinds for `server-library`, `radio`, and `youtube-video` plus exported source normalization helpers; `js/server-library.js` is now the app-facing client boundary for future self-hosted library operations; `server/selfhosted/server.mjs` is the minimal backend skeleton with config loading, data directories, `/health`, account/profile/radio/share/invitation/message/party endpoints, and auth placeholders; `server/storage/filesystem-library.mjs` now owns structured local filesystem storage, bounded search, shared metadata updates, extracted metadata defaults, and shared YouTube clip metadata for server-local uploads; `js/auth-gate.js` gates configured self-hosted browser sessions behind `/account` and exposes `shouldUseSelfHostedServices()` for self-hosted-only fallbacks; `server/selfhosted/accounts.mjs` provides self-hosted account approval state; `server/selfhosted/profiles.mjs` provides approved-user public profiles; `server/selfhosted/shares.mjs` provides approved-user internal sharing; `server/selfhosted/invitations.mjs` provides contact invitation state; `server/selfhosted/messages.mjs` provides accepted-contact 1:1 messaging; `server/selfhosted/parties.mjs` provides accepted-contact self-hosted listening parties; `js/selfhosted-admin.js` renders account management for approved admins; Library > Uploaded Music is the dedicated surface for server-local uploaded tracks; Library > Radio is the dedicated surface for self-hosted radio streams; and `js/youtube-clips.js` provides URL/ID normalization plus local external-track clip associations.

`HANDOFF.md` is now the recommended first-read summary for future sessions; read `AGENTS.md` next, then consult the larger docs only if more detail is needed.

## Last Completed Self-Hosted Checkpoint

Self-Hosted Checkpoint 21 - Clarify Migration From Existing Services

Goal:

- Document and enforce the boundary between Better Auth, PocketBase, Appwrite legacy pieces, and the additive self-hosted backend.

Success criteria:

- Better Auth remains the browser session authority and continues to expose normalized `$id`.
- PocketBase remains the default/public sync, profile, public playlist, and listening-party service.
- Appwrite remains legacy/residual configuration rather than an active account boundary.
- Self-hosted-only profile/social fallbacks are attempted only when mandatory self-hosted auth is enabled.

In scope:

- `js/auth-gate.js`
- `js/profile.js`
- `js/tests/auth-gate.test.js`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`

Out of scope:

- Removing Appwrite.
- Replacing PocketBase sync/profile/public playlist data.
- Replacing Better Auth.
- Production install/update scripts.

Changes:

- Added `shouldUseSelfHostedServices()` in `js/auth-gate.js`, currently equivalent to mandatory self-hosted auth.
- Added focused auth-gate coverage for the new self-hosted service boundary.
- Gated `js/profile.js` self-hosted profile fallback, profile mirroring, contact invitation button display, and own-profile fallback navigation behind `shouldUseSelfHostedServices()`.
- Documented the service ownership model in architecture and decision docs.
- Marked Self-Hosted Checkpoint 21 complete in the checkpoint roadmap and milestones.

Why:

- Avoid making the self-hosted backend a second source of truth during default/public app use.
- Preserve PocketBase as the existing profile/sync/social boundary unless a deployment explicitly enables the self-hosted path.
- Keep Appwrite legacy/residual pieces visible but non-authoritative until a dedicated migration/removal decision exists.
- Give later install/update work a clear service boundary before adding deployment scripts.
- Let accepted self-hosted contacts host and join listening parties without requiring PocketBase for the homelab path.
- Keep the first self-hosted party implementation persistent and conservative by using polling instead of adding websocket infrastructure.
- Reuse accepted invitations as the privacy boundary for party links and joins.
- Preserve existing PocketBase-backed listening-party behavior for public/default deployments.
- Let accepted self-hosted contacts exchange text before adding richer listening-party or realtime social features.
- Reuse accepted invitation state as the privacy boundary instead of introducing a parallel contact model.
- Keep the first chat implementation persistent and manual-refresh so it does not add polling or websocket complexity yet.
- Establish a user-controlled contact boundary before adding chat or more private social sharing flows.
- Keep social relationships keyed by approved self-hosted account ids while still letting profile UI initiate invitations.
- Keep invitations visible from Account without introducing a full notification system yet.
- Let users send stable in-app links for songs and playlists before adding chat, contacts, or notifications.
- Keep external catalog shares portable through canonical app hrefs while preserving server-local upload limitations through snapshots.
- Reuse approved self-hosted account headers as the access boundary instead of exposing unauthenticated share records.
- Give homelab deployments public profiles for approved users without requiring PocketBase to be available.
- Preserve the existing mature PocketBase profile route/UI by treating self-hosted profiles as a compatible fallback rather than a replacement.
- Keep profile authorization aligned with the self-hosted account approval boundary before adding sharing, invitations, or chat.
- Let users attach music videos or related clips to songs without changing the app's audio playback path.
- Reuse the existing shared uploaded-track metadata boundary for server-local music instead of adding a parallel uploaded-track store.
- Keep external-track associations useful immediately through local `trackKey` storage until a later shared external metadata backend exists.
- Normalize YouTube IDs at the edge so UI code can render embeds and links from a stable shape.
- Make self-hosted radio discoverable and playable from its own music surface instead of requiring raw API calls.
- Reuse hybrid track identity and the existing direct-audio player path so radio playback does not introduce a parallel player.
- Keep the radio UI small and compatible with the backend approval boundary while leaving admin moderation and live metadata for later checkpoints.
- Establish the radio server contract before adding a playable Radio tab and player integration.
- Keep radio persistence simple and local to the self-hosted backend while preserving account approval as the access boundary.
- Validate stream URLs server-side before any future playback UI consumes them.
- Give uploads useful default metadata immediately while keeping user-edited server metadata authoritative.
- Reuse the existing TagLib dependency already present in the project instead of adding native dependencies.
- Keep extracted artwork private to the tokenized upload URL pattern used by audio streams.
- Let self-hosted uploaded tracks move beyond filename-derived metadata before adding embedded tag extraction.
- Keep manual server metadata as the precedence layer future automatic extraction should not overwrite casually.
- Preserve the prototype upload auth model by allowing edits only for tracks already in the requesting user's upload index.
- Make uploaded-music search scale better than browser-only filtering while keeping the prototype storage model simple.
- Keep search scoped to the current uploaded-music user and preserve existing list/upload auth behavior.
- Normalize common filename and metadata differences before later rich metadata extraction arrives.
- Make uploaded server music discoverable as its own music surface before adding backend search, metadata editing, and richer library behavior.
- Avoid conflating browser-local file handles with self-hosted server-local audio files.
- Reuse existing track UI/action contracts instead of introducing parallel play/favorite/playlist logic.
- Give self-hosted admins an in-app account management path instead of requiring raw API calls for routine approvals.
- Keep backend authorization as the real security boundary while using the UI only as a convenience layer.
- Make the self-hosted backend URL configurable for deployed browser clients without changing default public app behavior.
- Add the approval model needed before exposing admin account management UI.
- Ensure new self-hosted users are pending by default and cannot pass `/api/accounts/me` until approved.
- Provide a temporary admin-secret/admin-account backend path for account approval before the full admin dashboard exists.
- Make self-hosted auth mandatory only for deployments that opt in through config, while preserving default/public app behavior.
- Keep the auth boundary centralized so later admin approval work can build on it without scattering route checks.
- Preserve localhost-only dev access through the existing test session path.
- Make local filesystem upload storage safer and more production-shaped before adding mandatory auth, admin approval, metadata editing, search, backup, or restore.
- Keep user-provided filenames out of filesystem paths and prepare stable on-disk locations for future metadata/artwork/index work.
- Preserve existing frontend upload/list/playback contracts and keep prior prototype manifest data readable.
- Give future AI sessions a clear next-step mechanism so they can continue one checkpoint at a time without re-planning from scratch.
- Prototype server uploads without committing to production storage.
- Keep uploaded tracks compatible with the M5a hybrid identity model.
- Reuse existing direct-audio, favorites, and playlist paths instead of adding parallel persistence behavior.

Files touched:

- `js/auth-gate.js`
- `js/profile.js`
- `js/tests/auth-gate.test.js`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/selfhosted/parties.mjs`
- `server/selfhosted/parties.test.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/listening-party.js`
- `js/ui.js`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/selfhosted/messages.mjs`
- `server/selfhosted/messages.test.mjs`
- `server/selfhosted/invitations.mjs`
- `server/selfhosted/invitations.test.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-chat.js`
- `js/selfhosted-invitations.js`
- `js/profile.js`
- `js/app.js`
- `index.html`
- `styles.css`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/selfhosted/shares.mjs`
- `server/selfhosted/shares.test.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-shares.js`
- `js/events.js`
- `js/ui.js`
- `js/router.js`
- `index.html`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/selfhosted/profiles.mjs`
- `server/selfhosted/profiles.test.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `js/selfhosted-profiles.js`
- `js/profile.js`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `js/youtube-clips.js`
- `js/events.js`
- `js/ui.js`
- `index.html`
- `styles.css`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `js/selfhosted-radios.js`
- `index.html`
- `styles.css`
- `js/ui.js`
- `js/app.js`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/selfhosted/radios.mjs`
- `server/selfhosted/radios.test.mjs`
- `server/selfhosted/server.mjs`
- `server/selfhosted/config.mjs`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/storage/audio-metadata.mjs`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/server-library.js`
- `js/events.js`
- `index.html`
- `styles.css`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/server-library.js`
- `js/ui.js`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `js/selfhosted-admin.js`
- `HANDOFF.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `.env.example`
- `index.html`
- `styles.css`
- `js/ui.js`
- `js/app.js`
- `docs/ARCHITECTURE.md`
- `docs/SELF_HOSTED_CHECKPOINTS.md`
- `docs/MILESTONES.md`
- `HANDOFF.md`
- `PROGRESS.md`
- `vite-plugin-auth-gate.js`
- `js/accounts/auth.js`
- `js/app.js`
- `server/selfhosted/accounts.test.mjs`
- `server/selfhosted/accounts.mjs`
- `server/selfhosted/accounts.test.mjs`
- `server/selfhosted/config.mjs`
- `server/selfhosted/server.mjs`
- `js/auth-gate.js`
- `js/tests/auth-gate.test.js`
- `js/accounts/auth.js`
- `js/app.js`
- `vite-plugin-auth-gate.js`
- `server/storage/filesystem-library.mjs`
- `server/storage/filesystem-library.test.mjs`
- `server/uploads/server.mjs`
- `js/server-uploads.js`
- `js/track-model.ts`
- `js/tests/track-model.test.ts`
- `js/app.js`
- `js/ui.js`
- `js/events.js`
- `index.html`
- `styles.css`
- `package.json`
- `PROGRESS.md`
- `docs/ARCHITECTURE.md`
- `docs/MILESTONES.md`
- `docs/DECISIONS.md`

Verification:

- `node --check js/auth-gate.js js/profile.js` passed.
- `npm exec -- vitest run --config=vite.config.ts js/tests/auth-gate.test.js` passed: 1 file, 4 tests.
- `npm exec -- eslint js/auth-gate.js js/profile.js` passed.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
- `node --check server/selfhosted/parties.mjs server/selfhosted/parties.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/listening-party.js js/ui.js` passed.
- `node --test server/selfhosted/parties.test.mjs` passed: 2 tests. Expected 403 errors were logged during stranger and non-host playback rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs server/selfhosted/messages.test.mjs server/selfhosted/parties.test.mjs` passed: 15 tests. Expected 403/400/409 errors were logged during rejection coverage.
- `npm exec -- eslint js/listening-party.js js/ui.js` passed with 5 pre-existing `js/ui.js` warnings and 0 errors.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
- `node --check server/selfhosted/messages.mjs server/selfhosted/messages.test.mjs server/selfhosted/invitations.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-chat.js js/selfhosted-invitations.js js/profile.js js/app.js` passed.
- `node --test server/selfhosted/messages.test.mjs server/selfhosted/invitations.test.mjs` passed: 4 tests. Expected 409/403 errors were logged during duplicate, non-recipient, pending-contact, and stranger rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs server/selfhosted/messages.test.mjs` passed: 13 tests. Expected 403/400/409 errors were logged during rejection coverage.
- `npm exec -- eslint js/selfhosted-chat.js js/selfhosted-invitations.js js/profile.js` passed.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import and large chunk warnings.
- `node --check server/selfhosted/invitations.mjs server/selfhosted/invitations.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-invitations.js js/profile.js js/app.js` passed.
- `node --test server/selfhosted/invitations.test.mjs` passed: 2 tests. Expected 409/403 errors were logged during duplicate and non-recipient rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs` passed: 11 tests. Expected 403/400/409 errors were logged during rejection coverage.
- `npm exec -- eslint js/selfhosted-invitations.js js/profile.js` passed.
- `npm exec -- eslint js/selfhosted-invitations.js js/profile.js js/app.js` failed on pre-existing `js/app.js` lint errors unrelated to this checkpoint (`no-empty`, `no-floating-promises`) plus existing warnings.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/shares.mjs server/selfhosted/shares.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-shares.js js/events.js js/ui.js js/router.js` passed.
- `node --test server/selfhosted/shares.test.mjs` passed: 2 tests. Expected 403 errors were logged during pending-user rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs` passed: 9 tests. Expected 403/400/409 errors were logged during rejection coverage.
- `npm exec -- eslint js/selfhosted-shares.js js/events.js js/ui.js js/router.js` passed with 5 pre-existing `js/ui.js` warnings and 0 errors.
- `npm exec -- eslint js/selfhosted-shares.js` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/selfhosted/profiles.mjs server/selfhosted/profiles.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-profiles.js js/profile.js` passed.
- `node --test server/selfhosted/profiles.test.mjs` passed: 2 tests. Expected 403/409 errors were logged during pending-user and duplicate-username rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/profiles.test.mjs` passed: 7 tests. Expected 403/400/409 errors were logged during rejection coverage.
- `npm exec -- eslint js/selfhosted-profiles.js js/profile.js` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check js/youtube-clips.js js/events.js js/ui.js server/storage/filesystem-library.mjs server/uploads/server.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 5 tests.
- `npm exec -- eslint js/youtube-clips.js js/events.js js/ui.js` passed with 5 pre-existing `js/ui.js` warnings and 0 errors.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check js/selfhosted-radios.js js/ui.js js/app.js` passed.
- `npm exec -- eslint js/selfhosted-radios.js` passed.
- `node --test server/selfhosted/radios.test.mjs` passed: 2 tests. Expected 403/400 errors were logged during rejection coverage.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- Playwright radio tab smoke passed with `MONOCHROME_AUTH_REQUIRED=true`: mocked self-hosted radio API rendered Library > Radio, filtered a station by genre, clicked it, and verified the player loaded a `source.kind === "radio"` track with the expected stream URL. Localhost also logged expected remote auth/API CORS noise and the existing Shaka config warning.
- `node --check server/selfhosted/radios.mjs server/selfhosted/radios.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/selfhosted/radios.test.mjs` passed: 2 tests. Expected 403/400 errors were logged during rejection coverage.
- `node --test server/selfhosted/accounts.test.mjs` passed: 3 tests. Expected 403 errors were logged during non-admin rejection coverage.
- Final combined syntax check passed for touched server/frontend modules.
- Final combined Node test run passed: 10 tests across storage, radio, and account suites.
- Final `npm exec -- eslint js/events.js js/server-library.js js/server-uploads.js` passed.
- Final `git diff --check` passed.
- Final `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/storage/audio-metadata.mjs server/storage/filesystem-library.mjs server/uploads/server.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 5 tests.
- HTTP upload metadata extraction smoke passed: temp upload server uploaded a tagged WAV, returned extracted title/artist/album/year, and found the track by extracted genre search.
- `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs js/server-library.js js/server-uploads.js js/events.js js/ui.js` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 4 tests.
- `npm exec -- eslint js/events.js js/server-library.js js/server-uploads.js` passed.
- HTTP upload metadata smoke passed: temp upload server uploaded a WAV, patched metadata through `/uploads/:id/metadata`, and found the updated track by tag search.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs js/server-library.js js/server-uploads.js js/ui.js` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 3 tests.
- `npm exec -- eslint js/server-library.js js/server-uploads.js` passed.
- HTTP upload search smoke passed: temp upload server uploaded two WAVs and `/uploads/search?q=jazz&limit=5` returned the matching track.
- `git diff --check` passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check js/app.js js/ui.js js/server-library.js js/server-uploads.js` passed.
- `npm exec -- eslint js/server-library.js js/server-uploads.js` passed.
- `git diff --check` passed.
- Playwright uploaded music tab smoke passed: temp upload server plus Vite dev uploaded a WAV, rendered it in Library > Uploaded Music, filtered matching and non-matching searches, and confirmed like/menu action entry points.
- Initial Playwright uploaded music smoke uploaded and rendered the track but failed because the assertion expected the filename hyphen instead of the server-derived display title; rerun with the displayed title passed.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- `node --check js/selfhosted-admin.js js/accounts/auth.js js/app.js vite-plugin-auth-gate.js` passed.
- `node --check server/selfhosted/accounts.mjs server/selfhosted/accounts.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/selfhosted/accounts.test.mjs` passed: 3 tests. The new non-admin authorization test logs expected 403 errors from the server handler.
- `npm exec -- eslint js/selfhosted-admin.js js/accounts/auth.js vite-plugin-auth-gate.js` passed after installing local dependencies with `npm install --no-package-lock`.
- `npm run build` passed with existing chunk/dynamic-import warnings.
- Playwright admin account UI smoke passed: approved admin dev session saw the account list, pending listener could be approved, approved listener saw no admin action buttons.
- Initial `npm run build` was blocked before dependency install because `vite` was not found.
- Initial `npm exec -- eslint ...` was blocked before dependency install because the local ESLint config dependency `@eslint/js` was unavailable.
- `node --check server/selfhosted/accounts.mjs server/selfhosted/accounts.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/selfhosted/accounts.test.mjs` passed: 2 tests.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- `node --check js/auth-gate.js js/accounts/auth.js js/app.js vite-plugin-auth-gate.js` passed.
- `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/auth-gate.test.js` passed: 3 tests.
- `npm.cmd exec -- eslint js/auth-gate.js js/accounts/auth.js vite-plugin-auth-gate.js` passed.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- Browser smoke with `MONOCHROME_AUTH_REQUIRED=true` passed: signed-out `/search/test` redirected to `/account`, localhost `Use Test Session` signed in, and `/search/test` rendered afterward.
- `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` passed.
- `node --test server/storage/filesystem-library.test.mjs` passed: 2 tests.
- Direct upload server smoke passed with temp storage: health, upload, list, HEAD stream, and range stream.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- `npm.cmd exec -- eslint server/storage/filesystem-library.mjs server/uploads/server.mjs` was skipped/blocked by the existing ESLint TypeScript project config excluding `server/**/*.mjs`.
- Documentation-only checkpoint roadmap added; runtime validation not required for this file.
- `node --check server/uploads/server.mjs js/server-uploads.js js/app.js js/ui.js js/events.js` passed.
- Direct server smoke passed: health, upload, list, and HEAD stream.
- `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` passed: 16 tests.
- `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js` passed.
- `npm.cmd run build` passed with existing chunk/dynamic-import warnings.
- Playwright UI smoke passed: signed-out Server uploads state renders, upload/list works with injected test user and ephemeral upload server, clicking an uploaded WAV loads `/stream` with `source.kind === "server-local"`.
- Added localhost-only `Use Test Session` auth fallback so upload testing does not require a real Better Auth login.
- `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js js/app.js js/ui.js js/events.js` failed on pre-existing `js/app.js` errors (`no-empty`, `no-floating-promises`) and warnings; targeted new/frontend helper lint passed.

Known risks:

- `shouldUseSelfHostedServices()` is intentionally equivalent to mandatory auth for now. If a future deployment wants optional self-hosted services without mandatory auth, that helper is the migration point.
- Checkpoint 21 did not migrate existing PocketBase or Appwrite data; it only documented and enforced the current ownership boundary.
- Self-hosted listening parties use conservative polling rather than realtime subscriptions, so sync is coarse compared with the PocketBase party path.
- Self-hosted party joins are limited to accepted contacts of the host; signed-out/public party links are not implemented.
- Self-hosted party messages and song requests are plaintext JSON in the self-hosted data directory.
- Multi-browser listening-party smoke was not run in this session; endpoint coverage proves the server contract, but a real host/guest playback smoke remains useful.
- Chat rows currently display durable user ids rather than profile display names.
- Chat has manual refresh/contact selection only; realtime push, notifications, typing indicators, unread counts, and pagination UI are out of scope.
- Message records are plaintext JSON in the self-hosted data directory; end-to-end encryption is not implemented.
- Invitation rows currently display durable user ids rather than rich profile display names; richer contact display can be added with a profile lookup layer.
- Invitations are polled/rendered on Account page load/refresh only; realtime notifications are intentionally out of scope.
- Rejected invitations can be recreated later, while pending and accepted relationships block duplicates.
- Internal shares require approved self-hosted account headers to create and read; signed-out public sharing is not implemented.
- Server-local uploaded-track shares depend on the original tokenized stream URL remaining valid on the same self-hosted server.
- Playlist shares are snapshots and do not live-update when the original playlist changes.
- Self-hosted profile fallback intentionally preserves PocketBase as the primary source, so mixed deployments may show PocketBase data first when both stores have a profile for the same username.
- Self-hosted profile image fields are URL-only and validate URL shape, but do not upload or proxy avatar/banner assets.
- Self-hosted profile public playlists and stats are stored as simple JSON fields; richer computed stats and playlist publication are left for sharing/social checkpoints.
- External API track YouTube clip associations are local to the current browser and are not synced/shared until a future server-backed external metadata store exists.
- YouTube embeds depend on YouTube availability, embed permissions, and browser/network policy; the app only stores and displays the association.
- Uploaded-track YouTube clip validation normalizes common YouTube URL shapes and 11-character IDs, but does not verify that the remote video exists.
- Radio playback uses browser support for direct stream URLs; HLS/ICY edge cases and Safari/mobile behavior still need real-device smoke.
- Library > Radio currently has a basic add form and local filtering only; admin disable/edit still uses backend endpoints directly.
- Radio rows intentionally hide the standard track menu because download/metadata actions are not yet radio-aware.
- Radio backend validation only verifies URL shape/protocol, not stream reachability or browser playback compatibility.
- Embedded metadata extraction depends on TagLib format support; automated coverage uses a generated tagged WAV, while manual MP3/FLAC/M4A smoke remains useful.
- Embedded artwork serving is implemented but not covered by the generated WAV fixture because the lightweight fixture has no picture block.
- Shared metadata editing currently applies to structured uploaded tracks in the requesting user's upload index; legacy manifest uploads remain readable but not editable through the new endpoint.
- Metadata edits have no history, conflict handling, moderation, or rich permission model yet.
- Uploaded Music search is now server-side for non-empty queries, but it is still a bounded metadata scan rather than a dedicated full-text index.
- Uploaded track actions still rely on the standard track list/context menu behavior; this is intentional, but richer uploaded-music-specific actions remain future work.
- The admin account panel is intentionally basic and has no invitations, audit trail, bulk actions, search, or social moderation.
- The admin panel depends on `MONOCHROME_SELF_HOSTED_SERVER_URL`, `window.__MONOCHROME_SELF_HOSTED_SERVER_URL__`, or `localStorage.monochrome-selfhosted-server-url` matching the running self-hosted backend.
- The account store is JSON-file based and suitable for the current homelab checkpoint, but backup/restore and concurrent write hardening remain future work.
- Mandatory auth is currently a browser route boundary for configured self-hosted sessions; account approval and admin actions are enforced by the self-hosted backend endpoints.
- `authManager.ready` is now awaited before initial app routing; this should reduce auth flicker but slightly ties first render to session-check completion.
- The structured storage module keeps legacy manifests readable but does not migrate old files into the new layout.
- Stream token indexes are local JSON files; future auth/deletion/backup checkpoints still need to define lifecycle rules.
- Rich metadata/artwork extraction is still filename-only/default artwork.
- Local Vite startup succeeds under Playwright, but localhost reports expected CORS failures for remote auth/API endpoints and an existing Shaka config warning for `streaming.jumpLargeGaps`.
- Full lint still fails on broader existing `js/app.js` debt outside this milestone.
- Many UI surfaces still pass only legacy `id` into `isFavorite`; this is intentionally supported as fallback but less precise for non-TIDAL sources.
- Browser-local tracks still cannot serialize live `File` handles into cloud sync; local snapshots are metadata-only.
- Server-local uploaded audio files do not sync; cloud favorites/playlists may only carry metadata snapshots and local stream URLs.
- The local upload server auth boundary is prototype-only. Upload/list require the signed-in user id header, while stream URLs use per-track tokens for audio element compatibility.
- Server-local metadata is basic: filename title, unknown artist, unknown duration, no embedded artwork.
- Normal production audio stream resolution still depends on Qobuz-by-ISRC after TIDAL metadata lookup and must remain protected.

## Next Exact Step

For future sessions, read `HANDOFF.md` and `AGENTS.md` first.

If the user asks to continue the self-hosted roadmap, read `docs/SELF_HOSTED_CHECKPOINTS.md` and complete Checkpoint 22 - Add Ubuntu 26.04 Install Commands.

Before implementing Checkpoint 22, inspect `package.json`, `.env.example`, `server/selfhosted/config.mjs`, `server/selfhosted/server.mjs`, existing Docker/Nginx/deployment docs, and the Ubuntu/package-manager assumptions. Keep the installer conservative, explicit about paths, and non-destructive.

## Open Questions / Blockers

- None currently.

## Behavior Contracts To Recheck

When refactoring, recheck these areas before closing a milestone:

- Public routes and provider route aliases.
- DOM IDs/classes/data attributes referenced from JavaScript and CSS.
- `localStorage` keys and serialized value formats.
- IndexedDB name, version, stores, indexes, and persisted object shapes.
- PocketBase collection names, legacy `firebase_id` mapping, and JSON field shapes.
- Custom browser events used for cross-module coordination.
- Audio/video playback, queue, quality, Media Session, and Safari/iOS behavior.
- Search result normalization, TIDAL/HiFi fallback, Qobuz-by-ISRC stream resolution, and provider-prefixed IDs.
- Sidebar collapse/order/visibility, pinned items, queue/lyrics side panel, and search history behavior.
- Downloads, metadata writing, lyrics, visualizers, scrobbling, accounts, sync, and listening parties.
- PWA update flow and Capacitor mobile compatibility.
- Cloudflare bot metadata routes, SPA fallback behavior, Docker/Nginx static serving, and Vite plugin behavior.

## Verification Log

Append new entries here.

| Date | Command | Result | Notes |
| --- | --- | --- | --- |
| 2026-05-30 | `node --check server/selfhosted/invitations.mjs server/selfhosted/invitations.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-invitations.js js/profile.js js/app.js` | Pass | Syntax checks for invitation store/API, client, profile Connect action, and app panel initialization. |
| 2026-05-30 | `node --test server/selfhosted/invitations.test.mjs` | Pass | 2 tests passed; expected 409/403 errors were logged during duplicate and non-recipient rejection coverage. |
| 2026-05-30 | `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs server/selfhosted/invitations.test.mjs` | Pass | 11 tests passed across account, profile, radio, share, and invitation endpoint suites. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-invitations.js js/profile.js` | Pass | Targeted frontend lint passed for the new invitation client and profile Connect action. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-invitations.js js/profile.js js/app.js` | Fail | `js/app.js` still has pre-existing lint errors (`no-empty`, `no-floating-promises`) and warnings unrelated to invitations. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check server/selfhosted/shares.mjs server/selfhosted/shares.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-shares.js js/events.js js/ui.js js/router.js` | Pass | Syntax checks for internal sharing store/API, client, context-menu action, route, and shared page. |
| 2026-05-30 | `node --test server/selfhosted/shares.test.mjs` | Pass | 2 tests passed; expected 403 errors were logged during pending-user rejection coverage. |
| 2026-05-30 | `node --test server/selfhosted/accounts.test.mjs server/selfhosted/profiles.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/shares.test.mjs` | Pass | 9 tests passed across account, profile, radio, and share endpoint suites. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-shares.js js/events.js js/ui.js js/router.js` | Pass | 0 errors; 5 pre-existing `js/ui.js` unused-variable warnings remain. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-shares.js` | Pass | Targeted lint passed for the new share client. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check server/selfhosted/profiles.mjs server/selfhosted/profiles.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs js/selfhosted-profiles.js js/profile.js` | Pass | Syntax checks for self-hosted profile store/API and profile page fallback client. |
| 2026-05-30 | `node --test server/selfhosted/profiles.test.mjs` | Pass | 2 tests passed; expected 403/409 errors were logged during rejection coverage. |
| 2026-05-30 | `node --test server/selfhosted/accounts.test.mjs server/selfhosted/radios.test.mjs server/selfhosted/profiles.test.mjs` | Pass | 7 tests passed across account, radio, and profile endpoint suites. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-profiles.js js/profile.js` | Pass | Targeted frontend lint passed for the self-hosted profile client and profile page fallback. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check js/youtube-clips.js js/events.js js/ui.js server/storage/filesystem-library.mjs server/uploads/server.mjs` | Pass | Syntax checks for YouTube clip helper, touched UI/action modules, and uploaded metadata server modules. |
| 2026-05-30 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 5 tests passed, including shared YouTube clip metadata persistence on uploaded tracks. |
| 2026-05-30 | `npm exec -- eslint js/youtube-clips.js js/events.js js/ui.js` | Pass | 0 errors; 5 pre-existing `js/ui.js` unused-variable warnings remain. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-24 | `git status --short --branch` | Pass | Only new documentation files are untracked. |
| 2026-05-24 | `git diff --stat --cached` | Pass | No staged changes; no source behavior changes staged. |
| 2026-05-24 | `git diff -- docs/ARCHITECTURE.md docs/MILESTONES.md docs/DECISIONS.md PROGRESS.md` | Pass | No output because the documentation files are untracked. |
| 2026-05-24 | `git status --short --branch` | Pass | Only `AGENTS.md`, `PROGRESS.md`, and `docs/` are untracked; no source files changed. |
| 2026-05-24 | `bun run test -- js/tests/track-model.test.ts js/tests/db.test.js` | Skipped | `bun` is not installed in this environment. |
| 2026-05-24 | `npm.cmd run test -- js/tests/track-model.test.ts js/tests/db.test.js` | Skipped | Local dependencies are not installed; `vitest` was not found. |
| 2026-05-24 | `node --check js/db.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/accounts/pocketbase.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/api.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/metadata.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/app.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/events.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/ui-interactions.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/ui.js` | Pass | Syntax check only. |
| 2026-05-24 | `node --check js/commandPalette.js` | Pass | Syntax check only. |
| 2026-05-24 | `git diff --check` | Pass | Only line-ending normalization warnings. |
| 2026-05-24 | `bun install` | Pass | Installed local dependencies from Bun lockfiles. |
| 2026-05-24 | `bun x playwright install chromium` | Pass | Installed Playwright Chromium/headless shell for browser tests. |
| 2026-05-24 | `bun run test:headless -- js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 15 tests passed. |
| 2026-05-24 | `bun x eslint js/track-model.ts` | Pass | Hybrid helper lint issues fixed. |
| 2026-05-24 | `bun run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk warnings. |
| 2026-05-24 | `bun run test:headless` | Fail | Broader suite failures remain in `player.test.js` mock and API download tests; not specific to `track-model.ts` follow-up. |
| 2026-05-24 | `bun run lint` | Fail | Broad existing lint debt remains; `js/track-model.ts` now passes targeted ESLint. |
| 2026-05-25 | Documentation-only handoff update | Pass | Added `HANDOFF.md`; no functional code changed. |
| 2026-05-25 | `node --check server/uploads/server.mjs js/server-uploads.js js/app.js js/ui.js js/events.js` | Pass | Syntax checks for local upload server and touched frontend modules. |
| 2026-05-25 | Direct local upload server smoke | Pass | Health, upload, list, and HEAD stream succeeded with an ephemeral storage directory. |
| 2026-05-30 | `node --check js/selfhosted-admin.js js/accounts/auth.js js/app.js vite-plugin-auth-gate.js` | Pass | Syntax checks for admin client and touched frontend modules. |
| 2026-05-30 | `node --check server/selfhosted/accounts.mjs server/selfhosted/accounts.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` | Pass | Syntax checks for account server modules and tests. |
| 2026-05-30 | `node --test server/selfhosted/accounts.test.mjs` | Pass | 3 tests; expected 403 errors were logged during non-admin endpoint rejection coverage. |
| 2026-05-30 | `npm install --no-package-lock` | Pass | Installed local dependencies because `node_modules` was absent and Bun was unavailable; npm reported existing dependency vulnerabilities. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-admin.js js/accounts/auth.js vite-plugin-auth-gate.js` | Pass | Targeted lint for the new admin client and touched auth/config modules. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | Playwright admin account UI smoke | Pass | Temp self-hosted server plus Vite dev: admin saw account list and approved a pending listener; listener saw no admin action buttons. |
| 2026-05-30 | `node --check js/app.js js/ui.js js/server-library.js js/server-uploads.js` | Pass | Syntax checks for uploaded-music tab changes and server library client helpers. |
| 2026-05-30 | `npm exec -- eslint js/server-library.js js/server-uploads.js` | Pass | Targeted lint for upload client boundary; broader app/ui lint remains pre-existing debt. |
| 2026-05-30 | Playwright uploaded music tab smoke | Pass | Temp upload server plus Vite dev: upload, dedicated tab list, search filter, no-match empty state, like/menu action entry points. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs js/server-library.js js/server-uploads.js js/ui.js` | Pass | Syntax checks for uploaded-music server search and frontend client/UI wiring. |
| 2026-05-30 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 3 tests passed, including normalized uploaded-track search coverage. |
| 2026-05-30 | `npm exec -- eslint js/server-library.js js/server-uploads.js` | Pass | Targeted lint for upload client search helpers. |
| 2026-05-30 | HTTP upload search smoke | Pass | Temp upload server uploaded two WAVs; `/uploads/search?q=jazz&limit=5` returned the matching track. |
| 2026-05-30 | `git diff --check` | Pass | No whitespace errors. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs js/server-library.js js/server-uploads.js js/events.js js/ui.js` | Pass | Syntax checks for shared uploaded-track metadata storage, endpoint, client helpers, and context-menu UI wiring. |
| 2026-05-30 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 4 tests passed, including shared metadata update coverage. |
| 2026-05-30 | `npm exec -- eslint js/events.js js/server-library.js js/server-uploads.js` | Pass | Targeted lint for metadata editor and upload client helpers. |
| 2026-05-30 | HTTP upload metadata smoke | Pass | Temp upload server uploaded a WAV, patched metadata through `/uploads/:id/metadata`, and found the updated track by tag search. |
| 2026-05-30 | `git diff --check` | Pass | No whitespace errors. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-30 | `node --check server/storage/audio-metadata.mjs server/storage/filesystem-library.mjs server/uploads/server.mjs` | Pass | Syntax checks for upload metadata extraction and artwork serving changes. |
| 2026-05-30 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 5 tests passed, including generated tagged WAV extraction coverage. |
| 2026-05-30 | HTTP upload metadata extraction smoke | Pass | Temp upload server uploaded a tagged WAV, returned extracted title/artist/album/year, and found it by extracted genre search. |
| 2026-05-30 | `node --check server/selfhosted/radios.mjs server/selfhosted/radios.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` | Pass | Syntax checks for radio store, tests, and touched self-hosted server modules. |
| 2026-05-30 | `node --test server/selfhosted/radios.test.mjs` | Pass | 2 tests passed; expected 403/400 errors were logged during rejection coverage. |
| 2026-05-30 | `node --test server/selfhosted/accounts.test.mjs` | Pass | Existing account endpoint tests still pass after adding radio routes. |
| 2026-05-30 | Final combined validation | Pass | Syntax checks for touched modules, storage/radio/account Node tests (10 tests), targeted frontend ESLint, diff check, and production build all passed. |
| 2026-05-30 | `node --check js/selfhosted-radios.js js/ui.js js/app.js` | Pass | Syntax checks for the radio client and touched frontend wiring. |
| 2026-05-30 | `npm exec -- eslint js/selfhosted-radios.js` | Pass | Targeted lint for the new radio client. |
| 2026-05-30 | `node --test server/selfhosted/radios.test.mjs` | Pass | Existing radio API tests still pass after adding the frontend radio tab. |
| 2026-05-30 | Playwright radio tab smoke | Pass | Mocked self-hosted API rendered Library > Radio, filtered a station by genre, clicked it, and verified the player loaded a `source.kind === "radio"` track with the expected stream URL. |
| 2026-05-30 | `git diff --check` | Pass | No whitespace errors. |
| 2026-05-30 | `npm run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 16 tests passed. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js` | Pass | Targeted lint for hybrid model and upload client. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-25 | Playwright local upload UI smoke | Pass | Server uploads panel rendered, upload/list worked with injected test auth, and an uploaded WAV loaded as `/stream` in the player. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts js/server-uploads.js js/app.js js/ui.js js/events.js` | Fail | Broader touched-file lint still hits pre-existing `js/app.js` errors and warnings. |
| 2026-05-25 | Self-hosted checkpoint roadmap documentation | Pass | Added `docs/SELF_HOSTED_CHECKPOINTS.md`; runtime validation not required. |
| 2026-05-25 | Local uploads closeout validation | Pass | Re-ran `node --check` on upload/frontend modules, focused Vitest DB/track-model tests, targeted ESLint for track model/upload client, and production build before commit. |
| 2026-05-25 | Self-Hosted Checkpoint 1 documentation review | Pass | Documentation-only contract map; inspected source references for track identity, upload server/client, DB favorites/playlists, auth, PocketBase, and listening-party boundaries. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts` | Pass | 1 file, 10 tests passed after adding future source-kind coverage. |
| 2026-05-25 | `npm.cmd exec -- eslint js/track-model.ts` | Pass | Targeted lint passed for the expanded source model. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/track-model.test.ts js/tests/db.test.js` | Pass | 2 files, 19 tests passed on rerun. First combined run hit the existing pinned-items IndexedDB isolation flake, while `db.test.js` passed alone immediately after. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings. |
| 2026-05-25 | `node --check js/server-library.js js/app.js js/ui.js` | Pass | Syntax checks passed for the new server library client and touched UI call sites. |
| 2026-05-25 | `npm.cmd exec -- eslint js/server-library.js js/server-uploads.js` | Pass | Targeted lint passed for the server library boundary and upload transport adapter. |
| 2026-05-25 | `npm.cmd exec -- eslint js/server-library.js js/server-uploads.js js/app.js js/ui.js` | Fail | Broader touched-file lint still hits pre-existing `js/app.js` errors and warnings; new server library files passed targeted lint. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after adding `js/server-library.js`. |
| 2026-05-25 | `node --check server/selfhosted/config.mjs server/selfhosted/server.mjs server/uploads/server.mjs` | Pass | Syntax checks passed for the self-hosted backend skeleton and existing upload server. |
| 2026-05-25 | Self-hosted backend `/health` smoke | Pass | Started `createSelfHostedServer()` on an ephemeral port with temp data dir, fetched `/health`, verified `ok` and service name, then closed the server. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after adding the self-hosted backend skeleton. |
| 2026-05-25 | `node --check server/storage/filesystem-library.mjs server/uploads/server.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` | Pass | Syntax checks passed after extracting the upload storage module. |
| 2026-05-25 | `node --test server/storage/filesystem-library.test.mjs` | Pass | 2 tests passed for structured upload storage and legacy manifest fallback. |
| 2026-05-25 | Direct upload server smoke | Pass | Health, upload, list, HEAD stream, and range stream passed with an ephemeral structured storage directory. |
| 2026-05-25 | `npm.cmd exec -- eslint server/storage/filesystem-library.mjs server/uploads/server.mjs` | Blocked | Existing ESLint TypeScript project config excludes `server/**/*.mjs`; syntax checks and Node tests covered the changed server modules. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after structured upload storage extraction. |
| 2026-05-25 | `node --check js/auth-gate.js js/accounts/auth.js js/app.js vite-plugin-auth-gate.js` | Pass | Syntax checks passed for the client auth gate and touched app/auth files. |
| 2026-05-25 | `npm.cmd exec -- vitest run --config=vite.config.ts js/tests/auth-gate.test.js` | Pass | 1 file, 3 tests passed for mandatory auth helper behavior. |
| 2026-05-25 | `npm.cmd exec -- eslint js/auth-gate.js js/accounts/auth.js vite-plugin-auth-gate.js` | Pass | Targeted lint passed for newly touched auth boundary files. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after auth gate changes. |
| 2026-05-25 | Browser smoke with `MONOCHROME_AUTH_REQUIRED=true` | Pass | Signed-out `/search/test` redirected to `/account`; localhost `Use Test Session` enabled normal `/search/test` navigation afterward. |
| 2026-05-25 | `node --check server/selfhosted/accounts.mjs server/selfhosted/accounts.test.mjs server/selfhosted/server.mjs server/selfhosted/config.mjs` | Pass | Syntax checks passed for account approval store, tests, and touched backend modules. |
| 2026-05-25 | `node --test server/selfhosted/accounts.test.mjs` | Pass | 2 tests passed for first-admin bootstrap, pending blocking, approval, and disabled blocking. |
| 2026-05-25 | `npm.cmd run build` | Pass | Production Vite build and bundle visualizer completed with existing chunk/dynamic-import warnings after account approval backend changes. |

## Milestone History

Append completed milestones here.

| Milestone | Date | Summary | Verification |
| --- | --- | --- | --- |
| M0 - Documentation baseline | 2026-05-24 | Internal docs added for Codex continuity. | Documentation-only status check passed. |
| M5a - Core Musique Hybride | 2026-05-24 | Added additive source-aware track identity and persistence boundary. | JS syntax checks passed; test execution blocked by missing dependencies. |
| Local Uploads Serveur prototype | 2026-05-25 | Added local filesystem upload server, `server-local` tracks, minimal Library UI, direct playback, and favorites/playlists compatibility. | Focused tests, build, syntax checks, direct server smoke, and Playwright UI/player smoke passed. |
| Self-Hosted Checkpoint 1 - Map Current Contracts | 2026-05-25 | Added a concise self-hosted contract map to architecture docs. | Documentation review passed; no runtime validation required. |
| Self-Hosted Checkpoint 2 - Stabilize The Music Source Model | 2026-05-25 | Added additive `server-library`, `radio`, and `youtube-video` source kinds plus exported source normalization helpers. | Focused track-model tests and targeted ESLint passed. |
| Self-Hosted Checkpoint 3 - Prepare A Server Library Client Layer | 2026-05-25 | Added `js/server-library.js` and routed existing upload/list UI through it. | Syntax checks, targeted ESLint, and production build passed. |
| Self-Hosted Checkpoint 4 - Define The Minimal Self-Hosted Backend | 2026-05-25 | Added minimal self-hosted backend config, data directories, `/health`, auth placeholders, env example, and dev script. | Server syntax checks, `/health` smoke, and production build passed. |
| Self-Hosted Checkpoint 5 - Make Filesystem Storage Production-Ready | 2026-05-25 | Added structured local filesystem storage for server-local uploads with sharded audio, metadata, user indexes, stream indexes, and legacy manifest fallback. | Server syntax checks, Node storage tests, direct upload/list/stream smoke, and production build passed. |
| Self-Hosted Checkpoint 6 - Make Authentication Mandatory | 2026-05-25 | Added opt-in self-hosted mandatory auth route guard, config injection, auth readiness wait, account redirect, and localhost-only test-session smoke. | Focused auth-gate tests, syntax checks, targeted ESLint, production build, and browser smoke passed. |
| Self-Hosted Checkpoint 7 - Add Admin Approval For Accounts | 2026-05-25 | Added self-hosted account approval store, first-admin bootstrap, pending-by-default accounts, and account/admin endpoints. | Backend syntax checks, account approval tests, and production build passed. |
| Self-Hosted Checkpoint 8 - Add Admin Account Management | 2026-05-30 | Added Account page admin management UI and self-hosted admin client for account listing, approval, rejection, disabling, and roles. | Backend/account tests, syntax checks, targeted ESLint, production build, and Playwright admin smoke passed. |
| Self-Hosted Checkpoint 9 - Add A Dedicated Uploaded Music Tab | 2026-05-30 | Added Library > Uploaded Music with upload, refresh, count, search entry, standard track list actions, and Local Files separation. | Syntax checks, targeted lint, production build, and Playwright uploaded-music smoke passed. |
| Self-Hosted Checkpoint 10 - Add Server-Side Search For Uploads | 2026-05-30 | Added bounded server-side uploaded-track search through filesystem storage, `/uploads/search`, frontend helpers, and Uploaded Music UI wiring. | Syntax checks, Node storage search tests, targeted lint, HTTP upload search smoke, diff check, and production build passed. |
| Self-Hosted Checkpoint 11 - Add Shared Custom Metadata | 2026-05-30 | Added server-stored uploaded-track metadata editing, `/uploads/:id/metadata`, frontend helpers, and an Uploaded Music context-menu editor. | Syntax checks, Node storage metadata tests, targeted lint, HTTP metadata smoke, and production build passed. |
| Self-Hosted Checkpoint 12 - Extract Basic Audio Metadata On Upload | 2026-05-30 | Added server-side TagLib extraction for uploaded-track defaults and tokenized extracted artwork serving. | Syntax checks, Node storage fixture tests, HTTP extraction smoke, diff check, and production build passed. |
| Self-Hosted Checkpoint 13 - Add A Radio Backend Model | 2026-05-30 | Added a JSON-backed self-hosted radio store plus approved-user and admin radio endpoints. | Syntax checks, radio API tests, existing account tests, diff check, and production build passed. |
| Self-Hosted Checkpoint 14 - Add A Dedicated Radio Tab | 2026-05-30 | Added Library > Radio with self-hosted radio list/create/refresh/search and playback through hybrid radio tracks. | Frontend syntax checks, targeted radio client lint, existing radio API tests, Playwright radio tab smoke, diff check, and production build passed. |
| Self-Hosted Checkpoint 15 - Associate YouTube Clips With Songs | 2026-05-30 | Added shared uploaded-track YouTube clip metadata, local external-track clip associations, context-menu editing, and Track page/Track info embeds. | Syntax checks, storage metadata tests, targeted frontend lint, and production build passed. |
| Self-Hosted Checkpoint 16 - Add Public User Profiles | 2026-05-30 | Added JSON-backed self-hosted profiles, approved-user profile endpoints, frontend profile client, and PocketBase-compatible profile page fallback. | Syntax checks, profile/account/radio endpoint tests, targeted frontend lint, and production build passed. |
| Self-Hosted Checkpoint 17 - Add Song And Playlist Sharing | 2026-05-30 | Added JSON-backed internal shares, approved-user share endpoints, context-menu share creation, `/share/:id` routing, and shared music playback/opening UI. | Syntax checks, share/account/profile/radio endpoint tests, targeted frontend lint, and production build passed. |
| Self-Hosted Checkpoint 18 - Add Social Invitations | 2026-05-30 | Added JSON-backed contact invitations, approved-user invitation endpoints, profile Connect action, and Account page invitation management panel. | Syntax checks, invitation/account/profile/radio/share endpoint tests, targeted frontend lint, and production build passed. |
| Self-Hosted Checkpoint 19 - Add Minimal Chat | 2026-05-30 | Added JSON-backed 1:1 messages, accepted-contact message endpoints, and Account page chat UI. | Syntax checks, message/invitation/account/profile/radio/share endpoint tests, targeted frontend lint, diff check, and production build passed. |
| Self-Hosted Checkpoint 20 - Add Self-Hosted Listening Parties | 2026-05-30 | Added JSON-backed self-hosted party rooms, accepted-contact joins, host playback state, party chat/requests, and self-hosted polling mode in the existing party UI. | Syntax checks, party/all self-hosted endpoint tests, targeted frontend lint, and diff check passed; production build passed after docs. |
| Self-Hosted Checkpoint 21 - Clarify Migration From Existing Services | 2026-05-30 | Added an explicit self-hosted-service frontend boundary, gated profile fallback/social mirroring behind mandatory self-hosted auth, and documented Better Auth/PocketBase/Appwrite/self-hosted ownership. | Syntax checks, focused auth-gate tests, targeted frontend lint, diff check, and production build passed. |
