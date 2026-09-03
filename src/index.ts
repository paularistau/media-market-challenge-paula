import 'reflect-metadata';
import { bootstrap } from './server';

async function main(): Promise<void> {
  const { client } = await bootstrap();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\nReceived ${signal}, closing MongoDB connection...`);
    await client.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exitCode = 1;
});
