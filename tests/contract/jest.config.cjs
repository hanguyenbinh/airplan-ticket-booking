/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/specs/**/*.spec.ts'],
  moduleFileExtensions: ['js', 'json', 'ts'],
};
