import cds from '@sap/cds'

const { expect } = cds.test(import.meta.dirname + '/..')

// The MCP tools call the service with srv.send, which skips the OData adapter's own
// input checks, so these tests call the service the same way
describe('OrderStatusService called directly (as the MCP tools do)', () => {

  let srv
  before(async () => { srv = await cds.connect.to('OrderStatusService') })

  const alice = new cds.User({ id: 'alice', roles: ['OrderViewer'] })
  const send = (event, data) => srv.tx({ user: alice }, tx => tx.send(event, data))

  it('rejects an impossible calendar date in channelSummary with 400', async () => {
    const err = await send('channelSummary', { fromDate: '2026-02-31', toDate: '2026-09-27' }).catch(e => e)
    expect(err.code).to.equal(400)
    expect(err.message).to.match(/From date must be a date/)
  })

  // The MCP plugin shows err.message to the AI, but CAP only fills in validation messages in the OData adapter
  it('explains which value is missing when a required parameter is blank', async () => {
    const err = await send('getOrderStatus', { orderNumber: ' ' }).catch(e => e)
    expect(err.status).to.equal(400)
    expect(err.message).to.equal('Provide the missing value: Order number, for example SO-1007.')
  })

  it('explains each missing value when several required parameters are missing', async () => {
    const err = await send('channelSummary', {}).catch(e => e)
    const messages = err.details?.map(d => d.message) ?? [err.message]
    expect(messages).to.have.members([
      'Provide the missing value: First order date to include, as YYYY-MM-DD, for example 2026-09-21.',
      'Provide the missing value: Last order date to include, as YYYY-MM-DD, for example 2026-09-27.',
    ])
  })
})
