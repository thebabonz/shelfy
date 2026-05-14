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
exports.addProjectScriptsToProject = addProjectScriptsToProject;
exports.updateProjectScriptInProject = updateProjectScriptInProject;
const crypto = __importStar(require("crypto"));
function addProjectScriptsToProject(project, scripts) {
    const projectScripts = project.scripts ?? (project.scripts = []);
    const added = [];
    for (const script of scripts) {
        if (hasMatchingProjectScript(projectScripts, script)) {
            continue;
        }
        const nextScript = createProjectScript(script);
        projectScripts.push(nextScript);
        added.push(nextScript);
    }
    return added;
}
function updateProjectScriptInProject(project, scriptId, nextScript) {
    const projectScripts = project.scripts ?? [];
    const index = projectScripts.findIndex((script) => script.id === scriptId);
    if (index < 0) {
        throw new Error("Script not found.");
    }
    if (hasMatchingProjectScript(projectScripts, nextScript, scriptId)) {
        throw new Error("That script is already configured for this project.");
    }
    const updated = createProjectScript(nextScript, scriptId);
    projectScripts[index] = updated;
    return updated;
}
function createProjectScript(script, id = crypto.randomUUID()) {
    return script.kind === "package"
        ? {
            kind: "package",
            id,
            scriptName: script.scriptName
        }
        : {
            kind: "custom",
            id,
            name: script.name,
            command: script.command
        };
}
function hasMatchingProjectScript(existingScripts, nextScript, excludedScriptId) {
    if (nextScript.kind === "package") {
        return existingScripts.some((script) => script.id !== excludedScriptId &&
            script.kind === "package" &&
            script.scriptName === nextScript.scriptName);
    }
    return existingScripts.some((script) => script.id !== excludedScriptId &&
        script.kind === "custom" &&
        script.command === nextScript.command);
}
//# sourceMappingURL=projectScriptState.js.map