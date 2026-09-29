# CLAUDE.md

Guidance for Claude Code in this repo. The full build plan is in `SPEC.md`; follow its phases in order.

## Project

Read-only order status agent: SAP CAP (Node.js, `@sap/cds` 10) service exposed over MCP with `@cap-js/mcp`. Fictional data, SQLite locally. ES modules (`"type": "module"`).

## Commands

- `npm ci`: install
- `npm run watch`: dev server on http://localhost:4004 (also autowires the MCP server into Claude Code as `cds:OrderStatusService`)
- `npm test`: tests
- `npm run lint`: ESLint
- `npm run mcp:card`: print the MCP server card (tools, descriptions, schemas)

(Add the `npm` scripts in SPEC section 8 if they don't exist yet.)

## Rules

- **Read-only.** Never add actions, write handlers, or anything that changes data.
- **CDS first.** Model types, enums and return structures in CDS. Keep JS handlers thin.
- **Descriptions are product surface.** Every exposed entity, element, function and parameter gets a doc comment in business language. Function doc comments must not end with a period (the plugin appends `. Returns: ...`). Check with `npm run mcp:card` after changing them.
- **Dates** come from `srv/lib/clock.js`, never `new Date()` directly in handlers.
- **Errors:** use CAP errors with correct status codes (`req.reject(404, ...)`, `req.reject(400, ...)`) and messages a non-engineer can understand.
- **Privacy:** never expose customer contact details.
- **Tests:** add or update tests with every change. A bug fix starts with a failing test. Run `npm test` and `npm run lint` before every commit.
- **Git:** one branch per phase, small commits with clear messages in the imperative ("Add checkStock function"), then `gh pr create` with a summary and test notes. Stop after opening the PR and wait for review.
- **Verify, don't assume.** If a CAP or `@cap-js/mcp` behavior matters, check it (docs at https://cap.cloud.sap/docs, the plugin source in `node_modules/@cap-js/mcp`, or a quick experiment) rather than guessing.
- Don't edit `~/.claude.json` by hand, and don't commit `.env` files, SQLite files or `node_modules`.
