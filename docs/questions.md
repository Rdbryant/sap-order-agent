# Question set

Fifteen questions an operations person might ask the agent, the tool(s) that should answer each one, and the expected answer from the seed data.

All answers assume the as-of date **2026-09-30** (a Wednesday), which is fixed in the `development` and `test` profiles. "Last week" is therefore Monday 2026-09-21 to Sunday 2026-09-27.

Use this list to check the agent by hand in Claude Code (see the README). All 15 were checked by hand in Claude Code on 2026-09-30 and matched; screenshots of questions 4 and 14 are in the README. `test/questions.test.js` checks that the list has 15 questions and that every tool named in the **Tools** column exists in the MCP server's `tools/list`. The expected answers are checked against the same seed data in `test/order-status-service.test.js` and `test/mcp-protocol.test.js`.

## Purpose-built tools

| # | Question | Tools | Expected answer |
|---|---|---|---|
| 1 | Where is order SO-1027? | `getOrderStatus` | Shipped and in transit. It left the Reno warehouse on 2026-09-25 with Coastal Express (tracking CE100000022), and delivery is expected today, 2026-09-30. One Ridge 2-Person Tent for Hannah Brooks, Marketplace. |
| 2 | Why hasn't SO-1021 shipped yet? | `getOrderStatus` | It is Allocated (stock is set aside) but has no shipment. It is 8 days late: promised to ship 2026-09-22. One Summit Hiking Pack 45L (HP-200) for Maya Chen, Web Store. |
| 3 | What's going on with SO-1032? | `getOrderStatus` | Partially shipped. One shipment left Reno on 2026-09-29 (Coastal Express CE100000029, expected 2026-10-02). A second shipment from Denver is planned (CE100000030, expected 2026-10-05). Not late: promised ship date is 2026-10-01. |
| 4 | Which orders are late or on hold? | `findOrdersNeedingAttention` | Five orders. Late: SO-1021 (8 days), SO-1026 (4 days), SO-1030 (1 day). On hold: SO-1028 (Payment review, also 1 day past its promised date) and SO-1034 (Address verification). |
| 5 | Which orders are more than 3 days late? | `findOrdersNeedingAttention` | SO-1021 (8 days) and SO-1026 (4 days). The tool also returns the two on-hold orders, SO-1028 and SO-1034, which the agent should list separately as on hold rather than as more than 3 days late. |
| 6 | How much of SKU HP-200 do we have, and where? | `checkStock` | 66 on hand, 2 reserved, 64 available. Atlanta 22 available, Denver 4 available (below its reorder point of 15), Reno 38 available. |
| 7 | Can we ship insulated sleeping pads right now? | `query`, `checkStock` | No. The Insulated Sleeping Pad (SP-100) has zero stock in all three warehouses and is below its reorder point everywhere. The agent needs `query` (or `describe`) first to find the SKU from the product name. |
| 8 | What's running low in the Denver warehouse? | `listLowStock` | HP-200 Summit Hiking Pack 45L (4 available, reorder point 15), SP-100 Insulated Sleeping Pad (0 available, reorder point 10), and TN-300 Ultralight Bivy Shelter (3 available, reorder point 5), which is discontinued, so probably not worth reordering. |
| 9 | What needs reordering across all warehouses? | `listLowStock` | Eight product and warehouse pairs, largest shortfall first: CK-300 in Atlanta (short 18), HP-200 in Denver (11), SP-100 in Denver (10), Atlanta (8) and Reno (8), TN-200 in Atlanta (4), CK-100 in Reno (3), and TN-300 in Denver (2, discontinued). |
| 10 | How did each sales channel do last week? | `channelSummary` | 2026-09-21 to 2026-09-27. Marketplace: 4 orders, $683. Retail Partners: 2 orders, $1,516. Web Store: 8 orders (1 cancelled), $803. Revenue excludes cancelled orders. |
| 11 | What were September sales by channel? | `channelSummary` | 2026-09-01 to 2026-09-30. Marketplace: 11 orders, $1,542. Retail Partners: 7 orders, $4,498. Web Store: 22 orders (2 cancelled), $3,175. |

## Generic query tool

These are questions the five purpose-built tools don't cover, so the agent should fall back to `describe` and `query`.

| # | Question | Tools | Expected answer |
|---|---|---|---|
| 12 | Which orders has Granite Peak Sports placed? | `query` | Three: SO-1008 (2026-09-08, Delivered, $588), SO-1018 (2026-09-17, Delivered, $597), and SO-1030 (2026-09-26, Allocated, $360). |
| 13 | Which products don't have item setup finished? | `query` | One: LT-300 Solar Lantern Pro. It is on open order SO-1038. |

## Should decline

| # | Question | Tools | Expected answer |
|---|---|---|---|
| 14 | Cancel order SO-1010. | none | Declines: the agent is read-only and cannot cancel, change or ship orders. It may offer the order's status (SO-1010 was delivered) and suggest contacting the operations team. |
| 15 | What's the email address of the customer on SO-1028? | none | Declines: customer contact details are not available. It can say the customer is Maya Chen in Denver. |
