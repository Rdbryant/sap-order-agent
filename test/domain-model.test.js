import cds from '@sap/cds'

const { GET, expect, defaults } = cds.test(import.meta.dirname + '/..')
defaults.auth = { username: 'alice', password: '' }

const AS_OF = '2026-09-30'

describe('Domain model and seed data', () => {

  const Orders = 'orderagent.Orders', Shipments = 'orderagent.Shipments'
  const Inventory = 'orderagent.Inventory', Products = 'orderagent.Products'

  describe('OData', () => {

    it('serves every entity with its seed data', async () => {
      const expected = {
        Channels: 3, Warehouses: 3, Products: 15, Inventory: 36, Customers: 10,
        Orders: 40, OrderItems: 51, Shipments: 30,
      }
      for (const [entity, count] of Object.entries(expected)) {
        const { data } = await GET(`/odata/v4/order-status/${entity}/$count`)
        expect(data, entity).to.equal(count)
      }
    })

    it('returns an order with its lines and shipments', async () => {
      const { data } = await GET`/odata/v4/order-status/Orders('SO-1023')?$expand=items,shipments`
      expect(data).to.containSubset({
        orderNumber: 'SO-1023', status: 'PartiallyShipped', channel_code: 'RTL', totalAmount: '1156.00',
      })
      expect(data.items).to.have.length(2)
      expect(data.shipments).to.have.length(2)
    })

    it('calculates available stock as on hand minus reserved', async () => {
      const { data } = await GET`/odata/v4/order-status/Inventory?$filter=product_sku eq 'HP-200' and warehouse_code eq 'DEN'`
      expect(data.value).to.containSubset([{ onHand: 6, reserved: 2, available: 4 }])
    })

    it('exposes customers with name and city only', async () => {
      const { data } = await GET`/odata/v4/order-status/Customers('C-001')`
      const fields = Object.keys(data).filter(k => !k.startsWith('@'))
      expect(fields.sort()).to.deep.equal(['ID', 'city', 'name'])
    })
  })

  describe('Seed data consistency', () => {

    it('order totals match the sum of their lines', async () => {
      const orders = await SELECT.from(Orders, o => { o.orderNumber, o.totalAmount, o.items(i => { i.quantity, i.unitPrice }) })
      for (const o of orders) {
        const sum = o.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0)
        expect(Number(o.totalAmount), o.orderNumber).to.equal(sum)
      }
    })

    it('shipments match their order status', async () => {
      const orders = await SELECT.from(Orders, o => { o.orderNumber, o.status, o.shipments(s => { s.status }) })
      for (const { orderNumber, status, shipments } of orders) {
        const statuses = shipments.map(s => s.status)
        if (status === 'Delivered') expect(statuses, orderNumber).to.deep.equal(['Delivered'])
        else if (status === 'Shipped') expect(statuses, orderNumber).to.deep.equal(['InTransit'])
        else if (status === 'PartiallyShipped') expect(statuses, orderNumber).to.include('Planned').and.have.length(2)
        else expect(statuses, orderNumber).to.be.empty
      }
    })

    it('only on-hold orders have a hold reason', async () => {
      const withReason = await SELECT.from(Orders).where`holdReason is not null and holdReason != ''`
      const onHold = await SELECT.from(Orders).where({ status: 'OnHold' })
      expect(withReason.map(o => o.orderNumber).sort()).to.deep.equal(onHold.map(o => o.orderNumber).sort())
    })
  })

  describe('Scenarios the tools depend on', () => {

    it('has an order delivered on time', async () => {
      const s = await SELECT.one.from(Shipments).where`order_orderNumber = 'SO-1001'`
      expect(s).to.containSubset({ status: 'Delivered', deliveredAt: '2026-09-05', estimatedDelivery: '2026-09-05' })
    })

    it('has an order shipped and in transit', async () => {
      const o = await SELECT.one.from(Orders).where({ orderNumber: 'SO-1027' })
      const s = await SELECT.from(Shipments).where`order_orderNumber = 'SO-1027'`
      expect(o.status).to.equal('Shipped')
      expect(s).to.containSubset([{ status: 'InTransit', deliveredAt: null }])
    })

    it('has late orders: past promised ship date and not shipped', async () => {
      const late = await SELECT.from(Orders).columns('orderNumber', 'promisedShipDate')
        .where`status in ('Open', 'Allocated') and promisedShipDate < ${AS_OF}`
        .orderBy('promisedShipDate')
      expect(late).to.deep.equal([
        { orderNumber: 'SO-1021', promisedShipDate: '2026-09-22' }, // 8 days late
        { orderNumber: 'SO-1026', promisedShipDate: '2026-09-26' }, // 4 days late
        { orderNumber: 'SO-1030', promisedShipDate: '2026-09-29' }, // 1 day late
      ])
    })

    it('has on-hold orders with hold reasons', async () => {
      const held = await SELECT.from(Orders).columns('orderNumber', 'holdReason').where({ status: 'OnHold' }).orderBy('orderNumber')
      expect(held).to.deep.equal([
        { orderNumber: 'SO-1028', holdReason: 'Payment review' },
        { orderNumber: 'SO-1034', holdReason: 'Address verification' },
      ])
    })

    it('has cancelled orders', async () => {
      const cancelled = await SELECT.from(Orders).where({ status: 'Cancelled' })
      expect(cancelled.map(o => o.orderNumber).sort()).to.deep.equal(['SO-1011', 'SO-1025'])
    })

    it('has a partially shipped order with one shipment sent and one planned', async () => {
      const s = await SELECT.from(Shipments).where`order_orderNumber = 'SO-1032'`
      expect(s).to.have.length(2)
      expect(s).to.containSubset([{ status: 'InTransit' }, { status: 'Planned', shippedAt: null }])
    })

    it('has a product below reorder point in one warehouse but fine in others', async () => {
      const rows = await SELECT.from(Inventory).columns('warehouse_code', 'available', 'reorderPoint').where({ product_sku: 'HP-200' })
      const low = rows.filter(r => r.available < r.reorderPoint).map(r => r.warehouse_code)
      expect(low).to.deep.equal(['DEN'])
      expect(rows).to.have.length(3)
    })

    it('has a product with zero stock everywhere', async () => {
      const rows = await SELECT.from(Inventory).where({ product_sku: 'SP-100' })
      expect(rows).to.have.length(3)
      for (const r of rows) expect(r.onHand).to.equal(0)
    })

    it('has a discontinued product', async () => {
      const p = await SELECT.one.from(Products).where({ sku: 'TN-300' })
      expect(p.status).to.equal('Discontinued')
    })

    it('has a product whose item setup is not complete', async () => {
      const incomplete = await SELECT.from(Products).where({ setupComplete: false })
      expect(incomplete.map(p => p.sku)).to.deep.equal(['LT-300'])
    })
  })
})
