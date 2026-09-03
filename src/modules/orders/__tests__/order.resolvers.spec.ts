import type { Db } from 'mongodb';
import { MemoryMongo } from '../../../../test/helpers/memory-mongo';
import { createTestApi, execute, type TestApi } from '../../../../test/helpers/test-server';
import { MongoEmployeeRepository } from '../../employees/employee.repository';
import { employeeSeed } from '../../employees/employee.seed';
import { MongoOrderRepository } from '../order.repository';
import { buildOrderSeed } from '../order.seed';

interface LineItemFragment {
  sku: string;
  status: string;
}

interface OrdersData {
  orders: Array<{ ref: string; state: string }>;
}

interface OrderData {
  order: {
    ref: string;
    state: string;
    assignee: { name: string; code: string } | null;
    customer: { name: string };
    lineItems: LineItemFragment[];
    history: Array<{ state: string; by: string }>;
  } | null;
}

interface EmployeesData {
  employees: Array<{ name: string; code: string }>;
}

type DestinationFragment =
  | { __typename: 'PickupLockerDestination'; lockerCode: string; floor: string }
  | { __typename: 'ShippingAddressDestination'; street: string; postalCode: string; city: string }
  | { __typename: 'CollectionDeskDestination'; deskNumber: string; area: string };

interface OrderDestinationData {
  order: { ref: string; destination: DestinationFragment } | null;
}

interface TransitionData {
  transitionOrder: { ref: string; state: string; assignee: { code: string } | null } | null;
}

interface MarkPickedData {
  markLineItemPicked: { lineItems: LineItemFragment[] };
}

interface ReportMissingData {
  reportLineItemMissing: { lineItems: LineItemFragment[] };
}

interface ResolveLineItemData {
  resolveLineItem: { lineItems: LineItemFragment[] };
}

const ORDERS_QUERY = /* GraphQL */ `
  query Orders($state: [OrderState!], $assigneeId: ID) {
    orders(state: $state, assigneeId: $assigneeId) {
      ref
      state
    }
  }
`;

const ORDER_QUERY = /* GraphQL */ `
  query Order($id: ID!) {
    order(id: $id) {
      ref
      state
      assignee {
        name
        code
      }
      customer {
        name
      }
      lineItems {
        sku
        status
      }
      history {
        state
        by
      }
    }
  }
`;

const TRANSITION_MUTATION = /* GraphQL */ `
  mutation Transition($id: ID!, $to: OrderState!, $employeeId: ID) {
    transitionOrder(id: $id, to: $to, employeeId: $employeeId) {
      ref
      state
      assignee {
        code
      }
    }
  }
`;

const REPORT_MISSING_MUTATION = /* GraphQL */ `
  mutation ReportMissing($orderId: ID!, $sku: String!) {
    reportLineItemMissing(orderId: $orderId, sku: $sku) {
      lineItems {
        sku
        status
      }
    }
  }
`;

const MARK_PICKED_MUTATION = /* GraphQL */ `
  mutation MarkPicked($orderId: ID!, $sku: String!) {
    markLineItemPicked(orderId: $orderId, sku: $sku) {
      lineItems {
        sku
        status
      }
    }
  }
`;

const RESOLVE_LINE_ITEM_MUTATION = /* GraphQL */ `
  mutation Resolve($orderId: ID!, $sku: String!, $resolution: LineItemResolution!) {
    resolveLineItem(orderId: $orderId, sku: $sku, resolution: $resolution) {
      lineItems {
        sku
        status
      }
    }
  }
`;

const ORDER_DESTINATION_QUERY = /* GraphQL */ `
  query OrderDestination($id: ID!) {
    order(id: $id) {
      ref
      destination {
        __typename
        ... on PickupLockerDestination {
          lockerCode
          floor
        }
        ... on ShippingAddressDestination {
          street
          postalCode
          city
        }
        ... on CollectionDeskDestination {
          deskNumber
          area
        }
      }
    }
  }
`;

const EMPLOYEES_QUERY = /* GraphQL */ `
  query Employees {
    employees {
      name
      code
    }
  }
`;

