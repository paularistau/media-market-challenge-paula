import { unwrapResolverError } from '@apollo/server/errors';
import type { GraphQLFormattedError } from 'graphql';
import { DomainError } from '../errors/domain-errors';

/**
 * Maps thrown errors onto `extensions.code` the way the rest of the API
 * relies on:
 *  - a DomainError (thrown by services) surfaces as its own `code` verbatim
 *    (INVALID_TRANSITION, ASSIGNEE_REQUIRED, NOT_FOUND, ...)
 *  - GraphQL's own parsing/validation/argument-coercion errors already carry
 *    a sensible code (BAD_USER_INPUT, GRAPHQL_VALIDATION_FAILED, ...) — left
 *    untouched
 *  - anything else is an unexpected bug: don't leak internals to the client
 */
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
