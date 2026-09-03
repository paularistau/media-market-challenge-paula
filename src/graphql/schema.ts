import { employeeResolvers } from '../modules/employees/employee.resolvers';
import { employeeTypeDefs } from '../modules/employees/employee.schema';
import { orderResolvers } from '../modules/orders/order.resolvers';
import { orderTypeDefs } from '../modules/orders/order.schema';
import { rootTypeDefs } from './root.schema';
import { dateTimeScalar } from './scalars/date-time';

/**
 * Each module owns its own SDL slice and resolver map; this is the one place
 * that knows they all get merged into a single schema. `orders` declares the
 * base `type Query` / `type Mutation`, and `employees` extends them — plain
 * string concatenation is enough for that, no schema-stitching library needed.
 */
export const typeDefs = [rootTypeDefs, employeeTypeDefs, orderTypeDefs];

export const resolvers = {
  DateTime: dateTimeScalar,
  Query: {
    ...employeeResolvers.Query,
    ...orderResolvers.Query,
  },
  Mutation: {
    ...orderResolvers.Mutation,
  },
  Order: orderResolvers.Order,
};
