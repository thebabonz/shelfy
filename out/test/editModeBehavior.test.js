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
const projectScriptState_1 = require("../projectScriptState");
const treeFilter_1 = require("../treeFilter");
const treeBehavior_1 = require("../treeBehavior");
function readManifest() {
    const manifestPath = path.resolve(__dirname, "..", "..", "package.json");
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}
function createTree() {
    return [
        {
            kind: "group",
            id: "frontend",
            name: "Frontend",
            children: [
                {
                    kind: "project",
                    id: "web-app",
                    name: "Web App",
                    projectPath: "C:\\projects\\web-app"
                },
                {
                    kind: "group",
                    id: "components",
                    name: "Components",
                    children: [
                        {
                            kind: "group",
                            id: "buttons",
                            name: "Buttons",
                            children: []
                        }
                    ]
                }
            ]
        },
        {
            kind: "group",
            id: "backend",
            name: "Backend",
            children: []
        },
        {
            kind: "project",
            id: "root-tool",
            name: "Root Tool",
            projectPath: "C:\\projects\\root-tool"
        }
    ];
}
function createProjectWithScripts() {
    return {
        kind: "project",
        id: "project-a",
        name: "Project A",
        projectPath: "C:\\projects\\project-a",
        scripts: [
            {
                kind: "custom",
                id: "custom-dev",
                name: "Dev Server",
                command: "npm run dev"
            },
            {
                kind: "package",
                id: "package-test",
                scriptName: "test"
            }
        ]
    };
}
(0, node_test_1.default)("drag and drop mime types are disabled outside edit mode", () => {
    strict_1.default.deepEqual((0, treeBehavior_1.getShelfyTreeMimeTypes)(false), []);
});
(0, node_test_1.default)("drag and drop mime types are enabled in edit mode", () => {
    strict_1.default.deepEqual((0, treeBehavior_1.getShelfyTreeMimeTypes)(true), [treeBehavior_1.SHELFY_TREE_MIME]);
});
(0, node_test_1.default)("project rows do not expose an open command in edit mode", () => {
    strict_1.default.equal((0, treeBehavior_1.getProjectRowCommandDefinition)(true), undefined);
    strict_1.default.deepEqual((0, treeBehavior_1.getProjectRowCommandDefinition)(false), {
        command: "shelfy.openProjectFromRow",
        title: "Open Project"
    });
});
(0, node_test_1.default)("manifest hides project open actions in edit mode", () => {
    const menuItems = readManifest().contributes.menus["view/item/context"];
    const commandsToCheck = [
        "shelfy.openProject",
        "shelfy.openProjectInNewWindow",
        "shelfy.openInExplorer"
    ];
    for (const command of commandsToCheck) {
        const menuItem = menuItems.find((item) => item.command === command);
        strict_1.default.ok(menuItem, `Expected to find menu contribution for ${command}`);
        strict_1.default.match(menuItem.when ?? "", /!shelfy\.editMode/);
    }
});
(0, node_test_1.default)("project move destinations include folders other than its current parent", () => {
    const destinations = (0, treeBehavior_1.getMoveDestinations)(createTree(), "root-tool");
    strict_1.default.deepEqual(destinations.map((destination) => destination.targetGroupId), ["frontend", "components", "buttons", "backend"]);
    strict_1.default.equal(destinations.some((destination) => destination.targetGroupId === undefined), false);
});
(0, node_test_1.default)("project inside a folder can move to root", () => {
    const destinations = (0, treeBehavior_1.getMoveDestinations)(createTree(), "web-app");
    strict_1.default.ok(destinations.some((destination) => destination.targetGroupId === undefined));
    strict_1.default.equal(destinations.some((destination) => destination.targetGroupId === "frontend"), false);
});
(0, node_test_1.default)("folder cannot move into itself or descendants", () => {
    const destinations = (0, treeBehavior_1.getMoveDestinations)(createTree(), "frontend");
    strict_1.default.deepEqual(destinations.map((destination) => destination.targetGroupId), ["backend"]);
});
(0, node_test_1.default)("root and current parent no-op move destinations are excluded", () => {
    const rootProjectDestinations = (0, treeBehavior_1.getMoveDestinations)(createTree(), "root-tool");
    const nestedProjectDestinations = (0, treeBehavior_1.getMoveDestinations)(createTree(), "web-app");
    strict_1.default.equal(rootProjectDestinations.some((destination) => destination.targetGroupId === undefined), false);
    strict_1.default.equal(nestedProjectDestinations.some((destination) => destination.targetGroupId === "frontend"), false);
});
(0, node_test_1.default)("manifest shows move action only for projects and folders in edit mode", () => {
    const menuItems = readManifest().contributes.menus["view/item/context"];
    const menuItem = menuItems.find((item) => item.command === "shelfy.moveItemToFolder");
    strict_1.default.ok(menuItem, "Expected to find menu contribution for shelfy.moveItemToFolder");
    strict_1.default.match(menuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.match(menuItem.when ?? "", /viewItem == group/);
    strict_1.default.match(menuItem.when ?? "", /viewItem == project/);
    strict_1.default.doesNotMatch(menuItem.when ?? "", /viewItem == script/);
});
(0, node_test_1.default)("editing a custom script preserves its identifier and updates its values", () => {
    const project = createProjectWithScripts();
    const updated = (0, projectScriptState_1.updateProjectScriptInProject)(project, "custom-dev", {
        kind: "custom",
        name: "API Dev",
        command: "pnpm dev"
    });
    strict_1.default.deepEqual(updated, {
        kind: "custom",
        id: "custom-dev",
        name: "API Dev",
        command: "pnpm dev"
    });
    strict_1.default.deepEqual(project.scripts?.[0], updated);
});
(0, node_test_1.default)("editing a script rejects a duplicate package script already on the project", () => {
    const project = createProjectWithScripts();
    (0, projectScriptState_1.addProjectScriptsToProject)(project, [{ kind: "package", scriptName: "build" }]);
    strict_1.default.throws(() => (0, projectScriptState_1.updateProjectScriptInProject)(project, "package-test", {
        kind: "package",
        scriptName: "build"
    }), /already configured/);
});
(0, node_test_1.default)("tree filter keeps ancestors of matching projects and matches project paths", () => {
    const filtered = (0, treeFilter_1.filterTreeNodes)(createTree(), "root-tool");
    strict_1.default.deepEqual(filtered, [
        {
            kind: "project",
            id: "root-tool",
            name: "Root Tool",
            projectPath: "C:\\projects\\root-tool"
        }
    ]);
    const pathFiltered = (0, treeFilter_1.filterTreeNodes)(createTree(), "projects\\web-app");
    strict_1.default.equal(pathFiltered.length, 1);
    strict_1.default.equal(pathFiltered[0]?.kind, "group");
    strict_1.default.equal(pathFiltered[0]?.id, "frontend");
});
(0, node_test_1.default)("tree filter keeps a full matching group subtree", () => {
    const filtered = (0, treeFilter_1.filterTreeNodes)(createTree(), "frontend");
    strict_1.default.deepEqual(filtered, [createTree()[0]]);
});
(0, node_test_1.default)("tree filter matches scripts on a project", () => {
    const nodes = [createProjectWithScripts()];
    const filteredByName = (0, treeFilter_1.filterTreeNodes)(nodes, "dev server");
    const filteredByCommand = (0, treeFilter_1.filterTreeNodes)(nodes, "pnpm dev");
    strict_1.default.equal(filteredByName.length, 1);
    strict_1.default.equal(filteredByCommand.length, 0);
    const updatedProject = createProjectWithScripts();
    (0, projectScriptState_1.updateProjectScriptInProject)(updatedProject, "custom-dev", {
        kind: "custom",
        name: "API Dev",
        command: "pnpm dev"
    });
    strict_1.default.equal((0, treeFilter_1.filterTreeNodes)([updatedProject], "pnpm dev").length, 1);
});
(0, node_test_1.default)("tree filter normalization trims and lowercases input", () => {
    strict_1.default.equal((0, treeFilter_1.normalizeTreeFilterText)("  FrontEnd  "), "frontend");
    strict_1.default.equal((0, treeFilter_1.normalizeTreeFilterText)("   "), undefined);
});
(0, node_test_1.default)("manifest contributes edit script action only for script items in edit mode", () => {
    const manifest = readManifest();
    const menuItems = manifest.contributes.menus["view/item/context"];
    const menuItem = menuItems.find((item) => item.command === "shelfy.editProjectScript");
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.editProjectScript"));
    strict_1.default.ok(menuItem, "Expected to find menu contribution for shelfy.editProjectScript");
    strict_1.default.match(menuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.match(menuItem.when ?? "", /viewItem == script/);
    strict_1.default.doesNotMatch(menuItem.when ?? "", /!shelfy\.editMode/);
});
(0, node_test_1.default)("manifest contributes filter actions in the view title", () => {
    const manifest = readManifest();
    const titleMenuItems = manifest.contributes.menus["view/title"];
    const setFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.setFilter");
    const clearFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.clearFilter");
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.setFilter"));
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.clearFilter"));
    strict_1.default.ok(setFilterMenuItem, "Expected to find menu contribution for shelfy.setFilter");
    strict_1.default.ok(clearFilterMenuItem, "Expected to find menu contribution for shelfy.clearFilter");
    strict_1.default.match(setFilterMenuItem.when ?? "", /view == shelfyView/);
    strict_1.default.match(clearFilterMenuItem.when ?? "", /shelfy\.hasFilter/);
});
(0, node_test_1.default)("manifest contributes shelfy settings and deprecates legacy aliases", () => {
    const properties = readManifest().contributes.configuration.properties;
    strict_1.default.ok(properties["shelfy.clickAction"]);
    strict_1.default.ok(properties["shelfy.showProjectPath"]);
    strict_1.default.match(properties["globalProjects.clickAction"]?.deprecationMessage ?? "", /shelfy\.clickAction/);
    strict_1.default.match(properties["globalProjects.showProjectPath"]?.deprecationMessage ?? "", /shelfy\.showProjectPath/);
});
//# sourceMappingURL=editModeBehavior.test.js.map