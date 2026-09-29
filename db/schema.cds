namespace orderagent;

/** Where an order stands in fulfilment */
type OrderStatus : String(20) enum {
  /** Received, stock not yet set aside */
  Open;
  /** Stock set aside in a warehouse, waiting to ship */
  Allocated;
  /** Some shipments have left the warehouse, others are still to come */
  PartiallyShipped;
  /** Everything has left the warehouse and is on its way */
  Shipped;
  /** Everything has arrived at the customer */
  Delivered;
  /** Stopped until an issue is resolved, see the hold reason */
  OnHold;
  /** Will not be fulfilled */
  Cancelled;
}

/** Where a shipment stands */
type ShipmentStatus : String(20) enum {
  /** Label created, not yet handed to the carrier */
  Planned;
  /** Handed to the carrier and on its way */
  InTransit;
  /** Arrived at the customer */
  Delivered;
}

/** Whether a product is still sold */
type ProductStatus : String(20) enum {
  /** Sold and restocked */
  Active;
  /** No longer sold or restocked; remaining stock is sold off */
  Discontinued;
}

/** A sales channel, such as the own web store, a marketplace or a retail partner */
entity Channels {
      /** Channel code, for example WEB, MKT or RTL */
  key code   : String(3);
      /** Channel name */
      name   : String(60);
      /** Orders placed through this channel */
      orders : Association to many Orders on orders.channel = $self;
}

/** A warehouse that holds stock and ships orders */
entity Warehouses {
      /** Warehouse code, for example DEN, RNO or ATL */
  key code      : String(3);
      /** Warehouse name */
      name      : String(60);
      /** City the warehouse is in */
      city      : String(60);
      /** Two-letter US state code */
      state     : String(2);
      /** Stock held in this warehouse, one row per product */
      inventory : Association to many Inventory on inventory.warehouse = $self;
}

/** A product that can be ordered */
entity Products {
      /** Stock keeping unit, for example HP-200 */
  key sku           : String(10);
      /** Product name */
      name          : String(100);
      /** Product category, for example Packs or Tents */
      category      : String(40);
      /** Whether the product is still sold */
      status        : ProductStatus default 'Active';
      /** True when item setup is finished and the product can be sold and shipped normally */
      setupComplete : Boolean default true;
      /** Stock of this product, one row per warehouse */
      inventory     : Association to many Inventory on inventory.product = $self;
}

/** Stock of one product in one warehouse */
entity Inventory {
      /** The product */
  key product      : Association to Products;
      /** The warehouse holding the stock */
  key warehouse    : Association to Warehouses;
      /** Units physically in the warehouse */
      onHand       : Integer default 0;
      /** Units set aside for orders that have not shipped yet */
      reserved     : Integer default 0;
      /** When available stock falls below this level, the product should be reordered */
      reorderPoint : Integer default 0;
      /** Units free to promise to new orders (on hand minus reserved) */
      available    : Integer = onHand - reserved;
      /** True when available stock is below the reorder point */
      belowReorderPoint : Boolean = (onHand - reserved) < reorderPoint;
}

/** A customer. Only name and city are kept here; no contact details */
entity Customers {
      /** Customer ID, for example C-001 */
  key ID     : String(10);
      /** Customer or company name */
      name   : String(100);
      /** City the customer is in */
      city   : String(60);
      /** Orders placed by this customer */
      orders : Association to many Orders on orders.customer = $self;
}

/** A sales order */
entity Orders {
      /** Order number, for example SO-1007 */
  key orderNumber      : String(10);
      /** Sales channel the order came from */
      channel          : Association to Channels;
      /** Customer who placed the order */
      customer         : Association to Customers;
      /** Date the order was placed */
      orderDate        : Date;
      /** Date we promised the order would leave the warehouse */
      promisedShipDate : Date;
      /** Where the order stands in fulfilment */
      status           : OrderStatus default 'Open';
      /** Why the order is on hold, only set when status is OnHold */
      holdReason       : String(100);
      /** Order total including all lines */
      totalAmount      : Decimal(11, 2);
      /** Three-letter currency code, for example USD */
      currency         : String(3) default 'USD';
      /** Order lines */
      items            : Composition of many OrderItems on items.order = $self;
      /** Shipments for this order, including planned ones */
      shipments        : Association to many Shipments on shipments.order = $self;
}

/** One line of a sales order */
entity OrderItems {
      /** The order this line belongs to */
  key order      : Association to Orders;
      /** Line number within the order, starting at 1 */
  key lineNumber : Integer;
      /** Product ordered */
      product    : Association to Products;
      /** Units ordered */
      quantity   : Integer;
      /** Price per unit, in the order currency */
      unitPrice  : Decimal(9, 2);
}

/** A shipment of goods for an order */
entity Shipments {
      /** Carrier tracking number, for example RP100000007 */
  key trackingNumber    : String(20);
      /** The order being shipped */
      order             : Association to Orders;
      /** Warehouse the shipment leaves from */
      warehouse         : Association to Warehouses;
      /** Carrier moving the shipment */
      carrier           : String(40);
      /** Date the shipment left the warehouse, empty while planned */
      shippedAt         : Date;
      /** Date the carrier expects to deliver */
      estimatedDelivery : Date;
      /** Date the shipment was delivered, empty until then */
      deliveredAt       : Date;
      /** Where the shipment stands */
      status            : ShipmentStatus default 'Planned';
}
