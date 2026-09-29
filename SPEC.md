# SAP Order Agent: Build Spec

A read-only AI agent for order, inventory and shipment questions, built as an SAP CAP (Node.js) service and exposed to AI assistants over the Model Context Protocol (MCP) with SAP's official `@cap-js/mcp` plugin.

This is a portfolio project with **fictional data**. It should look and behave like a small production agent: clear tools, role-based security, read-only access, automated tests, CI, and documentation.

Read `CLAUDE.md` for working rules before starting.

---

## 1. Goal

An operations person (or an AI assistant acting for them) should be able to ask plain business questions and get correct answers from live data:

- "Where is order SO-1007?"
- "Which orders are late or on hold?"
- "How much of SKU HP-200 do we have, and where?"
- "What's running low in the Denver warehouse?"
- "How did each sales channel do last week?"

The agent must never change data.

## 2. Tech stack (already scaffolded)

- SAP CAP, Node.js, `@sap/cds` ^10 (needs Node 22+, Node 24 recommended). The project is an ES module (`"type": "module"`).
- `@cap-js/mcp` ^1.5 (beta). Exposes any service annotated `@mcp` at `/mcp/<service-slug>` over streamable HTTP.
- `@cap-js/sqlite` for local development and tests.
- `package.json` already sets `cds.mcp.per_action_tool: true`, so each CDS function becomes its own MCP tool, alongside the plugin's generic `describe` and `query` tools.

