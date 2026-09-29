import cds from '@sap/cds'

/**
 * "Today" for all business logic, as an ISO date (YYYY-MM-DD).
 * Returns cds.env.app.asOfDate when set (development and test profiles),
 * so demos and tests are deterministic; otherwise the current UTC date.
 */
export function today() {
  return cds.env.app?.asOfDate ?? new Date().toISOString().slice(0, 10)
}

/** Whole days from ISO date `from` to ISO date `to` (negative when `to` is earlier) */
export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
}
