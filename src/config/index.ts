import dotenv from 'dotenv';

dotenv.config();

export type NodeEnv = 'development' | 'test' | 'production';

export interface AppConfig {
  readonly nodeEnv: NodeEnv;
  readonly port: number;
  readonly mongo: {
    readonly uri: string;
    readonly dbName: string;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function readString(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

function readPort(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new ConfigError(`Environment variable ${name} must be a valid port number, got: "${raw}"`);
  }
  return parsed;
}

function readNodeEnv(): NodeEnv {
  const raw = process.env.NODE_ENV ?? 'development';
  if (raw === 'development' || raw === 'test' || raw === 'production') return raw;
  throw new ConfigError(
    `NODE_ENV must be one of "development" | "test" | "production", got: "${raw}"`,
  );
}

/**
 * Reads and validates configuration from the environment (see .env.example).
 * Called once at bootstrap; the resulting AppConfig is what gets bound into
 * the IoC container, rather than modules reading process.env ad hoc.
 */
export function loadConfig(): AppConfig {
  return {
    nodeEnv: readNodeEnv(),
    port: readPort('PORT', 4000),
    mongo: {
      uri: readString('MONGODB_URI', 'mongodb://localhost:27017'),
      dbName: readString('MONGODB_DB_NAME', 'store_apps'),
    },
  };
}
