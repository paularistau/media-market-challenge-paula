import { ApolloServer } from '@apollo/server';
import type { Db } from 'mongodb';
import type { AppConfig } from '../../src/config';
import { createContainer } from '../../src/container/container';
import { createContextFactory, type GraphQLContext } from '../../src/graphql/context';
import { formatError } from '../../src/graphql/errors';
import { resolvers, typeDefs } from '../../src/graphql/schema';

const testConfig: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  mongo: { uri: 'unused-in-tests', dbName: 'test' },
};

export interface TestApi {
  server: ApolloServer<GraphQLContext>;
  contextValue: () => Promise<GraphQLContext>;
}

/** Builds a real Apollo Server + real IoC container against an already-connected test `Db` — no HTTP listener involved. */
export function createTestApi(db: Db): TestApi {
  const container = createContainer(testConfig, db);
  const server = new ApolloServer<GraphQLContext>({ typeDefs, resolvers, formatError });
  return { server, contextValue: createContextFactory(container) };
}

export interface GraphQLTestResult<TData> {
  data?: TData | null;
  errors?: readonly { message: string; extensions?: Record<string, unknown> }[];
}

/**
 * Runs a real GraphQL document through the real schema (no HTTP), and unwraps
 * Apollo's `executeOperation` response envelope down to `{ data, errors }` —
 * which is what every test actually wants to assert on.
 */
export async function execute<TData = Record<string, unknown>>(
  api: TestApi,
  query: string,
  variables?: Record<string, unknown>,
): Promise<GraphQLTestResult<TData>> {
  const response = await api.server.executeOperation<TData>(
    { query, variables },
    { contextValue: await api.contextValue() },
  );
  if (response.body.kind !== 'single') {
    throw new Error(`Expected a single GraphQL response, got: ${response.body.kind}`);
  }
  return response.body.singleResult;
}
