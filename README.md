# Store Apps Platform — Order Management API

A GraphQL API for a miniature order management system, built for the MediaMarktSaturn
Technology "Store Apps Platform" coding challenge.

An order moves through a strict, forward-only state machine:

```
OPEN → IN_PROGRESS → COMPLETE
```

- Skipping or reverting a state is rejected.
- `IN_PROGRESS` requires an assigned employee — assignment happens either explicitly or
  by "claiming" the order (assign + transition in a single mutation).
- `COMPLETE` requires every line item to be resolved (`PICKED` or `CANCELLED` — none
  left `PENDING` or `MISSING`).

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict) on Node.js |
| API | GraphQL via Apollo Server 5, schema-first (SDL + resolver maps) |
| Database | MongoDB, accessed through the native `mongodb` driver behind a repository pattern (no ODM) |
| IoC | InversifyJS |
| Testing | Jest — unit, repository-integration, and full GraphQL API tests |
| CI | GitHub Actions (`.github/workflows/ci.yml`) |

## Project layout

Feature-based modules, each owning its own schema slice, resolvers, service, and
repository:

```
src/
  config/          typed, validated environment configuration
  container/       InversifyJS container wiring + symbol identifiers
  errors/          domain error classes (GraphQL-agnostic — services throw these)
  graphql/         schema merge, per-request context, error -> extensions.code mapping
  modules/
    employees/     Employee type: repository, service, resolvers, schema, seed data
    orders/        Order type: repository, service (the state machine), resolvers,
                    schema, seed data, and all three test layers
  server.ts        Apollo Server + Mongo bootstrap
  index.ts         process entrypoint
  seed.ts          wipes and reseeds the configured database
test/helpers/       shared test infrastructure (in-memory Mongo, GraphQL test client)
```

Dependency direction is one-way: **resolvers → services → repositories → MongoDB
driver**. Resolvers never touch the database directly; services never import anything
GraphQL-specific. InversifyJS wires the concrete repository implementations into the
services and the services into the resolvers via `src/graphql/context.ts`, so every
layer is swappable and mockable in isolation — see the three test layers below.

## Running it locally

```bash
docker compose up -d      # starts MongoDB on localhost:27017
npm install
npm run seed               # wipes and loads 3 employees + 8 demo orders
npm run dev                 # starts the API at http://localhost:4000 with a GraphQL sandbox
```

Copy `.env.example` to `.env` if you want to override the defaults (Docker Compose
already matches them).

## Manual testing (Apollo Sandbox)

With the server running (`npm run dev`), open `http://localhost:4000` — Apollo Server
serves the embedded Sandbox automatically outside `production`. There's no auth, so
there are no headers to set.

Order and employee ids are Mongo `ObjectId`s generated fresh by every `npm run seed`,
so every operation below takes ids as **variables** instead of hardcoding them — run
the bootstrap query first and copy from its response.

### Grab live ids first

```graphql
query Bootstrap {
  employees {
    id
    name
    code
  }
  orders {
    id
    ref
    type
    state
    assignee { id name code }
    lineItems { sku status }
  }
}
```

### Seeded fixtures

Match by `ref` (stable across reseeds) against the ids Bootstrap returns (those
change every time):

| Ref | Type | State | Assignee | Line items | Good for |
|---|---|---|---|---|---|
| ORD-4821 | PICKUP | OPEN | — | 3 items, all PENDING | Claim flow, `ASSIGNEE_REQUIRED`, skip-ahead `INVALID_TRANSITION` |
| ORD-4818 | SHIP | IN_PROGRESS | N. Bakker (EMP-0714) | 1 PICKED, 1 PENDING | `LINE_ITEMS_PENDING` on complete |
| ORD-4815 | PICKUP | IN_PROGRESS | N. Bakker (EMP-0714) | 4 items, 2 PICKED / 2 PENDING | `markLineItemPicked`, `reportLineItemMissing`, full complete walkthrough |
| ORD-4809 | SHIP | OPEN | — | 1 item, PENDING | Simple single-item claim |
| ORD-4802 | PICKUP | COMPLETE | N. Bakker (EMP-0714) | 2 items, both PICKED | `ORDER_CLOSED`, terminal-state `INVALID_TRANSITION` |
| ORD-4796 | SHIP | OPEN | — | 5 items, all PENDING | Larger order, list/filter tests |
| ORD-4791 | PICKUP | OPEN | R. Matos (EMP-0301) | 1 item, PENDING | **OPEN but already assigned** — claiming with no `employeeId` succeeds; claiming with someone else's id → `ALREADY_ASSIGNED` |
| ORD-4788 | SHIP | COMPLETE | R. Matos (EMP-0301) | 3 items, all PICKED | A second closed order |