describe('GraphQL API', () => {
  const mem = new MemoryMongo();
  let db: Db;
  let api: TestApi;
  let refToId: Record<string, string>;
  let bakkerId: string;
  let matosId: string;

  beforeAll(async () => {
    db = await mem.start();
  }, 60_000);

  afterAll(async () => {
    await mem.stop();
  });

  beforeEach(async () => {
    await mem.dropAllCollections();

    const employeeRepository = new MongoEmployeeRepository(db);
    const orderRepository = new MongoOrderRepository(db);

    const employees = await employeeRepository.insertMany(employeeSeed);
    const employeesByCode = Object.fromEntries(employees.map((e) => [e.code, e]));
    bakkerId = employeesByCode['EMP-0714']!.id;
    matosId = employeesByCode['EMP-0301']!.id;

    const orders = await orderRepository.insertMany(buildOrderSeed(employeesByCode));
    refToId = Object.fromEntries(orders.map((o) => [o.ref, o.id]));

    api = createTestApi(db);
  });

  describe('orders query', () => {
    it('lists every seeded order when unfiltered', async () => {
      const result = await execute<OrdersData>(api, ORDERS_QUERY);
      expect(result.errors).toBeUndefined();
      expect(result.data?.orders).toHaveLength(8);
    });

    it('filters by state', async () => {
      const result = await execute<OrdersData>(api, ORDERS_QUERY, { state: ['OPEN'] });
      expect(result.errors).toBeUndefined();
      expect(result.data?.orders.map((o) => o.ref).sort()).toEqual(
        ['ORD-4791', 'ORD-4796', 'ORD-4809', 'ORD-4821'].sort(),
      );
    });

    it('filters by assignee ("My work")', async () => {
      const result = await execute<OrdersData>(api, ORDERS_QUERY, { assigneeId: bakkerId });
      expect(result.errors).toBeUndefined();
      expect(result.data?.orders).toHaveLength(3);
    });
  });

  describe('order query', () => {
    it('resolves nested fields, including the assignee', async () => {
      const result = await execute<OrderData>(api, ORDER_QUERY, { id: refToId['ORD-4815'] });
      expect(result.errors).toBeUndefined();
      expect(result.data?.order).toMatchObject({
        ref: 'ORD-4815',
        state: 'IN_PROGRESS',
        assignee: { name: 'N. Bakker', code: 'EMP-0714' },
        customer: { name: 'Marta Kowalski' },
      });
      expect(result.data?.order?.lineItems).toHaveLength(4);
    });

    it('returns null (not an error) for a well-formed but unknown id', async () => {
      const result = await execute<OrderData>(api, ORDER_QUERY, { id: '507f1f77bcf86cd799439011' });
      expect(result.errors).toBeUndefined();
      expect(result.data?.order).toBeNull();
    });

    it('returns BAD_USER_INPUT for a malformed id', async () => {
      const result = await execute<OrderData>(api, ORDER_QUERY, { id: 'not-an-id' });
      expect(result.data?.order).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });
  });

  describe('destination union', () => {
    it('resolves the PickupLockerDestination member via inline fragment', async () => {
      const result = await execute<OrderDestinationData>(api, ORDER_DESTINATION_QUERY, {
        id: refToId['ORD-4821'],
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.order?.destination).toEqual({
        __typename: 'PickupLockerDestination',
        lockerCode: 'A-12',
        floor: 'Ground floor',
      });
    });

    it('resolves the ShippingAddressDestination member via inline fragment', async () => {
      const result = await execute<OrderDestinationData>(api, ORDER_DESTINATION_QUERY, {
        id: refToId['ORD-4818'],
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.order?.destination).toEqual({
        __typename: 'ShippingAddressDestination',
        street: 'Carrer de Mallorca 214',
        postalCode: '08008',
        city: 'Barcelona',
      });
    });

    it('resolves the CollectionDeskDestination member via inline fragment', async () => {
      const result = await execute<OrderDestinationData>(api, ORDER_DESTINATION_QUERY, {
        id: refToId['ORD-4815'],
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.order?.destination).toEqual({
        __typename: 'CollectionDeskDestination',
        deskNumber: '2',
        area: 'Customer service',
      });
    });
  });

  describe('employees query', () => {
    it('lists the seeded roster', async () => {
      const result = await execute<EmployeesData>(api, EMPLOYEES_QUERY);
      expect(result.errors).toBeUndefined();
      expect(result.data?.employees).toHaveLength(employeeSeed.length);
    });
  });

  describe('transitionOrder — demo scenarios', () => {
    it('rejects skipping straight from OPEN to COMPLETE ("complete an unassigned order")', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4796'],
        to: 'COMPLETE',
      });
      expect(result.data?.transitionOrder).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('INVALID_TRANSITION');
    });

    it('rejects reopening a COMPLETE order', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4802'],
        to: 'IN_PROGRESS',
      });
      expect(result.data?.transitionOrder).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('INVALID_TRANSITION');
    });

    it('blocks completion while a line item is reported missing', async () => {
      const orderId = refToId['ORD-4815']!;
      const missing = await execute<ReportMissingData>(api, REPORT_MISSING_MUTATION, { orderId, sku: 'AIR-F5L' });
      expect(missing.errors).toBeUndefined();

      const complete = await execute<TransitionData>(api, TRANSITION_MUTATION, { id: orderId, to: 'COMPLETE' });
      expect(complete.data?.transitionOrder).toBeNull();
      expect(complete.errors?.[0]?.extensions?.code).toBe('LINE_ITEM_MISSING');
    });

    it('blocks completion while a line item is still pending (none missing)', async () => {
      const orderId = refToId['ORD-4818']!;
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, { id: orderId, to: 'COMPLETE' });
      expect(result.data?.transitionOrder).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('LINE_ITEMS_PENDING');
    });
  });

  describe('transitionOrder — assignment rules', () => {
    it('requires an assignee to enter IN_PROGRESS', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4809'],
        to: 'IN_PROGRESS',
      });
      expect(result.data?.transitionOrder).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('ASSIGNEE_REQUIRED');
    });

    it('claims and transitions atomically when employeeId is supplied', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4809'],
        to: 'IN_PROGRESS',
        employeeId: bakkerId,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.transitionOrder).toMatchObject({
        ref: 'ORD-4809',
        state: 'IN_PROGRESS',
        assignee: { code: 'EMP-0714' },
      });
    });

    it('rejects claiming an order already assigned to someone else', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4791'],
        to: 'IN_PROGRESS',
        employeeId: bakkerId,
      });
      expect(result.data?.transitionOrder).toBeNull();
      expect(result.errors?.[0]?.extensions?.code).toBe('ALREADY_ASSIGNED');
    });

    it('lets the already-assigned employee claim their own order (idempotent)', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4791'],
        to: 'IN_PROGRESS',
        employeeId: matosId,
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.transitionOrder).toMatchObject({ state: 'IN_PROGRESS' });
    });
  });

  describe('transitionOrder — bad input', () => {
    it('rejects a malformed order id', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, { id: 'not-an-id', to: 'IN_PROGRESS' });
      expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });

    it('rejects a well-formed but unknown order id', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: '507f1f77bcf86cd799439011',
        to: 'IN_PROGRESS',
      });
      expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    });

    it('rejects an unknown enum value for "to" at the GraphQL layer', async () => {
      const result = await execute<TransitionData>(api, TRANSITION_MUTATION, {
        id: refToId['ORD-4809'],
        to: 'DELETED',
      });
      expect(result.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
    });
  });

  describe('line item mutations', () => {
    it('marks a pending line item picked, then unblocks completion once every item is resolved', async () => {
      const orderId = refToId['ORD-4818']!;
      const picked = await execute<MarkPickedData>(api, MARK_PICKED_MUTATION, { orderId, sku: 'MSE-GX9' });
      expect(picked.errors).toBeUndefined();
      expect(picked.data?.markLineItemPicked.lineItems).toEqual(
        expect.arrayContaining([{ sku: 'MSE-GX9', status: 'PICKED' }]),
      );

      const complete = await execute<TransitionData>(api, TRANSITION_MUTATION, { id: orderId, to: 'COMPLETE' });
      expect(complete.errors).toBeUndefined();
      expect(complete.data?.transitionOrder).toMatchObject({ state: 'COMPLETE' });
    });

    it('resolves a missing item back to pending on RECHECK', async () => {
      const orderId = refToId['ORD-4815']!;
      await execute<ReportMissingData>(api, REPORT_MISSING_MUTATION, { orderId, sku: 'AIR-F5L' });
      const result = await execute<ResolveLineItemData>(api, RESOLVE_LINE_ITEM_MUTATION, {
        orderId,
        sku: 'AIR-F5L',
        resolution: 'RECHECK',
      });
      expect(result.errors).toBeUndefined();
      expect(result.data?.resolveLineItem.lineItems).toEqual(
        expect.arrayContaining([{ sku: 'AIR-F5L', status: 'PENDING' }]),
      );
    });

    it('cancels a missing item on CANCEL, and cancelled items no longer block completion', async () => {
      const orderId = refToId['ORD-4818']!;
      await execute<ReportMissingData>(api, REPORT_MISSING_MUTATION, { orderId, sku: 'MSE-GX9' });
      await execute<ResolveLineItemData>(api, RESOLVE_LINE_ITEM_MUTATION, { orderId, sku: 'MSE-GX9', resolution: 'CANCEL' });

      const complete = await execute<TransitionData>(api, TRANSITION_MUTATION, { id: orderId, to: 'COMPLETE' });
      expect(complete.errors).toBeUndefined();
      expect(complete.data?.transitionOrder).toMatchObject({ state: 'COMPLETE' });
    });

    it('rejects mutating line items on a COMPLETE order', async () => {
      const result = await execute<MarkPickedData>(api, MARK_PICKED_MUTATION, {
        orderId: refToId['ORD-4802'],
        sku: 'KBD-M75',
      });
      expect(result.errors?.[0]?.extensions?.code).toBe('ORDER_CLOSED');
    });

    it('rejects an unknown sku', async () => {
      const result = await execute<MarkPickedData>(api, MARK_PICKED_MUTATION, {
        orderId: refToId['ORD-4818'],
        sku: 'NOT-A-REAL-SKU',
      });
      expect(result.errors?.[0]?.extensions?.code).toBe('NOT_FOUND');
    });
  });
});
