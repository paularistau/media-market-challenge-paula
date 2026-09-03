/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/*.spec.ts'],
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
  testTimeout: 30000,
  clearMocks: true,
};
