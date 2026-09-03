import { employeeResolvers } from '../modules/employees/employee.resolvers';
import { employeeTypeDefs } from '../modules/employees/employee.schema';
import { orderResolvers } from '../modules/orders/order.resolvers';
import { orderTypeDefs } from '../modules/orders/order.schema';
import { rootTypeDefs } from './root.schema';
import { dateTimeScalar } from './scalars/date-time';

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
  Destination: orderResolvers.Destination,
};
