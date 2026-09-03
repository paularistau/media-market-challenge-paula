import type { GraphQLContext } from '../../graphql/context';
import type { Employee } from '../employees/employee.types';
import type { LineItemResolution, Order, OrderState } from './order.types';

interface OrdersArgs {
  state?: OrderState[];
  assigneeId?: string;
}

export const orderResolvers = {
  Query: {
    orders: (_parent: unknown, args: OrdersArgs, ctx: GraphQLContext): Promise<Order[]> =>
      ctx.orderService.listOrders({ states: args.state, assigneeId: args.assigneeId }),
    order: (_parent: unknown, args: { id: string }, ctx: GraphQLContext): Promise<Order | null> =>
      ctx.orderService.getOrder(args.id),
  },
  Mutation: {
    transitionOrder: (
      _parent: unknown,
      args: { id: string; to: OrderState; employeeId?: string | null },
      ctx: GraphQLContext,
    ): Promise<Order> => ctx.orderService.transitionOrder(args.id, args.to, args.employeeId),
    markLineItemPicked: (
      _parent: unknown,
      args: { orderId: string; sku: string },
      ctx: GraphQLContext,
    ): Promise<Order> => ctx.orderService.markLineItemPicked(args.orderId, args.sku),
    reportLineItemMissing: (
      _parent: unknown,
      args: { orderId: string; sku: string },
      ctx: GraphQLContext,
    ): Promise<Order> => ctx.orderService.reportLineItemMissing(args.orderId, args.sku),
    resolveLineItem: (
      _parent: unknown,
      args: { orderId: string; sku: string; resolution: LineItemResolution },
      ctx: GraphQLContext,
    ): Promise<Order> => ctx.orderService.resolveLineItem(args.orderId, args.sku, args.resolution),
  },
  Order: {
    assignee: (parent: Order, _args: unknown, ctx: GraphQLContext): Promise<Employee | null> =>
      parent.assigneeId ? ctx.employeeService.findEmployee(parent.assigneeId) : Promise.resolve(null),
  },
};
