import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.spec.ts', '**/__tests__/**/*.integration.spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testTimeout: 180000,
  maxWorkers: 1,
};

export default config;
