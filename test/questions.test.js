import cds from '@sap/cds'
import fs from 'node:fs'

const test = cds.test(import.meta.dirname + '/..')
const { expect } = test

/** Question rows from docs/questions.md: | # | Question | Tools | Expected answer | */
const questions = fs.readFileSync(import.meta.dirname + '/../docs/questions.md', 'utf8')
  .split('\n')
  .filter(line => /^\| \d+ \|/.test(line))
  .map(line => {
    const [number, question, tools, answer] = line.split('|').slice(1, -1).map(cell => cell.trim())
    return { number: Number(number), question, tools: [...tools.matchAll(/`([^`]+)`/g)].map(m => m[1]), answer }
  })

async function listTools() {
  const res = await fetch(`${test.url}/mcp/order-status`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Basic ' + Buffer.from('alice:').toString('base64'),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  const data = (await res.text()).split('\n').find(l => l.startsWith('data: ')).slice(6)
  return JSON.parse(data).result.tools.map(t => t.name)
}

describe('Question set (docs/questions.md)', () => {

  it('has 15 numbered questions, each with an expected answer', () => {
    expect(questions.map(q => q.number)).to.deep.equal([...Array(15).keys()].map(i => i + 1))
    for (const q of questions) expect(q.answer, `#${q.number}`).to.not.be.empty
  })

  it('names only tools that exist in tools/list', async () => {
    const available = await listTools()
    for (const q of questions) {
      for (const tool of q.tools) expect(available, `#${q.number} ${q.question}`).to.include(tool)
    }
  })

  it('uses each of the five function tools at least once', () => {
    const used = new Set(questions.flatMap(q => q.tools))
    for (const tool of ['getOrderStatus', 'findOrdersNeedingAttention', 'checkStock', 'listLowStock', 'channelSummary'])
      expect(used.has(tool), tool).to.be.true
  })

  it('includes questions for the query tool and two the agent should decline', () => {
    expect(questions.filter(q => q.tools.includes('query')).length).to.be.at.least(2)
    const declines = questions.filter(q => q.tools.length === 0)
    expect(declines).to.have.length(2)
    for (const q of declines) expect(q.answer).to.match(/^Declines/)
  })
})
