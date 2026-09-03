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

### Example operations

A shared fragment keeps the list, detail, and mutation responses in sync instead of
repeating the same field selection in every operation:

```graphql
fragment OrderSummary on Order {
  id
  ref
  state
  type
  assignee { name code }
}

query MyWork($assigneeId: ID!) {
  orders(assigneeId: $assigneeId) {
    ...OrderSummary
    lineItems { sku status }
  }
}

query OneOrder($id: ID!) {
  order(id: $id) {
    ...OrderSummary
    lineItems { sku status }
  }
}

mutation Claim($id: ID!, $employeeId: ID!) {
  transitionOrder(id: $id, to: IN_PROGRESS, employeeId: $employeeId) {
    ...OrderSummary
  }
}

mutation Complete($id: ID!) {
  transitionOrder(id: $id, to: COMPLETE) {
    ...OrderSummary
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
value is on its own.

A rejected mutation returns a standard GraphQL error with a stable `extensions.code`
(`INVALID_TRANSITION`, `ASSIGNEE_REQUIRED`, `ALREADY_ASSIGNED`, `LINE_ITEM_MISSING`,
`LINE_ITEMS_PENDING`, `ORDER_CLOSED`, `NOT_FOUND`, `BAD_USER_INPUT`) rather than a
generic 500, so a client can branch on the failure reason.

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
