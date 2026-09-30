import cds from '@sap/cds'

const test = cds.test(import.meta.dirname + '/..')
const { expect } = test

const FUNCTIONS = ['getOrderStatus', 'findOrdersNeedingAttention', 'checkStock', 'listLowStock', 'channelSummary']

/** Sends one JSON-RPC message to the MCP endpoint as alice and returns the parsed reply */
async function mcp(method, params, id = 1) {
  const res = await fetch(`${test.url}/mcp/order-status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Basic ' + Buffer.from('alice:').toString('base64'),
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, ...id !== null && { id } }),
  })
  expect(res.status, method).to.be.oneOf([200, 202])
  const text = await res.text()
  if (!text) return
  // Streamable HTTP answers either with plain JSON or with a server-sent event
  const json = res.headers.get('content-type')?.includes('text/event-stream')
    ? text.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('')
    : text
  return JSON.parse(json)
}

const callTool = (name, args) => mcp('tools/call', { name, arguments: args }).then(r => r.result)

describe('MCP protocol over HTTP (as alice)', () => {

  it('initializes with server info and instructions', async () => {
    const { result } = await mcp('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'protocol-test', version: '1.0.0' },
    })
    expect(result.serverInfo.name).to.equal('OrderStatusService')
    expect(result.capabilities).to.have.property('tools')
    expect(result.instructions).to.include('getOrderStatus')
    await mcp('notifications/initialized', {}, null)
  })

  it('lists the five function tools plus describe and query', async () => {
    const { result } = await mcp('tools/list', {})
    expect(result.tools.map(t => t.name).sort()).to.deep.equal([...FUNCTIONS, 'describe', 'query'].sort())
  })

  it('returns the status of a known order from getOrderStatus', async () => {
    const result = await callTool('getOrderStatus', { orderNumber: 'SO-1007' })
    expect(result.isError).to.not.equal(true)
    expect(result.structuredContent.result).to.containSubset({
      orderNumber: 'SO-1007', status: 'Delivered', channel: 'Web Store', isLate: false,
    })
    expect(result.content[0].text).to.include('Delivered')
  })

  it('returns list results from findOrdersNeedingAttention', async () => {
    const result = await callTool('findOrdersNeedingAttention', {})
    expect(result.structuredContent.result.map(o => o.orderNumber)).to.deep.equal(['SO-1021', 'SO-1026', 'SO-1028', 'SO-1030', 'SO-1034'])
  })

  it('reports an unknown order as a readable tool error', async () => {
    const result = await callTool('getOrderStatus', { orderNumber: 'SO-9999' })
    expect(result.isError).to.be.true
    expect(result.content[0].text).to.include('Order SO-9999 was not found')
  })

  it('answers questions the functions do not cover with the query tool', async () => {
    const result = await callTool('query', { cql: `SELECT orderNumber from Orders where customer.name = 'Maya Chen' order by orderNumber` })
    expect(result.isError).to.not.equal(true)
    expect(result.structuredContent.data.map(o => o.orderNumber)).to.deep.equal(['SO-1001', 'SO-1011', 'SO-1021', 'SO-1028'])
  })

  it('refuses writes through the query tool', async () => {
    const result = await callTool('query', { cql: `DELETE from Orders where orderNumber = 'SO-1007'` })
    expect(result.isError).to.be.true
    expect(result.content[0].text).to.match(/expecting .*select/i)
    const order = await SELECT.one.from('orderagent.Orders').where({ orderNumber: 'SO-1007' })
    expect(order).to.exist
  })

  it('does not reveal customer contact details through describe', async () => {
    const result = await callTool('describe', { entities: ['Customers'] })
    const elements = Object.keys(result.structuredContent.entities.Customers.elements)
    expect(elements.sort()).to.deep.equal(['ID', 'city', 'name', 'orders'])
    expect(result.content[0].text).to.not.match(/email|phone|address/i)
  })
})
