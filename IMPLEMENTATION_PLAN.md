# Implementation Plan — MediaMarktSaturn Store Apps Platform Challenge

Status: **draft for review** — nothing has been built yet. This is the plan we agreed on; flag anything you want changed before I start writing code.

## 1. Scope

Backend-only. A GraphQL API (Apollo Server) over MongoDB for a miniature order
management system, in NodeJS + TypeScript, wired together with an IoC
container. No frontend is built — the challenge and its evaluation criteria
(requirements fulfilled, code structure, architecture, tooling, testing) are
all backend-only.

The existing Claude Design mockup (`MediaMarket Order Management App/Store Ops
App.dc.html`) is used only as a **spec**: it already worked out a richer domain
model and a set of realistic edge cases, so we reuse that thinking without
building or wiring up any UI.

Domain richness: we're adopting the mockup's fuller model — line item statuses
that gate completion, order type + destination, and an assign-on-claim
mutation — rather than the PDF's bare-minimum literal reading. It's already
designed, costs nothing extra to decide, and gives real material for the test
suite.

## 2. Domain model

**Order**
| field | type | notes |
|---|---|---|
| `id` | ObjectId | Mongo `_id` |
| `ref` | string | e.g. `ORD-4821`, unique, generated on creation |
| `type` | `OrderType` | `PICKUP` \| `SHIP` |
| `state` | `OrderState` | `OPEN` \| `IN_PROGRESS` \| `COMPLETE` |
| `assigneeId` | ObjectId \| null | references `Employee`, required once `IN_PROGRESS` |
| `customer` | `{ name, phone }` | embedded |
| `destination` | `{ kind, text }` | embedded, e.g. `PICKUP_LOCKER` / `SHIPPING_ADDRESS` / `COLLECTION_DESK` |
| `lineItems` | `LineItem[]` | embedded array |
| `history` | `HistoryEntry[]` | embedded, one row appended per transition |
| `createdAt` / `updatedAt` | Date | maintained by the service layer |

**LineItem** (embedded): `sku`, `name`, `quantity`, `location`, `status`
(`PENDING` \| `PICKED` \| `MISSING` \| `CANCELLED`)

**HistoryEntry** (embedded): `state`, `at`, `by` (employee code or `"system"`)

**Employee** (own collection): `id`, `name`, `code` (e.g. `EMP-0714`) — seeded
with a handful of records, no auth/login, just a lookup table so `assignee`
is a real modeled entity instead of a bare string.

## 3. Business rules

1. **Forward-only transitions**: `OPEN → IN_PROGRESS → COMPLETE`. Any other
   target (skip or revert) is rejected with `INVALID_TRANSITION`.
