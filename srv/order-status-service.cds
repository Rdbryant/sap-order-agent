using { orderagent as db } from '../db/schema';

/** Read-only answers about orders, inventory and shipments */
@odata
@mcp
@mcp.instructions: 'You answer questions about sales orders, stock and shipments for an outdoor gear company. All data is read-only: you cannot create, change, cancel or ship anything, so if someone asks for a change, say so and suggest they contact the operations team. Prefer the purpose-built tools: getOrderStatus for one order, findOrdersNeedingAttention for late or on-hold orders, checkStock for one product, listLowStock for what needs reordering, and channelSummary for sales by channel over a date range. Only use describe and query for questions these tools do not cover, such as listing orders for one customer or finding products by name. Dates are ISO dates (YYYY-MM-DD) and amounts are in the order currency (USD). Customer contact details are not available.'
@readonly
service OrderStatusService {

  // ---------------------------------------------------------------------------
  // Entities: for questions the functions below do not cover
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Return types
  // ---------------------------------------------------------------------------

  /** Why an order needs attention */
  type AttentionReason : String(10) enum {
    /** Past its promised ship date and not fully shipped */
    Late;
    /** Stopped until an issue is resolved */
    OnHold;
  }

  /** One line of an order */
  type OrderLine {
    /** Line number within the order */
    lineNumber  : Integer;
    /** Product SKU, for example HP-200 */
    sku         : String(10);
    /** Product name */
    productName : String(100);
    /** Units ordered */
    quantity    : Integer;
  }

  /** One shipment of an order */
  type OrderShipment {
    /** Carrier tracking number */
    trackingNumber    : String(20);
    /** Carrier moving the shipment */
    carrier           : String(40);
    /** Warehouse code the shipment leaves from */
    warehouse         : String(3);
    /** Where the shipment stands: Planned, InTransit or Delivered */
    status            : db.ShipmentStatus;
    /** Date it left the warehouse, empty while planned */
    shippedAt         : Date;
    /** Date the carrier expects to deliver */
    estimatedDelivery : Date;
    /** Date it was delivered, empty until then */
    deliveredAt       : Date;
  }

  /** Status of one order */
  type OrderStatusResult {
    /** Order number */
    orderNumber      : String(10);
    /** Where the order stands in fulfilment */
    status           : db.OrderStatus;
    /** Sales channel name */
    channel          : String(60);
    /** Customer or company name */
    customerName     : String(100);
    /** Date the order was placed */
    orderDate        : Date;
    /** Date we promised it would leave the warehouse */
    promisedShipDate : Date;
    /** Why the order is on hold, empty unless on hold */
    holdReason       : String(100);
    /** True when the promised ship date has passed and the order is not fully shipped */
    isLate           : Boolean;
    /** Days past the promised ship date, 0 when not late */
    daysLate         : Integer;
    /** Order total */
    totalAmount      : Decimal(11, 2);
    /** Currency code */
    currency         : String(3);
    /** Order lines */
    items            : many OrderLine;
    /** Shipments, including planned ones not yet sent */
    shipments        : many OrderShipment;
  }

  /** An order that is late or on hold */
  type AttentionOrder {
    /** Order number */
    orderNumber      : String(10);
    /** Why the order needs attention; an order on hold is reported as OnHold even when also late */
    reason           : AttentionReason;
    /** Where the order stands in fulfilment */
    status           : db.OrderStatus;
    /** Sales channel name */
    channel          : String(60);
    /** Customer or company name */
    customerName     : String(100);
    /** Date the order was placed */
    orderDate        : Date;
    /** Date we promised it would leave the warehouse */
    promisedShipDate : Date;
    /** Days past the promised ship date, 0 when not late */
    daysLate         : Integer;
    /** Why the order is on hold, empty unless on hold */
    holdReason       : String(100);
    /** Order total */
    totalAmount      : Decimal(11, 2);
    /** Currency code */
    currency         : String(3);
  }

  /** Stock of a product in one warehouse */
  type WarehouseStock {
    /** Warehouse code, for example DEN */
    warehouse         : String(3);
    /** Warehouse name */
    warehouseName     : String(60);
    /** Units physically in the warehouse */
    onHand            : Integer;
    /** Units set aside for orders not yet shipped */
    reserved          : Integer;
    /** Units free to promise (on hand minus reserved) */
    available         : Integer;
    /** Reorder when available falls below this level */
    reorderPoint      : Integer;
    /** True when available is below the reorder point */
    belowReorderPoint : Boolean;
  }

  /** Stock of one product across all warehouses */
  type StockResult {
    /** Product SKU */
    sku                       : String(10);
    /** Product name */
    productName               : String(100);
    /** Product category */
    category                  : String(40);
    /** Active or Discontinued */
    productStatus             : db.ProductStatus;
    /** False when item setup is not finished, so the product may not ship normally */
    setupComplete             : Boolean;
    /** Units on hand across all warehouses */
    totalOnHand               : Integer;
    /** Units reserved across all warehouses */
    totalReserved             : Integer;
    /** Units available across all warehouses */
    totalAvailable            : Integer;
    /** True when available is below the reorder point in at least one warehouse */
    belowReorderPointAnywhere : Boolean;
    /** Stock per warehouse */
    warehouses                : many WarehouseStock;
  }

  /** A product that is below its reorder point in one warehouse */
  type LowStockRow {
    /** Product SKU */
    sku            : String(10);
    /** Product name */
    productName    : String(100);
    /** Active or Discontinued */
    productStatus  : db.ProductStatus;
    /** True for discontinued products, which are normally not reordered */
    isDiscontinued : Boolean;
    /** Warehouse code */
    warehouse      : String(3);
    /** Warehouse name */
    warehouseName  : String(60);
    /** Units physically in the warehouse */
    onHand         : Integer;
    /** Units set aside for orders not yet shipped */
    reserved       : Integer;
    /** Units free to promise (on hand minus reserved) */
    available      : Integer;
    /** Reorder when available falls below this level */
    reorderPoint   : Integer;
    /** Units needed to get back to the reorder point */
    shortfall      : Integer;
  }

  /** Sales figures for one channel */
  type ChannelSummaryRow {
    /** Channel code, for example WEB */
    channel        : String(3);
    /** Channel name */
    channelName    : String(60);
    /** Orders placed in the date range, including cancelled ones */
    orderCount     : Integer;
    /** Orders in the date range that were cancelled */
    cancelledCount : Integer;
    /** Total of all orders in the date range that were not cancelled */
    revenue        : Decimal(13, 2);
    /** Currency code */
    currency       : String(3);
  }

  // ---------------------------------------------------------------------------
  // Functions: one MCP tool each
  // ---------------------------------------------------------------------------

  /**
   * Look up one order: its status, whether it is late, what was ordered, and where each shipment is.
   * Use this when someone asks where an order is, when it will ship or arrive, or why it has not shipped.
   * Do not use it to find which orders are late or on hold (use findOrdersNeedingAttention)
   */
  function getOrderStatus(
    /** Order number, for example SO-1007 */
    orderNumber : String(10) not null
  ) returns OrderStatusResult;

  /**
   * List orders that need attention: orders past their promised ship date that have not fully shipped, and orders on hold.
   * Use this when someone asks which orders are late, stuck, on hold or at risk.
   * Sorted most urgent first (most days late first). For one specific order, use getOrderStatus
   */
  function findOrdersNeedingAttention(
    /** Only include late orders more than this many days past their promised ship date, for example 3. Leave empty to include every late order. On-hold orders are always included */
    daysLate : Integer
  ) returns many AttentionOrder;

  /**
   * Show how much of one product is in stock: on hand, reserved and available per warehouse and in total, plus whether it is below its reorder point anywhere.
   * Use this when someone asks how much of a product we have, where it is, or whether it can ship.
   * To see everything that is running low, use listLowStock
   */
  function checkStock(
    /** Product SKU, for example HP-200 */
    sku : String(10) not null
  ) returns StockResult;

  /**
   * List products whose available stock is below the reorder point, per warehouse, largest shortfall first.
   * Use this when someone asks what is running low, what needs reordering, or what is short in a warehouse.
   * Discontinued products are included but flagged. For one product, use checkStock
   */
  function listLowStock(
    /** Warehouse code, for example DEN (Denver), RNO (Reno) or ATL (Atlanta). Leave empty to check all warehouses */
    warehouse : String(3)
  ) returns many LowStockRow;

  /**
   * Summarize sales per channel (web store, marketplace, retail partners) for orders placed in a date range: order count, cancelled count and revenue.
   * Use this when someone asks how channels performed, compares channels, or asks for sales or revenue over a period.
   * Revenue excludes cancelled orders
   */
  function channelSummary(
    /** First order date to include, as YYYY-MM-DD, for example 2026-09-21 */
    fromDate : Date not null,
    /** Last order date to include, as YYYY-MM-DD, for example 2026-09-27 */
    toDate   : Date not null
  ) returns many ChannelSummaryRow;
}
