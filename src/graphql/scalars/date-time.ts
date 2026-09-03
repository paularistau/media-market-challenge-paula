import { GraphQLScalarType, Kind } from 'graphql';
import { BadUserInputError } from '../../errors/domain-errors';

function toValidDate(value: unknown): Date {
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) {
    throw new BadUserInputError(`Invalid DateTime value: ${JSON.stringify(value)}`);
  }
  return date;
}

export const dateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'An ISO-8601 date-time string, e.g. 2026-09-03T14:05:00.000Z',
  serialize: (value: unknown): string => toValidDate(value).toISOString(),
  parseValue: (value: unknown): Date => toValidDate(value),
  parseLiteral: (ast) => {
    if (ast.kind !== Kind.STRING) {
      throw new BadUserInputError('DateTime must be provided as a string literal');
    }
    return toValidDate(ast.value);
  },
});