2. **`IN_PROGRESS` requires an assignee.** `transitionOrder` accepts an
   optional `employeeId`:
   - order already assigned to someone else → `ALREADY_ASSIGNED`
   - order unassigned and no `employeeId` given → `ASSIGNEE_REQUIRED`
   - order unassigned and `employeeId` given → assign + transition atomically
     (mirrors the mockup's "claim scan" behaviour)
3. **`COMPLETE` requires every line item resolved**: any item still `PENDING`
   → `LINE_ITEMS_PENDING`; any item `MISSING` → `LINE_ITEM_MISSING`.
   `PICKED` and `CANCELLED` don't block completion.
4. Line items move `PENDING → PICKED` (scanned/picked) or `PENDING → MISSING`
   (reported missing), and `MISSING` can be resolved back to `PENDING`
   (re-check) or forward to `CANCELLED`.
5. Once `COMPLETE`, an order is read-only — no further mutation is accepted.
6. Bad/malformed input (invalid id format, unknown enum value, missing
   required field) → `BAD_USER_INPUT`. Referencing an order/employee that
   doesn't exist → `NOT_FOUND`.

These map directly onto the 7 demo scenarios already scripted in the mockup's
sidebar, which double as our core negative-test list (see §6).

## 4. GraphQL schema (sketch — schema-first SDL)

```graphql
enum OrderState { OPEN IN_PROGRESS COMPLETE }
enum OrderType { PICKUP SHIP }
enum LineItemStatus { PENDING PICKED MISSING CANCELLED }
enum LineItemResolution { RECHECK CANCEL }

type Employee { id: ID! name: String! code: String! }
type Customer { name: String! phone: String! }
type Destination { kind: String! text: String! }

type LineItem {
  sku: String!
  name: String!
  quantity: Int!
  location: String!
  status: LineItemStatus!
}

type HistoryEntry { state: OrderState! at: DateTime! by: String! }

type Order {
  id: ID!
  ref: String!
  type: OrderType!
  state: OrderState!
  assignee: Employee
  customer: Customer!
  destination: Destination!
  lineItems: [LineItem!]!
  history: [HistoryEntry!]!
  createdAt: DateTime!
  updatedAt: DateTime!
}

type Query {
  orders(state: [OrderState!], assigneeId: ID): [Order!]!
  order(id: ID!): Order
  employees: [Employee!]!
}

type Mutation {
  transitionOrder(id: ID!, to: OrderState!, employeeId: ID): Order!
  markLineItemPicked(orderId: ID!, sku: String!): Order!
  reportLineItemMissing(orderId: ID!, sku: String!): Order!
  resolveLineItem(orderId: ID!, sku: String!, resolution: LineItemResolution!): Order!
}
```

Errors surface as standard GraphQL errors with `extensions.code` set to one of
the codes in §3 (plus `BAD_USER_INPUT` / `NOT_FOUND` / `INTERNAL_SERVER_ERROR`).

## 5. Architecture

Feature-based modules (per the challenge's "structured into functional
modules"), each module owning its own schema slice, resolvers, service, and
repository:

```
store-apps-platform/
  src/
    config/                # typed, validated env config, loaded once at bootstrap
    container/             # InversifyJS container setup + symbols
    graphql/
      schema.ts            # merges per-module typeDefs + resolvers into one executable schema
      context.ts           # per-request context (container child scope)
      errors.ts            # domain error classes -> GraphQLError / extensions.code mapping
    modules/
      orders/
        order.types.ts          # domain TS types
        order.schema.graphql    # SDL owned by this module
        order.repository.ts     # Mongo access (native driver), interface + impl
        order.service.ts        # state machine + business rules, injected repository
        order.resolvers.ts      # thin resolvers, delegate to service
        order.seed.ts           # seed data for local/dev/CI
        __tests__/
          order.service.spec.ts       # unit tests — pure logic, mocked repository
          order.repository.spec.ts    # integration tests — mongodb-memory-server
          order.resolvers.spec.ts     # API-level tests — execute real GraphQL documents
      employees/
        (same shape, smaller)
    server.ts               # Apollo Server bootstrap: build schema, connect Mongo, wire container
    index.ts                # entrypoint
  test/
    helpers/                # shared test utilities (in-memory Mongo bootstrap, test client)
  docker-compose.yml         # MongoDB for local dev
  .github/workflows/ci.yml
  .env.example
  package.json / tsconfig.json / jest.config.ts / eslint config
  README.md                  # setup + run instructions for the live demo
```

Dependency direction: `resolvers → services → repositories → MongoDB driver`.
Resolvers never touch the database directly; services never know about
GraphQL. InversifyJS wires repository implementations into services and
services into resolvers, so the whole chain is swappable/mockable in tests.

## 6. Testing strategy (this is the priority)

Since the test coverage + CI bonus is the main thing we want to stand out on,
testing is treated as first-class, not an afterthought:

**Layer 1 — unit tests (`order.service.spec.ts`)**: pure business logic, no
I/O, repository mocked. Exhaustive over the state machine: every legal
transition, every illegal one (skip, revert), assignee-required, already-
assigned, claim-assigns-atomically, complete-blocked-by-pending,
complete-blocked-by-missing, mutating a `COMPLETE` order.

**Layer 2 — repository integration tests (`order.repository.spec.ts`)**:
against a real (in-memory) MongoDB via `mongodb-memory-server` — persistence,
filtering orders by state/assignee, `ref` uniqueness, not-found behaviour.

**Layer 3 — API integration tests (`order.resolvers.spec.ts`)**: build the
real Apollo schema + real in-memory-Mongo-backed services, execute actual
GraphQL query/mutation documents end-to-end, assert on `data` and on
`errors[0].extensions.code`. This is where the 7 mockup demo scenarios become
concrete test cases — e.g. "complete an unassigned order" →
`ASSIGNEE_REQUIRED`, "reopen a completed order" → `INVALID_TRANSITION`,
malformed order id → `BAD_USER_INPUT`, unknown order id → `NOT_FOUND`.

**Coverage gate**: Jest coverage collected on `src/modules/**` and
`src/graphql/**`, with a threshold (~85%) that fails the build if not met —
enforced in CI, not just run locally.

**Quality gates alongside tests**: ESLint and `tsc --noEmit` both run as CI
steps, so "every important aspect is tested" is backed by static checks too.

## 7. CI pipeline (GitHub Actions)

`.github/workflows/ci.yml`, triggered on push + pull_request:

1. checkout
2. `actions/setup-node` (pinned LTS version, npm cache enabled)
3. `npm ci`
4. `npm run lint` (ESLint)
5. `npm run typecheck` (`tsc --noEmit`)
6. `npm test -- --coverage` (Jest; `mongodb-memory-server`'s downloaded binary
   cached via `actions/cache` so repeat runs are fast)
7. coverage threshold enforced by Jest config itself (build fails if under)
8. `npm run build` (compile to verify the production build is clean)

Lint/typecheck and test can run as separate jobs in parallel for faster
feedback and a clearer CI graph to show in the interview; build depends on
both passing. A status badge goes in the README.

## 8. Running locally

- `docker compose up -d` — starts MongoDB
- `npm install`
- `npm run seed` — loads demo employees + orders (mirroring the mockup's 8
  seeded orders) so the live demo has realistic data immediately
- `npm run dev` — starts Apollo Server (with GraphQL sandbox for live
  querying during the demo)
- `npm test` — full suite locally

## 9. Open items / assumptions to flag if asked

- `ref` generation: sequential-looking but randomized suffix (`ORD-####`),
  no external numbering system.
- No auth: employee identity is passed explicitly as an argument
  (`employeeId`) rather than derived from a session, since no auth was
  requested and it keeps the API surface simple to demo.
- `orders` query supports filtering by `state` and `assigneeId` (covers "My
  work" / "All orders" style queries from the mockup) since "listing orders"
  is required but not detailed further.
