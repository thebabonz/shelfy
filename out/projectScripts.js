"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPackageScripts = readPackageScripts;
exports.resolveProjectScriptCommand = resolveProjectScriptCommand;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const jsonc_parser_1 = require("jsonc-parser");
async function readPackageScripts(projectPath) {
    const packageJson = await readProjectPackageJson(projectPath);
    const scripts = Object.entries(packageJson.scripts ?? {}).filter((entry) => typeof entry[1] === "string");
    return scripts
        .map(([name, command]) => ({ name, command }))
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}
async function resolveProjectScriptCommand(projectPath, script) {
    if (script.kind === "custom") {
        return script.command;
    }
    const packageJson = await readProjectPackageJson(projectPath);
    const packageScript = packageJson.scripts?.[script.scriptName];
    if (typeof packageScript !== "string") {
        throw new Error(`Script "${script.scriptName}" was not found in package.json.`);
    }
    const packageManager = await detectPackageManager(projectPath, packageJson);
    return `${packageManager} run ${formatScriptName(script.scriptName)}`;
}
async function readProjectPackageJson(projectPath) {
    const packageJsonPath = path.join(projectPath, "package.json");
    const raw = await fs.readFile(packageJsonPath, "utf8");
    return (0, jsonc_parser_1.parse)(raw);
}
async function detectPackageManager(projectPath, packageJson) {
    if (typeof packageJson.packageManager === "string") {
        const normalized = packageJson.packageManager.toLowerCase();
        if (normalized.startsWith("pnpm@")) {
            return "pnpm";
        }
        if (normalized.startsWith("yarn@")) {
            return "yarn";
        }
        if (normalized.startsWith("bun@")) {
            return "bun";
        }
    }
    if (await fileExists(path.join(projectPath, "pnpm-lock.yaml"))) {
        return "pnpm";
    }
    if (await fileExists(path.join(projectPath, "yarn.lock"))) {
        return "yarn";
    }
    if ((await fileExists(path.join(projectPath, "bun.lock"))) ||
        (await fileExists(path.join(projectPath, "bun.lockb")))) {
        return "bun";
    }
    return "npm";
}
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
function formatScriptName(scriptName) {
    return /\s/.test(scriptName) ? `"${scriptName.replace(/"/g, '\\"')}"` : scriptName;
}
//# sourceMappingURL=projectScripts.js.map