module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '..',
  // src is a root so Jest crawls it for coverage: files no test imports would
  // otherwise be absent from the report entirely rather than counted at 0%.
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.ts',
    '!<rootDir>/src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],

  coverageThreshold: {
    global: {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^vscode$': '<rootDir>/tests/fixtures/mocks/vscode.ts',
  },
  verbose: true,
  // Scanner tests build real ts.Program instances; several legitimately take
  // 6-8s, and coverage instrumentation pushes them past a 10s budget. This is
  // a hang backstop, not a performance budget — the whole suite runs in ~35s.
  testTimeout: 30000,
};