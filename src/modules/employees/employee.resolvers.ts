import type { GraphQLContext } from '../../graphql/context';

export const employeeResolvers = {
  Query: {
    employees: (_parent: unknown, _args: unknown, ctx: GraphQLContext) => ctx.employeeService.listEmployees(),
  },
};
