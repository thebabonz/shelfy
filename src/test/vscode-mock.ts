/**
 * Registers a minimal vscode module mock so that tests can run outside of a VS Code extension host.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module") as {
  _resolveFilename: (request: string, ...args: unknown[]) => string;
};

const MOCK_ID = "__vscode_mock__";

const vscodeMock = {
  workspace: {
    getConfiguration: (_section?: string) => ({
      get: <T>(_key: string, defaultValue: T): T => defaultValue,
      inspect: <T>(_key: string): { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined =>
        undefined,
    }),
  },
};

// Intercept require('vscode') resolution so it returns our mock
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]): string {
  if (request === "vscode") {
    return MOCK_ID;
  }
  return originalResolve.call(this, request, ...args);
};

// Register the mock in the require cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(require as any).cache[MOCK_ID] = {
  id: MOCK_ID,
  filename: MOCK_ID,
  loaded: true,
  exports: vscodeMock,
  paths: [],
  children: [],
  parent: null,
};
