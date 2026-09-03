import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { MongoClient, type Db } from 'mongodb';
import { loadConfig } from './config';
import { createContainer } from './container/container';
import { createContextFactory, type GraphQLContext } from './graphql/context';
import { formatError } from './graphql/errors';
import { resolvers, typeDefs } from './graphql/schema';

export function createApolloServer(): ApolloServer<GraphQLContext> {
  return new ApolloServer<GraphQLContext>({ typeDefs, resolvers, formatError });
}

export async function connectMongo(uri: string, dbName: string): Promise<{ client: MongoClient; db: Db }> {
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(dbName) };
}

export async function bootstrap(): Promise<{ url: string; client: MongoClient }> {
  const config = loadConfig();
  const { client, db } = await connectMongo(config.mongo.uri, config.mongo.dbName);
  const container = createContainer(config, db);
  const server = createApolloServer();

  const { url } = await startStandaloneServer(server, {
    listen: { port: config.port },
    context: createContextFactory(container),
  });

  console.log(`🚀 Store Apps GraphQL API ready at ${url}`);
  return { url, client };
}
