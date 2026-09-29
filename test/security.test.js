import cds from '@sap/cds'

const test = cds.test(import.meta.dirname + '/..')
const { expect } = test

const USERS = {
  anonymous: undefined,
  alice: 'alice:',     // OrderViewer
  bob: 'bob:',         // no roles
  mallory: 'mallory:', // not a known user
}

/** HTTP status of a request made as the given user, never throws */
async function statusAs(user, method, path, body) {
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }
  if (USERS[user]) headers.authorization = 'Basic ' + Buffer.from(USERS[user]).toString('base64')
  const res = await fetch(test.url + path, { method, headers, body: body && JSON.stringify(body) })
  return res.status
}

const MCP = '/mcp/order-status'
const initialize = {
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'security-test', version: '1.0.0' } },
}
const toolCall = {
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: { name: 'getOrderStatus', arguments: { orderNumber: 'SO-1007' } },
}

describe('Security', () => {

  describe('OData endpoint', () => {

    for (const path of [
      '/odata/v4/order-status/Orders',
      '/odata/v4/order-status/Customers',
      `/odata/v4/order-status/getOrderStatus(orderNumber='SO-1007')`,
      '/odata/v4/order-status/findOrdersNeedingAttention()',
    ]) {
      it(`${path}: anonymous 401, bob 403, alice 200`, async () => {
        expect(await statusAs('anonymous', 'GET', path)).to.equal(401)
        expect(await statusAs('bob', 'GET', path)).to.equal(403)
        expect(await statusAs('alice', 'GET', path)).to.equal(200)
      })
    }

    it('rejects an unknown user with 401', async () => {
      expect(await statusAs('mallory', 'GET', '/odata/v4/order-status/Orders')).to.equal(401)
    })
  })

  describe('MCP endpoint', () => {

    it('initialize: anonymous 401, bob 403, alice 200', async () => {
      expect(await statusAs('anonymous', 'POST', MCP, initialize)).to.equal(401)
      expect(await statusAs('bob', 'POST', MCP, initialize)).to.equal(403)
      expect(await statusAs('alice', 'POST', MCP, initialize)).to.equal(200)
    })

    it('tools/call: anonymous 401, bob 403, alice 200', async () => {
      expect(await statusAs('anonymous', 'POST', MCP, toolCall)).to.equal(401)
      expect(await statusAs('bob', 'POST', MCP, toolCall)).to.equal(403)
      expect(await statusAs('alice', 'POST', MCP, toolCall)).to.equal(200)
    })

    it('rejects an unknown user with 401', async () => {
      expect(await statusAs('mallory', 'POST', MCP, initialize)).to.equal(401)
    })
  })

  // MCP tools run functions with srv.send, so the role check must hold there too
  describe('Direct service calls', () => {

    const sendAs = async (user, event, data) => {
      const srv = await cds.connect.to('OrderStatusService')
      return srv.tx({ user }, tx => tx.send(event, data)).catch(e => e)
    }

    it('rejects a user without the OrderViewer role with 403', async () => {
      const err = await sendAs(new cds.User({ id: 'bob', roles: [] }), 'getOrderStatus', { orderNumber: 'SO-1007' })
      expect(err.code).to.equal(403)
    })

    it('rejects an anonymous user with 401', async () => {
      const err = await sendAs(cds.User.anonymous, 'checkStock', { sku: 'HP-200' })
      expect(err.code).to.equal(401)
    })

    it('allows an OrderViewer', async () => {
      const order = await sendAs(new cds.User({ id: 'alice', roles: ['OrderViewer'] }), 'getOrderStatus', { orderNumber: 'SO-1007' })
      expect(order).to.containSubset({ orderNumber: 'SO-1007' })
    })
  })

  describe('Read-only', () => {

    for (const [method, path, body] of [
      ['POST', '/odata/v4/order-status/Orders', { orderNumber: 'SO-9001', status: 'Open' }],
      ['PATCH', `/odata/v4/order-status/Orders('SO-1007')`, { status: 'Cancelled' }],
      ['PUT', `/odata/v4/order-status/Orders('SO-1007')`, { status: 'Cancelled' }],
      ['DELETE', `/odata/v4/order-status/Orders('SO-1007')`],
      ['PATCH', `/odata/v4/order-status/Inventory(product_sku='HP-200',warehouse_code='DEN')`, { onHand: 999 }],
      ['DELETE', `/odata/v4/order-status/Shipments('RP100000001')`],
    ]) {
      it(`rejects ${method} ${path.split('/').pop()} even for alice`, async () => {
        expect(await statusAs('alice', method, path, body)).to.equal(405)
      })
    }

    it('leaves the data unchanged', async () => {
      const order = await SELECT.one.from('orderagent.Orders').where({ orderNumber: 'SO-1007' })
      expect(order.status).to.equal('Delivered')
      expect(await SELECT.one.from('orderagent.Orders').where({ orderNumber: 'SO-9001' })).to.be.undefined
    })

    it('marks the service and every exposed entity read-only', () => {
      const srv = cds.model.definitions.OrderStatusService
      expect(srv['@readonly']).to.be.true
      expect(srv['@requires']).to.equal('OrderViewer')
      const entities = Object.values(srv.entities)
      expect(entities).to.have.length(8)
      for (const entity of entities) {
        expect(entity['@readonly'], entity.name).to.be.true
      }
    })

    it('defines no actions, only functions', () => {
      const operations = Object.values(cds.model.definitions).filter(d => d.kind === 'action' || d.kind === 'function')
      expect(operations.map(d => d.name)).to.have.length(5)
      expect(operations.filter(d => d.kind === 'action').map(d => d.name)).to.be.empty
      for (const e of cds.model.each('entity')) expect(Object.keys(e.actions ?? {}), e.name).to.be.empty
    })
  })
})