Employees: **N. Bakker** (`EMP-0714`), **R. Matos** (`EMP-0301`), **S. Delgado**
(`EMP-0552` — seeded but never assigned to an order, useful as a "fresh" `employeeId`).

### Queries

```graphql
query OpenOrders {
  orders(state: [OPEN]) {
    id
    ref
    type
    assignee { name code }
  }
}

query MyWork($assigneeId: ID!) {
  orders(assigneeId: $assigneeId) {
    id
    ref
    state
    lineItems { sku status }
  }
}
```

Order detail, using a shared fragment so list, detail, and mutation responses stay in
sync instead of repeating the same field selection everywhere:

```graphql
fragment OrderSummary on Order {
  id
  ref
  state
  type
  assignee { name code }
}

query OneOrder($id: ID!) {
  order(id: $id) {
    ...OrderSummary
    customer { name phone }
    lineItems { sku name quantity location status }
    history { state at by }
  }
}
```

`destination` is a real GraphQL `union` (`PickupLockerDestination | ShippingAddressDestination
| CollectionDeskDestination`), not one flat type with an unstructured `text` field — each
fulfilment method has its own distinct fields, so selecting them needs an inline fragment per
member, plus `__typename` to tell them apart on the client:

```graphql
query OrderDestination($id: ID!) {
  order(id: $id) {
    ref
    destination {
      __typename
      ... on PickupLockerDestination { lockerCode floor }
      ... on ShippingAddressDestination { street postalCode city }
      ... on CollectionDeskDestination { deskNumber area }
    }
  }
}
```

`order.resolvers.ts` supplies the matching `Destination.__resolveType`, which is what a
`union` (unlike an object type) requires — GraphQL can't infer which concrete type a resolved
value is on its own. Try one id of each type to exercise all three branches — ORD-4821
(locker), ORD-4818 (shipping), ORD-4815 (desk).

### Mutations

Claim + transition (`OPEN` → `IN_PROGRESS`) in one call:

```graphql
mutation Claim($id: ID!, $employeeId: ID!) {
  transitionOrder(id: $id, to: IN_PROGRESS, employeeId: $employeeId) {
    id
    ref
    state
    assignee { name code }
    history { state at by }
  }
}
```
Variables: `{ "id": "<ORD-4821's id>", "employeeId": "<S. Delgado's id>" }` — ORD-4821 is
unassigned, so this succeeds.

Transitioning an `OPEN` order that's already assigned needs no `employeeId`:

```graphql
mutation ClaimAlreadyAssigned($id: ID!) {
  transitionOrder(id: $id, to: IN_PROGRESS) {
    id
    ref
    state
    assignee { name code }
  }
}
```
Variables: `{ "id": "<ORD-4791's id>" }` — it transitions using the existing assignee
(R. Matos).

Line items:

```graphql
mutation PickItem($orderId: ID!, $sku: String!) {
  markLineItemPicked(orderId: $orderId, sku: $sku) {
    ref
    lineItems { sku status }
  }
}

mutation ReportMissing($orderId: ID!, $sku: String!) {
  reportLineItemMissing(orderId: $orderId, sku: $sku) {
    ref
    lineItems { sku status }
  }
}

mutation ResolveLineItem($orderId: ID!, $sku: String!, $resolution: LineItemResolution!) {
  resolveLineItem(orderId: $orderId, sku: $sku, resolution: $resolution) {
    ref
    lineItems { sku status }
  }
}
```

`resolveLineItem` only works on a line item that's currently `MISSING` — run
`ReportMissing` on it first. `RECHECK` sends it back to `PENDING`, `CANCEL` sends it to
`CANCELLED` (both unblock completion).

Complete an order — blocked until every line item is `PICKED` or `CANCELLED`:

```graphql
mutation Complete($id: ID!) {
  transitionOrder(id: $id, to: COMPLETE) {
    id
    ref
    state
    history { state at by }
  }
}
```

### Error scenarios

A rejected mutation returns a standard GraphQL error with a stable `extensions.code`
rather than a generic 500, so a client can branch on the failure reason. Run these
against a fresh seed (`npm run seed`) if an earlier test already moved one of these
orders along.

