using { orderagent as db } from '../db/schema';

/** Read-only answers about orders, inventory and shipments */
@readonly
service OrderStatusService {

  /** Sales channels: own web store, marketplace and retail partners */
  @readonly entity Channels   as projection on db.Channels;

  /** Warehouses that hold stock and ship orders */
  @readonly entity Warehouses as projection on db.Warehouses;

  /** Products that can be ordered, with their sales and setup status */
  @readonly entity Products   as projection on db.Products;

  /** Stock per product and warehouse, including units available to promise */
  @readonly entity Inventory  as projection on db.Inventory;

  /** Customers, name and city only */
  @readonly entity Customers  as projection on db.Customers { ID, name, city, orders };

  /** Sales orders with status, dates and totals */
  @readonly entity Orders     as projection on db.Orders;

  /** Order lines: product, quantity and unit price */
  @readonly entity OrderItems as projection on db.OrderItems;

  /** Shipments with carrier, tracking number and delivery dates */
  @readonly entity Shipments  as projection on db.Shipments;
}
