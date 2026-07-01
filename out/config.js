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
exports.LEGACY_CONFIGURATION_SECTION = exports.SHELFY_CONFIGURATION_SECTION = void 0;
exports.getShelfySetting = getShelfySetting;
exports.affectsShelfySetting = affectsShelfySetting;
exports.getStorageMode = getStorageMode;
const vscode = __importStar(require("vscode"));
exports.SHELFY_CONFIGURATION_SECTION = "shelfy";
exports.LEGACY_CONFIGURATION_SECTION = "globalProjects";
function hasExplicitValue(inspection) {
    return (inspection?.globalValue !== undefined ||
        inspection?.workspaceValue !== undefined ||
        inspection?.workspaceFolderValue !== undefined);
}
function getShelfySetting(key, defaultValue) {
    const shelfyConfig = vscode.workspace.getConfiguration(exports.SHELFY_CONFIGURATION_SECTION);
    const shelfyInspection = shelfyConfig.inspect(key);
    if (hasExplicitValue(shelfyInspection)) {
        return shelfyConfig.get(key, defaultValue);
    }
    const legacyConfig = vscode.workspace.getConfiguration(exports.LEGACY_CONFIGURATION_SECTION);
    const legacyInspection = legacyConfig.inspect(key);
    if (hasExplicitValue(legacyInspection)) {
        return legacyConfig.get(key, defaultValue);
    }
    return shelfyConfig.get(key, defaultValue);
}
function affectsShelfySetting(event, key) {
    return (event.affectsConfiguration(`${exports.SHELFY_CONFIGURATION_SECTION}.${key}`) ||
        event.affectsConfiguration(`${exports.LEGACY_CONFIGURATION_SECTION}.${key}`));
}
function getStorageMode() {
    return getShelfySetting("storageMode", "profile");
}
//# sourceMappingURL=config.js.map