/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
  // reflect-metadata must be loaded before any @injectable/@inject-decorated
  // class is evaluated; setupFiles runs before the test framework (and thus
  // before the test file's own imports) so this is early enough.
  setupFiles: ['reflect-metadata'],
  collectCoverage: false,
  collectCoverageFrom: [
    'src/modules/**/*.ts',
    'src/graphql/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/*.seed.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
  // mongodb-memory-server downloads/boots a real mongod; give it room.
  testTimeout: 30000,
  clearMocks: true,
};
