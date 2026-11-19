# AGENTS.md

Edge Delivery Services. Read a block first. Omissions are in the repo or known.

## Avoid
- `scripts/aem.js` is vendored. Never edit.
- Markup comes from the backend. `curl localhost:3000/x.plain.html` first.
- `buildAutoBlocks` rewrites content before your block runs.
- Authors omit and add cells. Decorate defensively.
- No build step; devDependencies only.
- Scope CSS to `.blockname`; `-wrapper`/`-container` are section classes.
- `fragment/fragment.js` is the only cross-block import. Otherwise use `/scripts/`.

## Outdated
- `fstab.yaml`, `helix-query.yaml`, `paths.json` are retired. Config lives at tools.aem.live.

## Remember
- `npx -y @adobe/aem-cli up`: local code, previewed content.
- Merging `main` ships code; content publishes separately.
- A PR without a `{branch}--{repo}--{owner}.aem.page/{path}` link is rejected.
- All committed files are served. Use `.hlxignore`.
- Skills: `/plugin marketplace add adobe/skills`, then `aem-edge-delivery-services` (23 skills). For docs, search `site:www.aem.live <terms>`.

## LPG lab
- The hard rules in `../AGENTS.md` apply here: no secrets, no real personal data, no `@dropins/*`, nothing pushed.
- Blocks never call GraphQL. Use `scripts/commerce/` (contract in its README).
- Site, locale and store view come from `config/sites.json` through `scripts/site-config.js`.
- Local content lives in `drafts/` as `.plain.html`. Serve with `aem up --html-folder drafts --html-mount /`.
- Run `npm run lint` and `npm test` before saying a change is done.
