import cds from '@sap/cds'

const { expect } = cds.test(import.meta.dirname + '/..')

const FUNCTIONS = ['getOrderStatus', 'findOrdersNeedingAttention', 'checkStock', 'listLowStock', 'channelSummary']

describe('MCP server card', () => {

  let card
  before(async () => {
    const csn = await cds.load('*')
    card = cds.compile.to.mcp(csn, { as: 'json' })
  })

  it('lists the five function tools plus describe and query', () => {
    expect(card.tools.map(t => t.name).sort()).to.deep.equal([...FUNCTIONS, 'describe', 'query'].sort())
  })

  it('marks every function tool read-only', () => {
    for (const tool of card.tools.filter(t => FUNCTIONS.includes(t.name))) {
      expect(tool.annotations, tool.name).to.containSubset({ readOnlyHint: true, destructiveHint: false })
    }
  })

  it('gives every function tool and parameter a description', () => {
    for (const tool of card.tools.filter(t => FUNCTIONS.includes(t.name))) {
      expect(tool.description, tool.name).to.be.a('string').and.match(/Use this when/)
      for (const [param, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect(schema.description, `${tool.name}.${param}`).to.be.a('string').and.not.be.empty
        expect(schema.description, `${tool.name}.${param}`).to.match(/for example/)
      }
    }
  })

  it('has no doubled periods in any description', () => {
    for (const tool of card.tools) {
      expect(tool.description, tool.name).to.not.include('..')
      for (const [param, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        expect(schema.description ?? '', `${tool.name}.${param}`).to.not.include('..')
      }
    }
  })

  it('requires order number, SKU and dates, and leaves the filters optional', () => {
    const required = Object.fromEntries(card.tools.map(t => [t.name, t.inputSchema.required ?? []]))
    expect(required).to.containSubset({
      getOrderStatus: ['orderNumber'],
      findOrdersNeedingAttention: [],
      checkStock: ['sku'],
      listLowStock: [],
      channelSummary: ['fromDate', 'toDate'],
    })
  })

  it('sends instructions that steer the AI to the purpose-built tools', () => {
    for (const name of FUNCTIONS) expect(card.instructions).to.include(name)
    expect(card.instructions).to.match(/read-only/)
  })
})
