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

  type Destination {
    kind: String!
    text: String!
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
    """
    transitionOrder(id: ID!, to: OrderState!, employeeId: ID): Order!
    "Marks a PENDING line item as PICKED."
    markLineItemPicked(orderId: ID!, sku: String!): Order!
    "Marks a PENDING line item as MISSING, which blocks completion until resolved."
    reportLineItemMissing(orderId: ID!, sku: String!): Order!
    "Resolves a MISSING line item back to PENDING (recheck) or forward to CANCELLED."
    resolveLineItem(orderId: ID!, sku: String!, resolution: LineItemResolution!): Order!
  }
`;
