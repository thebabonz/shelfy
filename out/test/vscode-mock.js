"use strict";
/**
 * Registers a minimal vscode module mock so that tests can run outside of a VS Code extension host.
 */
Object.defineProperty(exports, "__esModule", { value: true });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("module");
const MOCK_ID = "__vscode_mock__";
const vscodeMock = {
    workspace: {
        getConfiguration: (_section) => ({
            get: (_key, defaultValue) => defaultValue,
            inspect: (_key) => undefined,
        }),
    },
};
// Intercept require('vscode') resolution so it returns our mock
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
    if (request === "vscode") {
        return MOCK_ID;
    }
    return originalResolve.call(this, request, ...args);
};
// Register the mock in the require cache
// eslint-disable-next-line @typescript-eslint/no-explicit-any
require.cache[MOCK_ID] = {
    id: MOCK_ID,
    filename: MOCK_ID,
    loaded: true,
    exports: vscodeMock,
    paths: [],
    children: [],
    parent: null,
};
//# sourceMappingURL=vscode-mock.js.map