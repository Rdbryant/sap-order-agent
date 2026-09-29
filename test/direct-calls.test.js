import cds from '@sap/cds'

const { expect } = cds.test(import.meta.dirname + '/..')

// The MCP tools call the service with srv.send, which skips the OData adapter's own
// input checks, so these tests call the service the same way
describe('OrderStatusService called directly (as the MCP tools do)', () => {

  let srv
  before(async () => { srv = await cds.connect.to('OrderStatusService') })

  it('rejects an impossible calendar date in channelSummary with 400', async () => {
    const err = await srv.send('channelSummary', { fromDate: '2026-02-31', toDate: '2026-09-27' }).catch(e => e)
    expect(err.code).to.equal(400)
    expect(err.message).to.match(/From date must be a date/)
  })
})
