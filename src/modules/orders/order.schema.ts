export const orderTypeDefs = /* GraphQL */ `
  enum OrderState {
    OPEN
    IN_PROGRESS
    COMPLETE
  }

  enum OrderType {
    PICKUP
    SHIP
  }

  enum LineItemStatus {
    PENDING
    PICKED
    MISSING
    CANCELLED
  }

  enum LineItemResolution {
    RECHECK
    CANCEL
  }

  type Customer {
    name: String!
    phone: String!
  }

  """
  How this order reaches the customer. A real GraphQL union: each fulfilment method
  has its own distinct fields, so clients select them with inline fragments
  (... on ShippingAddressDestination { street city }).
  """
  union Destination = PickupLockerDestination | ShippingAddressDestination | CollectionDeskDestination

  type PickupLockerDestination {
    lockerCode: String!
    floor: String!
  }

  type ShippingAddressDestination {
    street: String!
    postalCode: String!
    city: String!
  }

  type CollectionDeskDestination {
    deskNumber: String!
    area: String!
  }

  type LineItem {
    sku: String!
    name: String!
    quantity: Int!
    location: String!
    status: LineItemStatus!
  }

  type HistoryEntry {
    state: OrderState!
    at: DateTime!
    by: String!
  }

  type Order {
    id: ID!
    ref: String!
    type: OrderType!
    state: OrderState!
    "The employee currently assigned to this order, if any. Required once IN_PROGRESS."
    assignee: Employee
    customer: Customer!
    destination: Destination!
    lineItems: [LineItem!]!
    "One entry per transition, oldest first."
    history: [HistoryEntry!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Query {
    "List orders, optionally filtered by state and/or assignee."
    orders(state: [OrderState!], assigneeId: ID): [Order!]!
    "A single order by id, or null if it doesn't exist."
    order(id: ID!): Order
  }

  type Mutation {
    """
    Advance an order one step in its state machine (OPEN -> IN_PROGRESS -> COMPLETE).
    Skipping or reverting is rejected with INVALID_TRANSITION.

    To move OPEN -> IN_PROGRESS, the order needs an assignee: pass employeeId to
    claim + transition it in one call, or omit it if the order is already assigned.

    Deliberately nullable: a rejected mutation nulls only this field, alongside a
    coded error in the response's errors[] — not the whole response, which a
    non-null return type would force on any failure.
    """
    transitionOrder(id: ID!, to: OrderState!, employeeId: ID): Order
    "Marks a PENDING line item as PICKED. Nullable for the same reason as transitionOrder."
    markLineItemPicked(orderId: ID!, sku: String!): Order
    "Marks a PENDING line item as MISSING, which blocks completion until resolved."
    reportLineItemMissing(orderId: ID!, sku: String!): Order
    "Resolves a MISSING line item back to PENDING (recheck) or forward to CANCELLED."
    resolveLineItem(orderId: ID!, sku: String!, resolution: LineItemResolution!): Order
  }
`;
