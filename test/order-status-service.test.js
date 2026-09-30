import cds from '@sap/cds'

const { GET, expect, defaults } = cds.test(import.meta.dirname + '/..')
defaults.auth = { username: 'alice', password: '' }

const fn = path => GET(`/odata/v4/order-status/${path}`).then(res => res.data)

/** Rejects with the HTTP status and message of a failed call */
const failure = path => GET(`/odata/v4/order-status/${path}`).then(
  () => { throw new Error(`Expected ${path} to fail`) },
  err => ({ status: err.response.status, message: err.response.data.error.message }),
)

describe('OrderStatusService functions', () => {

  describe('getOrderStatus', () => {

    it('returns a delivered order with its lines and shipment', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1001')`)
      expect(order).to.containSubset({
        orderNumber: 'SO-1001', status: 'Delivered', channel: 'Web Store', customerName: 'Maya Chen',
        orderDate: '2026-09-01', promisedShipDate: '2026-09-02', isLate: false, daysLate: 0,
        items: [
          { lineNumber: 1, sku: 'HP-100', productName: 'Trailhead Daypack 20L', quantity: 1 },
          { lineNumber: 2, sku: 'LT-100', productName: 'Headlamp 350 Lumen', quantity: 1 },
        ],
        shipments: [{ carrier: 'RapidParcel', status: 'Delivered', deliveredAt: '2026-09-05', estimatedDelivery: '2026-09-05' }],
      })
    })

    it('returns an order in transit with its estimated delivery', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1027')`)
      expect(order).to.containSubset({ status: 'Shipped', isLate: false })
      expect(order.shipments).to.containSubset([{ status: 'InTransit', shippedAt: '2026-09-25', estimatedDelivery: '2026-09-30', deliveredAt: null }])
    })

    it('flags a late order with days late', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1021')`)
      expect(order).to.containSubset({ status: 'Allocated', isLate: true, daysLate: 8, shipments: [] })
    })

    it('does not flag an order due today as late', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1036')`)
      expect(order).to.containSubset({ promisedShipDate: '2026-09-30', isLate: false, daysLate: 0 })
    })

    it('returns the hold reason for an order on hold', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1034')`)
      expect(order).to.containSubset({ status: 'OnHold', holdReason: 'Address verification' })
    })

    it('returns a cancelled order without flagging it late', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1011')`)
      expect(order).to.containSubset({ status: 'Cancelled', isLate: false, shipments: [] })
    })

    it('lists the sent shipment before the planned one for a partial shipment', async () => {
      const order = await fn(`getOrderStatus(orderNumber='SO-1032')`)
      expect(order.status).to.equal('PartiallyShipped')
      expect(order.shipments.map(s => s.status)).to.deep.equal(['InTransit', 'Planned'])
      expect(order.shipments[1]).to.containSubset({ shippedAt: null, estimatedDelivery: '2026-10-05' })
    })

    it('accepts lower case and bare order numbers', async () => {
      expect(await fn(`getOrderStatus(orderNumber='so-1007')`)).to.containSubset({ orderNumber: 'SO-1007' })
      expect(await fn(`getOrderStatus(orderNumber='1007')`)).to.containSubset({ orderNumber: 'SO-1007' })
    })

    it('returns 404 with a helpful message for an unknown order', async () => {
      const { status, message } = await failure(`getOrderStatus(orderNumber='SO-9999')`)
      expect(status).to.equal(404)
      expect(message).to.match(/SO-9999 was not found/)
    })
  })

  describe('findOrdersNeedingAttention', () => {

    it('returns late and on-hold orders, most days late first', async () => {
      const { value } = await fn(`findOrdersNeedingAttention()`)
      expect(value.map(o => [o.orderNumber, o.reason, o.daysLate])).to.deep.equal([
        ['SO-1021', 'Late', 8],
        ['SO-1026', 'Late', 4],
        ['SO-1028', 'OnHold', 1],
        ['SO-1030', 'Late', 1],
        ['SO-1034', 'OnHold', 0],
      ])
      expect(value).to.containSubset([{ orderNumber: 'SO-1028', holdReason: 'Payment review', customerName: 'Maya Chen' }])
    })

    it('treats daysLate 0 like no value', async () => {
      const all = await fn(`findOrdersNeedingAttention()`)
      const zero = await fn(`findOrdersNeedingAttention(daysLate=0)`)
      expect(zero.value).to.deep.equal(all.value)
    })

    it('keeps only orders more than daysLate days late, but always keeps on-hold orders', async () => {
      const { value } = await fn(`findOrdersNeedingAttention(daysLate=3)`)
      expect(value.map(o => o.orderNumber)).to.deep.equal(['SO-1021', 'SO-1026', 'SO-1028', 'SO-1034'])
    })

    it('returns only on-hold orders when nothing is that late', async () => {
      const { value } = await fn(`findOrdersNeedingAttention(daysLate=30)`)
      expect(value.every(o => o.reason === 'OnHold')).to.be.true
      expect(value).to.have.length(2)
    })

    it('excludes shipped, delivered, cancelled and partially shipped orders that are not late', async () => {
      const { value } = await fn(`findOrdersNeedingAttention()`)
      const statuses = new Set(value.map(o => o.status))
      for (const s of ['Shipped', 'Delivered', 'Cancelled', 'PartiallyShipped']) expect(statuses.has(s), s).to.be.false
    })

    it('rejects a negative daysLate with 400', async () => {
      const { status, message } = await failure(`findOrdersNeedingAttention(daysLate=-1)`)
      expect(status).to.equal(400)
      expect(message).to.match(/cannot be negative/)
    })
  })

  describe('checkStock', () => {

    it('returns stock per warehouse and totals', async () => {
      const stock = await fn(`checkStock(sku='HP-200')`)
      expect(stock).to.containSubset({
        sku: 'HP-200', productName: 'Summit Hiking Pack 45L', productStatus: 'Active', setupComplete: true,
        totalOnHand: 66, totalReserved: 2, totalAvailable: 64, belowReorderPointAnywhere: true,
      })
      expect(stock.warehouses.map(w => [w.warehouse, w.available, w.belowReorderPoint])).to.deep.equal([
        ['ATL', 22, false], ['DEN', 4, true], ['RNO', 38, false],
      ])
    })

    it('reports zero stock everywhere', async () => {
      const stock = await fn(`checkStock(sku='SP-100')`)
      expect(stock).to.containSubset({ totalOnHand: 0, totalAvailable: 0, belowReorderPointAnywhere: true })
      expect(stock.warehouses).to.have.length(3)
    })

    it('reports a discontinued product', async () => {
      expect(await fn(`checkStock(sku='TN-300')`)).to.containSubset({ productStatus: 'Discontinued' })
    })

    it('reports a product whose item setup is not complete', async () => {
      expect(await fn(`checkStock(sku='LT-300')`)).to.containSubset({ setupComplete: false })
    })

    it('reports a product that is fine everywhere', async () => {
      expect(await fn(`checkStock(sku='LT-100')`)).to.containSubset({ belowReorderPointAnywhere: false, totalAvailable: 152 })
    })

    it('accepts a lower case SKU', async () => {
      expect(await fn(`checkStock(sku='hp-200')`)).to.containSubset({ sku: 'HP-200' })
    })

    it('returns 404 with a helpful message for an unknown SKU', async () => {
      const { status, message } = await failure(`checkStock(sku='XX-999')`)
      expect(status).to.equal(404)
      expect(message).to.match(/XX-999 was not found/)
    })
  })

  describe('listLowStock', () => {

    it('lists everything below reorder point across warehouses, largest shortfall first', async () => {
      const { value } = await fn(`listLowStock()`)
      expect(value.map(r => `${r.sku}@${r.warehouse}`)).to.deep.equal([
        'CK-300@ATL', 'HP-200@DEN', 'SP-100@DEN', 'SP-100@ATL', 'SP-100@RNO', 'TN-200@ATL', 'CK-100@RNO', 'TN-300@DEN',
      ])
      for (const r of value) expect(r.shortfall, r.sku).to.equal(r.reorderPoint - r.available).and.be.above(0)
    })

    it('limits the list to one warehouse and flags discontinued products', async () => {
      const { value } = await fn(`listLowStock(warehouse='DEN')`)
      expect(value.map(r => [r.sku, r.isDiscontinued])).to.deep.equal([['HP-200', false], ['SP-100', false], ['TN-300', true]])
    })

    it('does not list a product that is only low elsewhere', async () => {
      const { value } = await fn(`listLowStock(warehouse='RNO')`)
      expect(value.map(r => r.sku)).to.not.include('HP-200')
    })

    it('accepts a lower case warehouse code', async () => {
      const { value } = await fn(`listLowStock(warehouse='den')`)
      expect(value).to.have.length(3)
    })

    it('returns 404 listing valid codes for an unknown warehouse', async () => {
      const { status, message } = await failure(`listLowStock(warehouse='NYC')`)
      expect(status).to.equal(404)
      expect(message).to.match(/DEN \(Denver\), RNO \(Reno\), ATL \(Atlanta\)/)
    })
  })

  describe('channelSummary', () => {

    it('summarizes orders per channel for a date range, excluding cancelled orders from revenue', async () => {
      const { value } = await fn(`channelSummary(fromDate=2026-09-21,toDate=2026-09-27)`)
      expect(value).to.deep.equal([
        { channel: 'MKT', channelName: 'Marketplace', orderCount: 4, cancelledCount: 0, revenue: 683, currency: 'USD' },
        { channel: 'RTL', channelName: 'Retail Partners', orderCount: 2, cancelledCount: 0, revenue: 1516, currency: 'USD' },
        { channel: 'WEB', channelName: 'Web Store', orderCount: 8, cancelledCount: 1, revenue: 803, currency: 'USD' },
      ])
    })

    it('summarizes the whole month', async () => {
      const { value } = await fn(`channelSummary(fromDate=2026-09-01,toDate=2026-09-30)`)
      expect(value.map(r => [r.channel, r.orderCount, r.cancelledCount, r.revenue])).to.deep.equal([
        ['MKT', 11, 0, 1542], ['RTL', 7, 0, 4498], ['WEB', 22, 2, 3175],
      ])
    })

    it('includes orders on both boundary dates', async () => {
      const { value } = await fn(`channelSummary(fromDate=2026-09-01,toDate=2026-09-01)`)
      expect(value.map(r => [r.channel, r.orderCount])).to.deep.equal([['MKT', 1], ['RTL', 0], ['WEB', 1]])
    })

    it('returns every channel with zeros when there are no orders', async () => {
      const { value } = await fn(`channelSummary(fromDate=2025-01-01,toDate=2025-01-31)`)
      expect(value).to.have.length(3)
      for (const r of value) expect(r).to.containSubset({ orderCount: 0, cancelledCount: 0, revenue: 0 })
    })

    it('rejects a from date after the to date with 400', async () => {
      const { status, message } = await failure(`channelSummary(fromDate=2026-09-27,toDate=2026-09-21)`)
      expect(status).to.equal(400)
      expect(message).to.match(/is after to date/)
    })
  })
})
