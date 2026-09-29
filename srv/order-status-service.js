import cds from '@sap/cds'
import { today, daysBetween } from './lib/clock.js'

/** Order statuses where something still has to leave the warehouse */
const NOT_FULLY_SHIPPED = ['Open', 'Allocated', 'OnHold', 'PartiallyShipped']

/** Days an order is past its promised ship date, 0 when not late */
const daysLateOf = (order, asOf) =>
  NOT_FULLY_SHIPPED.includes(order.status) && order.promisedShipDate < asOf
    ? daysBetween(order.promisedShipDate, asOf)
    : 0

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** True for a real calendar date written as YYYY-MM-DD (2026-02-31 is not) */
const isIsoDate = value =>
  /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') && !isNaN(Date.parse(value)) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
const normalize = value => String(value ?? '').trim().toUpperCase()

export default class OrderStatusService extends cds.ApplicationService {
  init() {
    const { Orders, Inventory, Products, Warehouses, Channels } = cds.entities('orderagent')

    this.on('getOrderStatus', async req => {
      let orderNumber = normalize(req.data.orderNumber)
      if (/^\d+$/.test(orderNumber)) orderNumber = `SO-${orderNumber}`

      const order = await SELECT.one.from(Orders).columns`
        orderNumber, status, channel.name as channel, customer.name as customerName,
        orderDate, promisedShipDate, holdReason, totalAmount, currency,
        items { lineNumber, product.sku as sku, product.name as productName, quantity },
        shipments {
          trackingNumber, carrier, warehouse.code as warehouse, status,
          shippedAt, estimatedDelivery, deliveredAt
        }
      `.where({ orderNumber })
      if (!order) return req.reject(404, `Order ${orderNumber} was not found. Order numbers look like SO-1007.`)

      const daysLate = daysLateOf(order, today())
      order.items.sort((a, b) => a.lineNumber - b.lineNumber)
      order.shipments.sort((a, b) => (a.shippedAt ?? '9999').localeCompare(b.shippedAt ?? '9999'))
      return { ...order, isLate: daysLate > 0, daysLate }
    })

    this.on('findOrdersNeedingAttention', async req => {
      const minDaysLate = req.data.daysLate ?? 0
      if (minDaysLate < 0) return req.reject(400, 'Days late cannot be negative. Use 0 or leave it empty to see every late order.')

      const asOf = today()
      // Late means more than minDaysLate days past the promised ship date
      const cutoff = addDays(asOf, -minDaysLate)
      const orders = await SELECT.from(Orders).columns`
        orderNumber, status, channel.name as channel, customer.name as customerName,
        orderDate, promisedShipDate, holdReason, totalAmount, currency
      `.where`status = 'OnHold' or (status in ${NOT_FULLY_SHIPPED} and promisedShipDate < ${cutoff})`

      return orders
        .map(o => ({ ...o, reason: o.status === 'OnHold' ? 'OnHold' : 'Late', daysLate: daysLateOf(o, asOf) }))
        .sort((a, b) => b.daysLate - a.daysLate || a.promisedShipDate.localeCompare(b.promisedShipDate) || a.orderNumber.localeCompare(b.orderNumber))
    })

    this.on('checkStock', async req => {
      const sku = normalize(req.data.sku)

      const product = await SELECT.one.from(Products).columns`
        sku, name as productName, category, status as productStatus, setupComplete,
        inventory {
          warehouse.code as warehouse, warehouse.name as warehouseName,
          onHand, reserved, available, reorderPoint, belowReorderPoint
        }
      `.where({ sku })
      if (!product) return req.reject(404, `Product ${sku} was not found. SKUs look like HP-200.`)

      const { inventory: warehouses, ...rest } = product
      warehouses.sort((a, b) => a.warehouse.localeCompare(b.warehouse))
      const sum = field => warehouses.reduce((total, w) => total + w[field], 0)
      return {
        ...rest,
        totalOnHand: sum('onHand'),
        totalReserved: sum('reserved'),
        totalAvailable: sum('available'),
        belowReorderPointAnywhere: warehouses.some(w => w.belowReorderPoint),
        warehouses,
      }
    })

    this.on('listLowStock', async req => {
      const warehouse = normalize(req.data.warehouse)
      if (warehouse && !await SELECT.one.from(Warehouses).where({ code: warehouse })) {
        const codes = (await SELECT.from(Warehouses).columns('code', 'city')).map(w => `${w.code} (${w.city})`)
        return req.reject(404, `Warehouse ${warehouse} was not found. Valid warehouse codes are ${codes.join(', ')}.`)
      }

      const rows = await SELECT.from(Inventory).columns`
        product.sku as sku, product.name as productName, product.status as productStatus,
        warehouse.code as warehouse, warehouse.name as warehouseName,
        onHand, reserved, available, reorderPoint
      `.where({ belowReorderPoint: true, ...warehouse && { warehouse_code: warehouse } })

      return rows
        .map(r => ({ ...r, isDiscontinued: r.productStatus === 'Discontinued', shortfall: r.reorderPoint - r.available }))
        .sort((a, b) => b.shortfall - a.shortfall || a.sku.localeCompare(b.sku) || a.warehouse.localeCompare(b.warehouse))
    })

    this.on('channelSummary', async req => {
      const { fromDate, toDate } = req.data
      for (const [name, value] of [['From date', fromDate], ['To date', toDate]]) {
        if (!isIsoDate(value))
          return req.reject(400, `${name} must be a date written as YYYY-MM-DD, for example 2026-09-21.`)
      }
      if (fromDate > toDate) return req.reject(400, `From date ${fromDate} is after to date ${toDate}. Swap them or pick a different range.`)

      const [channels, totals] = await Promise.all([
        SELECT.from(Channels).columns('code', 'name').orderBy('code'),
        SELECT.from(Orders).columns(
          'channel_code',
          'count(1) as orderCount',
          `sum(case when status = 'Cancelled' then 1 else 0 end) as cancelledCount`,
          `sum(case when status = 'Cancelled' then 0 else totalAmount end) as revenue`,
        ).where`orderDate >= ${fromDate} and orderDate <= ${toDate}`.groupBy('channel_code'),
      ])
      const byChannel = Object.fromEntries(totals.map(t => [t.channel_code, t]))
      return channels.map(({ code, name }) => ({
        channel: code,
        channelName: name,
        orderCount: byChannel[code]?.orderCount ?? 0,
        cancelledCount: byChannel[code]?.cancelledCount ?? 0,
        revenue: Number(byChannel[code]?.revenue ?? 0),
        currency: 'USD',
      }))
    })

    return super.init()
  }
}
