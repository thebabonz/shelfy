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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_test_1 = __importDefault(require("node:test"));
const treeBehavior_1 = require("../treeBehavior");
function readManifest() {
    const manifestPath = path.resolve(__dirname, "..", "..", "package.json");
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}
(0, node_test_1.default)("drag and drop mime types are disabled outside edit mode", () => {
    strict_1.default.deepEqual((0, treeBehavior_1.getGlobalProjectsTreeMimeTypes)(false), []);
});
(0, node_test_1.default)("drag and drop mime types are enabled in edit mode", () => {
    strict_1.default.deepEqual((0, treeBehavior_1.getGlobalProjectsTreeMimeTypes)(true), [treeBehavior_1.GLOBAL_PROJECTS_TREE_MIME]);
});
(0, node_test_1.default)("project rows do not expose an open command in edit mode", () => {
    strict_1.default.equal((0, treeBehavior_1.getProjectRowCommandDefinition)(true), undefined);
    strict_1.default.deepEqual((0, treeBehavior_1.getProjectRowCommandDefinition)(false), {
        command: "globalProjects.openProjectFromRow",
        title: "Open Project"
    });
});
(0, node_test_1.default)("manifest hides project open actions in edit mode", () => {
    const menuItems = readManifest().contributes.menus["view/item/context"];
    const commandsToCheck = [
        "globalProjects.openProject",
        "globalProjects.openProjectInNewWindow",
        "globalProjects.openInExplorer"
    ];
    for (const command of commandsToCheck) {
        const menuItem = menuItems.find((item) => item.command === command);
        strict_1.default.ok(menuItem, `Expected to find menu contribution for ${command}`);
        strict_1.default.match(menuItem.when ?? "", /!globalProjects\.editMode/);
    }
});
//# sourceMappingURL=editModeBehavior.test.js.map