| Code | Trigger |
|---|---|
| `ASSIGNEE_REQUIRED` | `transitionOrder(id: "<ORD-4821>", to: IN_PROGRESS)` with no `employeeId` — the order is unassigned |
| `ALREADY_ASSIGNED` | `transitionOrder(id: "<ORD-4791>", to: IN_PROGRESS, employeeId: "<S. Delgado's id>")` — ORD-4791 is already assigned to Matos |
| `INVALID_TRANSITION` (skip) | `transitionOrder(id: "<ORD-4821>", to: COMPLETE)` — OPEN can only move to IN_PROGRESS |
| `INVALID_TRANSITION` (terminal) | `transitionOrder(id: "<ORD-4802>", to: IN_PROGRESS)` — already COMPLETE |
| `LINE_ITEMS_PENDING` | `transitionOrder(id: "<ORD-4818>", to: COMPLETE)` — has a PENDING line item |
| `LINE_ITEM_MISSING` | `reportLineItemMissing(orderId: "<ORD-4815>", sku: "AIR-F5L")`, then `transitionOrder(id: "<ORD-4815>", to: COMPLETE)` |
| `ORDER_CLOSED` | `markLineItemPicked(orderId: "<ORD-4802>", sku: "KBD-M75")` — ORD-4802 is COMPLETE and read-only |
| `NOT_FOUND` | `transitionOrder(id: "64a000000000000000000001", to: IN_PROGRESS)` — well-formed id, nothing matches (same code for an unknown `sku` or unknown `employeeId`) |
| `BAD_USER_INPUT` | `order(id: "not-an-id")`, or `resolveLineItem(orderId: "<ORD-4815>", sku: "AIR-F5L", resolution: RECHECK)` while that item is still `PENDING` rather than `MISSING` |

## Testing

```bash
npm test              # full suite
npm run test:coverage # with the coverage report/threshold gate
```

Three layers, all real (nothing hand-mocked at the database level except in the pure
unit layer):

1. **Unit** (`order.service.spec.ts`) — the state machine and business rules in
   isolation, repository mocked. Exhaustive over every transition and every error code.
2. **Repository integration** (`*.repository.spec.ts`) — against a real MongoDB via
   [`mongodb-memory-server`](https://github.com/typegoose/mongodb-memory-server) (an
   actual `mongod` binary, in memory — not a fake).
3. **API integration** (`order.resolvers.spec.ts`) — builds the real Apollo schema and
   the real IoC container against that same in-memory Mongo, then executes actual
   GraphQL documents end-to-end and asserts on the response, including error codes.
   The 8 seeded demo orders are the same ones from the original design mockup's demo
   script, and several tests are direct translations of its scripted scenarios
   (completing an unassigned/skipped order, reopening a completed one, a missing shelf
   item blocking completion, claiming an already-assigned order).

> **Network note:** `mongodb-memory-server` downloads a real `mongod` binary on first
> run. That requires outbound internet access — it works locally and in this repo's
> GitHub Actions CI, but will fail in any network-restricted sandbox.

## Configuration

Read and validated once at startup (`src/config/index.ts`), not read ad hoc from
`process.env` around the codebase:

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `4000` | must be a valid port number if set |
| `MONGODB_URI` | `mongodb://localhost:27017` | |
| `MONGODB_DB_NAME` | `store_apps` | |
| `NODE_ENV` | `development` | one of `development` \| `test` \| `production` |

## Design notes & assumptions

- **No frontend.** The challenge and its evaluation criteria are backend-only. A Claude
  Design mockup exists in this project's parent folder as an early product-vision
  sketch; it was used only as a spec for the domain model and edge cases above, never
  built or wired up.
- **Order creation is out of scope.** The challenge asks for listing, detail, and
  transition — not creation — and the original design never creates orders either
  (only seeds and transitions them). Orders exist via `npm run seed`.
- **No auth.** There's no login/session; the acting employee is passed explicitly as an
  `employeeId` argument where relevant. `transitionOrder`'s `employeeId` is how an order
  gets claimed (assigned + moved to `IN_PROGRESS`) in one step, mirroring the mockup's
  "scan the label to claim it" flow without modeling an actual scanner.
- **`order(id)` is nullable and doesn't error for a merely-missing id** — a well-formed
  id that matches nothing returns `null`, which is a normal outcome for "check the
  details of an order," not an exceptional one. A malformed id is still
  `BAD_USER_INPUT`. Mutations (`transitionOrder` and friends) are stricter: they target
  a specific resource that must exist, so an unknown id there is `NOT_FOUND`.
- **Full replace, not partial update, on write.** `OrderRepository.replace` persists
  the whole order document rather than issuing field-level `$set`s. Simpler to reason
  about and test at this scale; a production system with real concurrent writers would
  want optimistic concurrency (a version field) instead, which this doesn't implement.
- **Line item richness beyond the PDF's literal minimum** (statuses gating completion,
  order type/destination, employee-code-per-history-entry) is adopted from the design
  mockup's own domain model, since it was already fully worked out there and gives
  real material for the test suite rather than being invented from scratch.
