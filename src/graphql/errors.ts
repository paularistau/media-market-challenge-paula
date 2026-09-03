import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';
import { DomainError } from '../errors/domain-errors';

export function formatError(formattedError: GraphQLFormattedError, error: unknown): GraphQLFormattedError {
  const original = unwrapResolverError(error);

  if (original instanceof DomainError) {
    return {
      ...formattedError,
      message: original.message,
      extensions: { ...formattedError.extensions, code: original.code },
    };
  }

  const code = formattedError.extensions?.code;
  if (typeof code === 'string' && code !== 'INTERNAL_SERVER_ERROR') {
    return formattedError;
  }

  return {
    ...formattedError,
    message: 'Internal server error',
    extensions: { ...formattedError.extensions, code: 'INTERNAL_SERVER_ERROR' },
  };
}
