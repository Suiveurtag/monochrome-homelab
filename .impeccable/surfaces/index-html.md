---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["js/admin.js","styles.css","js/access-control.js","pb_migrations/1719202000_admin_control_center.js"]
---

# Admin Control Room

- Scope: `index.html#page-admin`, `js/admin.js`, `styles.css`, `js/access-control.js`, and the matching PocketBase migration.
- Mode: established-world surface extension.
- Primary job: let an instance administrator understand service health, manage member access, set global capabilities, toggle product areas, and update instance identity without leaving Monochrome.
- Direction: option A, an operator-console composition built from flat ink surfaces, precise rules, a dense member ledger, an in-context inspector, and restrained motion. Concept seed: `f18fcf08`.
- Approved reference: `.impeccable/mocks/admin-console-a.png`.
- First viewport: service status, four operational metrics, member filters, and the beginning of the member ledger.
- Navigation: Overview, Members, Permissions, Features, Instance; local navigation becomes horizontally scrollable when the content column is constrained.
- Member management: search and filter, selection and bulk status actions, role/status editor, password reset, delete account, self-protection, and last-admin protection.
- Instance controls: global upload/edit/delete/download/post/party permissions; Social, stats, catalogue, and listening-party feature flags; instance name and support email.
- Responsive behavior: container-driven layout; table metadata progressively collapses, inspector becomes a full-width overlay, metrics become a 2x2 grid, and controls stack at phone widths.
- Accessibility: semantic landmarks and tables, labelled inputs and switches, keyboard-visible focus, reduced-motion fallback, non-color status copy, and destructive-action confirmation.
- Reused inventory: existing Monochrome tokens, buttons, form controls, Lucide icons, PocketBase client, auth gate, notifications, and route shell. No new image assets are required.
- Constraints: admins retain policy bypass; disabled features are hidden and route-guarded for members; server rules enforce catalogue and social permissions; destructive member and track actions remain explicit.
