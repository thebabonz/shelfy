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
const store_1 = require("../store");
const treeFilter_1 = require("../treeFilter");
const treeBehavior_1 = require("../treeBehavior");
const STORAGE_KEY = "shelfy.data.v2";
const LEGACY_STORAGE_KEY = "globalProjects.data.v2";
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
function createStoreContext(initialState) {
    const state = new Map();
    for (const [key, value] of Object.entries(initialState)) {
        if (value !== undefined) {
            state.set(key, value);
        }
    }
    return {
        globalState: {
            get(key) {
                return state.get(key);
            },
            update(key, value) {
                if (value === undefined) {
                    state.delete(key);
                }
                else {
                    state.set(key, value);
                }
                return Promise.resolve();
            }
        }
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
(0, node_test_1.default)("filter mode disables tree editing affordances", () => {
    strict_1.default.equal((0, treeBehavior_1.isShelfyTreeEditable)(true, false), true);
    strict_1.default.equal((0, treeBehavior_1.isShelfyTreeEditable)(true, true), false);
    strict_1.default.deepEqual((0, treeBehavior_1.getShelfyTreeMimeTypes)((0, treeBehavior_1.isShelfyTreeEditable)(true, true)), []);
    strict_1.default.deepEqual((0, treeBehavior_1.getProjectRowCommandDefinition)((0, treeBehavior_1.isShelfyTreeEditable)(true, true)), {
        command: "shelfy.openProjectFromRow",
        title: "Open Project"
    });
});
(0, node_test_1.default)("manifest hides project open actions in edit mode", () => {
    const manifest = readManifest();
    const menuItems = manifest.contributes.menus["view/item/context"];
    const commandsToCheck = [
        "shelfy.openProject",
        "shelfy.openProjectInNewWindow",
        "shelfy.openInExplorer"
    ];
    for (const command of commandsToCheck) {
        const menuItem = menuItems.find((item) => item.command === command);
        const commandContribution = manifest.contributes.commands.find((item) => item.command === command);
        strict_1.default.ok(menuItem, `Expected to find menu contribution for ${command}`);
        strict_1.default.ok(commandContribution, `Expected to find command contribution for ${command}`);
        strict_1.default.match(menuItem.when ?? "", /!shelfy\.editMode/);
        strict_1.default.match(commandContribution.enablement ?? "", /missingPath/);
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
(0, node_test_1.default)("adjacent move targets stay within the current level", () => {
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentMoveTargets)(createTree(), "frontend"), {
        up: undefined,
        down: {
            parentGroupId: undefined,
            targetIndex: 1
        }
    });
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentMoveTargets)(createTree(), "web-app"), {
        up: undefined,
        down: {
            parentGroupId: "frontend",
            targetIndex: 1
        }
    });
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentMoveTargets)(createTree(), "components"), {
        up: {
            parentGroupId: "frontend",
            targetIndex: 0
        },
        down: undefined
    });
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentMoveTargets)(createTree(), "buttons"), {
        up: undefined,
        down: undefined
    });
});
(0, node_test_1.default)("adjacent script move targets stay within the current command level", () => {
    const project = createProjectWithScripts();
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentScriptMoveTargets)(project.scripts, "custom-dev"), {
        up: undefined,
        down: {
            parentGroupId: undefined,
            targetIndex: 1
        }
    });
    strict_1.default.deepEqual((0, treeBehavior_1.getAdjacentScriptMoveTargets)(project.scripts, "package-test"), {
        up: {
            parentGroupId: undefined,
            targetIndex: 0
        },
        down: undefined
    });
});
(0, node_test_1.default)("manifest contributes move up and move down actions in edit mode", () => {
    const manifest = readManifest();
    const commands = manifest.contributes.commands;
    const menuItems = manifest.contributes.menus["view/item/context"];
    const moveUpCommand = commands.find((command) => command.command === "shelfy.moveItemUp");
    const moveDownCommand = commands.find((command) => command.command === "shelfy.moveItemDown");
    const moveUpMenuItem = menuItems.find((item) => item.command === "shelfy.moveItemUp");
    const moveDownMenuItem = menuItems.find((item) => item.command === "shelfy.moveItemDown");
    strict_1.default.ok(moveUpCommand, "Expected command contribution for shelfy.moveItemUp");
    strict_1.default.ok(moveDownCommand, "Expected command contribution for shelfy.moveItemDown");
    strict_1.default.ok(moveUpMenuItem, "Expected to find menu contribution for shelfy.moveItemUp");
    strict_1.default.ok(moveDownMenuItem, "Expected to find menu contribution for shelfy.moveItemDown");
    strict_1.default.match(moveUpCommand.enablement ?? "", /canMoveUp/);
    strict_1.default.match(moveDownCommand.enablement ?? "", /canMoveDown/);
    strict_1.default.doesNotMatch(moveUpMenuItem.when ?? "", /canMoveUp/);
    strict_1.default.doesNotMatch(moveDownMenuItem.when ?? "", /canMoveDown/);
    strict_1.default.match(moveUpMenuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.match(moveDownMenuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.ok(menuItems.some((item) => item.command === "shelfy.moveItemToFolder"));
});
(0, node_test_1.default)("manifest contributes personalization actions for projects and folders in edit mode", () => {
    const manifest = readManifest();
    const commands = manifest.contributes.commands;
    const menuItems = manifest.contributes.menus["view/item/context"];
    const editMenuItem = menuItems.find((item) => item.command === "shelfy.editItemPersonalization");
    const revertMenuItem = menuItems.find((item) => item.command === "shelfy.revertItemPersonalization");
    strict_1.default.ok(commands.some((command) => command.command === "shelfy.editItemPersonalization"));
    strict_1.default.ok(commands.some((command) => command.command === "shelfy.revertItemPersonalization"));
    strict_1.default.ok(editMenuItem, "Expected to find menu contribution for shelfy.editItemPersonalization");
    strict_1.default.ok(revertMenuItem, "Expected to find menu contribution for shelfy.revertItemPersonalization");
    strict_1.default.match(editMenuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.match(editMenuItem.when ?? "", /viewItem =~ \/\^group/);
    strict_1.default.match(editMenuItem.when ?? "", /viewItem =~ \/\^project/);
    strict_1.default.match(revertMenuItem.when ?? "", /hasPersonalization/);
});
(0, node_test_1.default)("manifest contributes change project folder action for projects in edit mode", () => {
    const manifest = readManifest();
    const command = manifest.contributes.commands.find((candidate) => candidate.command === "shelfy.changeProjectPath");
    const menuItem = manifest.contributes.menus["view/item/context"].find((candidate) => candidate.command === "shelfy.changeProjectPath");
    strict_1.default.ok(command, "Expected command contribution for shelfy.changeProjectPath");
    strict_1.default.ok(menuItem, "Expected menu contribution for shelfy.changeProjectPath");
    strict_1.default.equal(command.icon, "$(folder-opened)");
    strict_1.default.match(menuItem.when ?? "", /shelfy\.editMode/);
    strict_1.default.match(menuItem.when ?? "", /\^project/);
});
(0, node_test_1.default)("store reorders projects and folders within their current level", async () => {
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: {
            version: 2,
            children: createTree()
        }
    }));
    await store.initialize();
    await store.moveNode("web-app", "frontend", 1);
    await store.moveNode("backend", undefined, 0);
    const data = store.read();
    strict_1.default.deepEqual(data.children.map((node) => node.id), ["backend", "frontend", "root-tool"]);
    const frontend = data.children[1];
    strict_1.default.equal(frontend?.kind, "group");
    if (!frontend || frontend.kind !== "group") {
        throw new Error("Expected frontend group.");
    }
    strict_1.default.deepEqual(frontend.children.map((node) => node.id), ["components", "web-app"]);
});
(0, node_test_1.default)("store reorders scripts within their project command level", async () => {
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: {
            version: 2,
            children: [createProjectWithScripts()]
        }
    }));
    await store.initialize();
    await store.moveProjectScript("project-a", "custom-dev", 1);
    let project = store.read().children[0];
    strict_1.default.equal(project?.kind, "project");
    if (!project || project.kind !== "project") {
        throw new Error("Expected project with scripts.");
    }
    strict_1.default.deepEqual(project.scripts?.map((script) => script.id), ["package-test", "custom-dev"]);
    await store.moveProjectScript("project-a", "custom-dev", 0);
    project = store.read().children[0];
    strict_1.default.equal(project?.kind, "project");
    if (!project || project.kind !== "project") {
        throw new Error("Expected project with scripts.");
    }
    strict_1.default.deepEqual(project.scripts?.map((script) => script.id), ["custom-dev", "package-test"]);
});
(0, node_test_1.default)("store updates project paths and keeps duplicate path protection", async () => {
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: {
            version: 2,
            children: createTree()
        }
    }));
    await store.initialize();
    await store.updateProjectPath("root-tool", "C:\\projects\\root-tool-renamed");
    const data = store.read();
    const rootTool = data.children.find((node) => node.id === "root-tool");
    strict_1.default.equal(rootTool?.kind, "project");
    if (!rootTool || rootTool.kind !== "project") {
        throw new Error("Expected root project.");
    }
    strict_1.default.equal(rootTool.projectPath, "C:\\projects\\root-tool-renamed");
    await strict_1.default.rejects(() => store.updateProjectPath("root-tool", "C:\\projects\\web-app"), /already saved/);
});
(0, node_test_1.default)("store saves and clears personalization for folders and projects", async () => {
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: {
            version: 2,
            children: createTree()
        }
    }));
    await store.initialize();
    await store.setNodePersonalization("frontend", {
        color: "#123456",
        icon: "folder"
    });
    await store.setNodePersonalization("root-tool", {
        color: "rgb(12, 34, 56)",
        icon: "star"
    });
    let data = store.read();
    const frontend = data.children.find((node) => node.id === "frontend");
    const rootTool = data.children.find((node) => node.id === "root-tool");
    strict_1.default.equal(frontend?.kind, "group");
    strict_1.default.equal(rootTool?.kind, "project");
    if (!frontend || frontend.kind !== "group" || !rootTool || rootTool.kind !== "project") {
        throw new Error("Expected test nodes to exist.");
    }
    strict_1.default.deepEqual(frontend.personalization, {
        color: "#123456",
        icon: "folder"
    });
    strict_1.default.deepEqual(rootTool.personalization, {
        color: "rgb(12, 34, 56)",
        icon: "star"
    });
    await store.setNodePersonalization("frontend", undefined);
    data = store.read();
    const updatedFrontend = data.children.find((node) => node.id === "frontend");
    strict_1.default.equal(updatedFrontend?.kind, "group");
    if (!updatedFrontend || updatedFrontend.kind !== "group") {
        throw new Error("Expected frontend group to exist.");
    }
    strict_1.default.equal(updatedFrontend.personalization, undefined);
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
    strict_1.default.match(menuItem.when ?? "", /\^script/);
    strict_1.default.doesNotMatch(menuItem.when ?? "", /!shelfy\.editMode/);
});
(0, node_test_1.default)("manifest contributes filter actions in the view title", () => {
    const manifest = readManifest();
    const titleMenuItems = manifest.contributes.menus["view/title"];
    const setFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.setFilter");
    const clearFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.clearFilter");
    const sortMenuItem = titleMenuItems.find((item) => item.command === "shelfy.cycleSortFromNone");
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.setFilter"));
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.clearFilter"));
    strict_1.default.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.cycleSortFromNone"));
    strict_1.default.ok(setFilterMenuItem, "Expected to find menu contribution for shelfy.setFilter");
    strict_1.default.ok(clearFilterMenuItem, "Expected to find menu contribution for shelfy.clearFilter");
    strict_1.default.ok(sortMenuItem, "Expected to find menu contribution for shelfy.cycleSortFromNone");
    strict_1.default.match(setFilterMenuItem.when ?? "", /view == shelfyView/);
    strict_1.default.match(clearFilterMenuItem.when ?? "", /shelfy\.hasFilter/);
    strict_1.default.match(sortMenuItem.when ?? "", /shelfy\.sortMode == none/);
    strict_1.default.equal(setFilterMenuItem.group, "navigation@1");
    strict_1.default.equal(clearFilterMenuItem.group, "navigation@2");
    strict_1.default.equal(sortMenuItem.group, "navigation@3");
});
(0, node_test_1.default)("manifest orders collapse and edit actions in the view title", () => {
    const manifest = readManifest();
    const titleMenuItems = manifest.contributes.menus["view/title"];
    const collapseMenuItem = titleMenuItems.find((item) => item.command === "shelfy.collapseAll");
    const enableEditMenuItem = titleMenuItems.find((item) => item.command === "shelfy.enableEditMode");
    const disableEditMenuItem = titleMenuItems.find((item) => item.command === "shelfy.disableEditMode");
    const addFolderMenuItem = titleMenuItems.find((item) => item.command === "shelfy.addRootGroup");
    const addProjectMenuItem = titleMenuItems.find((item) => item.command === "shelfy.addProject");
    const refreshMenuItem = titleMenuItems.find((item) => item.command === "shelfy.refresh");
    const settingsMenuItem = titleMenuItems.find((item) => item.command === "shelfy.openSettings");
    strict_1.default.equal(collapseMenuItem?.group, "navigation@4");
    strict_1.default.equal(collapseMenuItem?.order, 0);
    strict_1.default.equal(enableEditMenuItem?.group, "navigation@4");
    strict_1.default.equal(enableEditMenuItem?.order, 1);
    strict_1.default.equal(disableEditMenuItem?.group, "navigation@6");
    strict_1.default.equal(disableEditMenuItem?.order, 1);
    strict_1.default.equal(addFolderMenuItem?.group, "navigation@5");
    strict_1.default.equal(addProjectMenuItem?.group, "navigation@6");
    strict_1.default.equal(addProjectMenuItem?.order, 0);
    strict_1.default.equal(refreshMenuItem?.group, "navigation@7");
    strict_1.default.equal(settingsMenuItem?.group, "navigation@8");
});
(0, node_test_1.default)("manifest contributes a settings action last in the view title", () => {
    const manifest = readManifest();
    const titleMenuItems = manifest.contributes.menus["view/title"];
    const settingsMenuItem = titleMenuItems.find((item) => item.command === "shelfy.openSettings");
    const settingsCommand = manifest.contributes.commands.find((command) => command.command === "shelfy.openSettings");
    strict_1.default.ok(settingsCommand, "Expected to find command contribution for shelfy.openSettings");
    strict_1.default.equal(settingsCommand.icon, "$(settings-gear)");
    strict_1.default.ok(settingsMenuItem, "Expected to find menu contribution for shelfy.openSettings");
    strict_1.default.match(settingsMenuItem.when ?? "", /view == shelfyView/);
    strict_1.default.equal(settingsMenuItem.group, "navigation@8");
    for (const menuItem of titleMenuItems) {
        if (menuItem.command === "shelfy.openSettings") {
            continue;
        }
        const match = menuItem.group?.match(/@(\d+)$/);
        if (match) {
            strict_1.default.ok(Number(match[1]) < 8, `Expected ${menuItem.command} to appear before shelfy.openSettings`);
        }
    }
});
(0, node_test_1.default)("manifest hides edit mode toggle while a filter is active", () => {
    const titleMenuItems = readManifest().contributes.menus["view/title"];
    const enableEditModeMenuItem = titleMenuItems.find((item) => item.command === "shelfy.enableEditMode");
    strict_1.default.ok(enableEditModeMenuItem, "Expected to find menu contribution for shelfy.enableEditMode");
    strict_1.default.match(enableEditModeMenuItem.when ?? "", /!shelfy\.hasFilter/);
});
(0, node_test_1.default)("manifest contributes a clear filter lens icon", () => {
    const command = readManifest().contributes.commands.find((candidate) => candidate.command === "shelfy.clearFilter");
    strict_1.default.deepEqual(command?.icon, {
        light: "media/light/clear-filter.svg",
        dark: "media/dark/clear-filter.svg"
    });
});
(0, node_test_1.default)("manifest contributes shelfy settings and deprecates legacy aliases", () => {
    const properties = readManifest().contributes.configuration.properties;
    strict_1.default.ok(properties["shelfy.clickAction"]);
    strict_1.default.ok(properties["shelfy.showProjectPath"]);
    strict_1.default.ok(properties["shelfy.confirmOnClick"]);
    strict_1.default.strictEqual(properties["shelfy.confirmOnClick"].type, "boolean");
    strict_1.default.match(properties["globalProjects.clickAction"]?.deprecationMessage ?? "", /shelfy\.clickAction/);
    strict_1.default.match(properties["globalProjects.showProjectPath"]?.deprecationMessage ?? "", /shelfy\.showProjectPath/);
});
(0, node_test_1.default)("store falls back to legacy data when v2 storage only contains the empty root", async () => {
    const legacyData = {
        version: 2,
        children: [
            {
                kind: "project",
                id: "legacy-project",
                name: "Legacy Project",
                projectPath: "C:\\projects\\legacy-project"
            }
        ]
    };
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: { version: 2, children: [] },
        [LEGACY_STORAGE_KEY]: legacyData
    }));
    await store.initialize();
    strict_1.default.deepEqual(store.read(), legacyData);
});
(0, node_test_1.default)("writing v2 data clears legacy storage so empty trees stay empty", async () => {
    const legacyData = {
        version: 2,
        children: [
            {
                kind: "project",
                id: "legacy-project",
                name: "Legacy Project",
                projectPath: "C:\\projects\\legacy-project"
            }
        ]
    };
    const store = new store_1.ProjectStore(createStoreContext({
        [STORAGE_KEY]: { version: 2, children: [] },
        [LEGACY_STORAGE_KEY]: legacyData
    }));
    await store.write({ version: 2, children: [] });
    strict_1.default.deepEqual(store.read(), { version: 2, children: [] });
});
//# sourceMappingURL=editModeBehavior.test.js.map