Verified facts about the plugin (checked against v1.5.0, don't re-derive):

- Tool and parameter descriptions come from CDS doc comments (`/** ... */`), `@title`, and `@description`. The plugin appends `. Returns: <type>` to function descriptions, so **don't end function doc comments with a period** (it would produce `..`).
- `@mcp.instructions: '...'` on the service sets the server instructions sent to the AI at initialization.
- Access control follows CAP: `@requires` / `@restrict` on the service and entities. Unauthenticated calls get 401, users without the role get 403.
- In the `development` profile, `cds watch` automatically registers the server in Claude Code's config (`~/.claude.json`) as `cds:OrderStatusService`, authenticating as the mocked user `alice`, and removes it on exit. Don't edit `~/.claude.json` by hand.
- `npx cds compile srv -2 mcp` prints the MCP server card (all tools, descriptions and input schemas). Use it to check tool descriptions.

## 3. Domain model (`db/schema.cds`)

Namespace: `orderagent`. Use `cuid` or natural keys as noted, and `managed` where timestamps help. Every entity and element that an AI will see gets a short doc comment.

| Entity | Key fields | Purpose |
|---|---|---|
| `Channels` | `code` (e.g. `WEB`, `MKT`, `RTL`) | Sales channel: own web store, a third-party marketplace, a retail partner |
| `Warehouses` | `code` (e.g. `DEN`, `RNO`, `ATL`) | Name, city, state |
| `Products` | `sku` | Name, category, `status` (Active, Discontinued), `setupComplete` (Boolean, item setup finished) |
| `Inventory` | `product` + `warehouse` | `onHand`, `reserved`, `reorderPoint`. Available = onHand minus reserved (calculated element) |
| `Customers` | `ID` | Name and city only. **No email, phone or address** |
| `Orders` | `orderNumber` (e.g. `SO-1001`) | `channel`, `customer`, `orderDate`, `promisedShipDate`, `status`, `holdReason`, `totalAmount`, `currency` |
| `OrderItems` | `order` + `lineNumber` | `product`, `quantity`, `unitPrice` |
| `Shipments` | `trackingNumber` | `order`, `warehouse`, `carrier`, `shippedAt`, `estimatedDelivery`, `deliveredAt`, `status` |

Order `status` values: `Open`, `Allocated`, `PartiallyShipped`, `Shipped`, `Delivered`, `OnHold`, `Cancelled`. Model statuses as CDS enums.

### Seed data (`db/data/*.csv`)

Fictional and consistent. Roughly 3 channels, 3 warehouses, 15 products, 10 customers, 40 orders, 50 order items, 30 shipments. The data must include at least one of each of these, because tests depend on them:

- An order delivered on time
- An order shipped and in transit
- An order past its promised ship date and not shipped (late)
- An order on hold, with a hold reason (e.g. "Payment review")
- A cancelled order
- A partially shipped order (two shipments planned, one sent)
- A product below its reorder point in one warehouse but fine in another
- A product with zero stock everywhere
- A discontinued product
- A product whose item setup isn't complete

Dates cluster around September 2026. See "Dates and the as-of clock" below.

## 4. Service (`srv/order-status-service.cds` + `srv/order-status-service.js`)

```cds
/** Read-only answers about orders, inventory and shipments */
@mcp
@mcp.instructions: '...'   // see below
@readonly
@requires: 'OrderViewer'
service OrderStatusService { ... }
```

Expose read-only projections of the entities above, **excluding anything sensitive** (customers show name and city only). Keep the projections small: only fields that help answer questions.

### Functions (each becomes an MCP tool)

Implement in `srv/order-status-service.js`. All are CDS `function`s (read-only by definition, never `action`s). Return structured types defined in the CDS, not strings.

1. **`getOrderStatus(orderNumber: String)`**
   Returns status, channel, order date, promised ship date, hold reason, `isLate` flag, line items (SKU, name, quantity), and shipments (carrier, tracking number, status, estimated or actual delivery). Not found returns a clear CAP error (404) with a helpful message, not an empty result.

2. **`findOrdersNeedingAttention(daysLate: Integer)`**
   `daysLate` is optional; treat a missing value as 0. Orders that are late (promised ship date more than `daysLate` days before the as-of date and not shipped) or on hold. Each row includes the reason (`Late`, `OnHold`), days late, and hold reason. Sorted most urgent first.

3. **`checkStock(sku: String)`**
   Per-warehouse onHand, reserved and available, plus totals, product status and whether it's below reorder point anywhere. Unknown SKU returns 404.

4. **`listLowStock(warehouse: String)`**
   Products where available is below the reorder point. `warehouse` is optional (a warehouse code); when omitted, check all warehouses. Include discontinued products but flag them.

5. **`channelSummary(fromDate: Date, toDate: Date)`**
   Order count, revenue, and cancelled count per channel for orders dated in the range (inclusive). Reject `fromDate` after `toDate` with a 400.

### Tool descriptions (this matters as much as the code)

These are what the AI reads. Each function and parameter needs a doc comment that says:

- What question it answers, in business words ("Use this when someone asks where an order is or when it will arrive")
- Input format with an example (`Order number, for example SO-1007`)
- When **not** to use it, if another tool fits better

Write the service-level `@mcp.instructions` so an AI prefers the five purpose-built tools and only falls back to the generic `query` tool for questions they don't cover.

### Dates and the as-of clock

Put "today" behind one helper (`srv/lib/clock.js`). It returns `cds.env.app.asOfDate` if set, otherwise the real current date. Set `asOfDate: "2026-09-30"` for the `[development]` and `[test]` profiles in `package.json`, so the demo and the tests are deterministic.

## 5. Security

- `@requires: 'OrderViewer'` on the service. `@readonly` on the service and every exposed entity.
- Mocked auth in `package.json` (development and test only):
  - `alice`: roles `OrderViewer` (the demo user; `@cap-js/mcp` autowires Claude Code as alice)
  - `bob`: no roles (used to prove 403)
- No write paths anywhere: no actions, no custom `CREATE`/`UPDATE`/`DELETE` handlers.
- No secrets in the repo. There are none needed for local use.

## 6. Tests (`test/`)

Run `cds add test` to scaffold, then use whatever runner it sets up. Tests run against the in-memory SQLite database with the seed data.

Required coverage:

1. **Each function:** happy path, not found or empty result, and the edge cases from the seed-data list (late, on hold, partial shipment, zero stock, discontinued).
2. **Auth:** anonymous gets 401, `bob` gets 403, `alice` gets 200. Test both the OData endpoint and the MCP endpoint.
3. **Read-only:** POST, PATCH and DELETE against an exposed entity are rejected.
4. **MCP protocol:** over HTTP as `alice`: `initialize`, then `tools/list` returns the five function tools plus `describe` and `query`, then `tools/call getOrderStatus` for a known order returns the expected status.
5. **Tool descriptions:** a test that compiles the MCP server card (`cds.compile(...).to.mcp` or the equivalent the plugin registers; `npx cds compile srv -2 mcp` shows the output) and asserts every function tool and every parameter has a non-empty description, and no description contains `..`.

Rule: every bug found gets a test that fails before the fix.

## 7. Question set (`docs/questions.md`)

Write 15 realistic questions an operations person would ask, each with the tool(s) that should answer it and the expected answer from the seed data. Include a few that should use `query` instead of a function, and two that the agent should decline or say it can't answer (e.g. "Cancel order SO-1010").

Add a test that checks every tool named in `docs/questions.md` exists in `tools/list`.

## 8. CI (`.github/workflows/ci.yml`)

On push and pull request: checkout, set up Node (matrix 22 and 24, npm cache), `npm ci`, `npx cds compile srv -2 mcp` (fails the build if the model doesn't compile), lint, test.

Add `npm` scripts: `test`, `lint`, `watch` (`cds watch`), `mcp:card` (`cds compile srv -2 mcp`).

## 9. README.md

Replace the CAP default readme (delete `readme.md`, create `README.md`; macOS is case-insensitive, so do this in one step). Sections:

1. What it is, in two sentences, and a note that the data is fictional
2. Architecture: a small Mermaid diagram (AI assistant → MCP over HTTP → CAP service → SQLite now, S/4HANA OData or HANA Cloud later)
3. The five tools, one line each
4. Run it locally: `npm ci`, `npm run watch`, then ask Claude Code a question from `docs/questions.md`
5. Security model: roles, read-only, what's excluded
6. Tests and CI (with the Actions badge)
7. How it was built: developed with Claude Code, reviewed and tested by me
8. Roadmap: deploy to SAP BTP Cloud Foundry with XSUAA and HANA Cloud, swap the seed data for an S/4HANA OData source, A2A agent card

## 10. Phases and pull requests

Work on a branch per phase, commit in small steps, and open a pull request with `gh pr create` when the phase's tests pass. Stop after each PR so Davis can review and merge before the next phase.

| Phase | Branch | Done when |
|---|---|---|
| 1. Model and data | `feat/domain-model` | `cds watch` starts, OData shows seed data, schema compiles |
| 2. Service and tools | `feat/order-status-service` | All five functions work, `npm run mcp:card` shows good descriptions |
| 3. Security | `feat/security` | Roles enforced, auth tests pass |
| 4. Tests and CI | `feat/tests-ci` | Full test list in section 6 passes locally and in Actions |
| 5. Questions and README | `docs/readme-questions` | README complete, question set written, manual check in Claude Code done |
| 6. Stretch: A2A | `feat/a2a-agent-card` | Only if time allows (see below) |

Target: phases 1 to 5 done by Wednesday night, September 30, 2026.

### Stretch (only after phase 5 is merged)

- **A2A agent card:** serve an Agent2Agent (A2A) agent card from CAP at the path the current A2A spec defines (check the spec; recent versions use `/.well-known/agent-card.json`). Describe the five capabilities as skills and point at the MCP endpoint. Card only, no A2A task handling, and say so in the README.
- **SAP BTP deployment** (Davis will set up the BTP trial first): `cds add mta,xsuaa,hana`, map `OrderViewer` to an XSUAA role template, deploy to Cloud Foundry. Separate branch and PR.

## 11. Out of scope

- Any write operation, even behind a role
- A UI (the "app" is the AI assistant)
- Real company names, real customer data, or anything copied from an employer's code or documents
