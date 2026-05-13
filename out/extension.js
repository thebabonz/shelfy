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
exports.activate = activate;
exports.deactivate = deactivate;
const jsonc_parser_1 = require("jsonc-parser");
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const projectScripts_1 = require("./projectScripts");
const store_1 = require("./store");
const tree_1 = require("./tree");
const treeBehavior_1 = require("./treeBehavior");
async function activate(context) {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const store = new store_1.ProjectStore(context);
    const provider = new tree_1.GlobalProjectsProvider(context, store);
    await provider.initialize();
    await vscode.commands.executeCommand("setContext", "globalProjects.editMode", false);
    await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", provider.getSortMode());
    await setEffectiveClickActionContext();
    let editMode = false;
    let treeViewDisposables = [];
    const registerTreeView = () => {
        for (const disposable of treeViewDisposables) {
            disposable.dispose();
        }
        const treeViewOptions = {
            treeDataProvider: provider,
            showCollapseAll: true
        };
        if ((0, treeBehavior_1.getGlobalProjectsTreeMimeTypes)(editMode).length > 0) {
            treeViewOptions.dragAndDropController = provider;
        }
        const treeView = vscode.window.createTreeView("globalProjectsView", treeViewOptions);
        treeViewDisposables = [
            treeView,
            treeView.onDidExpandElement(async (event) => {
                if (event.element instanceof tree_1.GroupItem) {
                    await provider.markExpanded(event.element.group.id);
                }
            }),
            treeView.onDidCollapseElement(async (event) => {
                if (event.element instanceof tree_1.GroupItem) {
                    await provider.markCollapsed(event.element.group.id);
                }
            })
        ];
    };
    const setEditMode = async (enabled) => {
        editMode = enabled;
        await vscode.commands.executeCommand("setContext", "globalProjects.editMode", enabled);
        provider.setEditMode(enabled);
        registerTreeView();
    };
    registerTreeView();
    context.subscriptions.push({
        dispose: () => {
            for (const disposable of treeViewDisposables) {
                disposable.dispose();
            }
        }
    });
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if ((0, config_1.affectsShelfySetting)(event, "clickAction")) {
            await setEffectiveClickActionContext();
        }
        if ((0, config_1.affectsShelfySetting)(event, "showProjectPath")) {
            provider.refresh();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("globalProjects.refresh", () => provider.refresh()), vscode.commands.registerCommand("globalProjects.exportConfiguration", async () => {
        await exportConfiguration(store);
    }), vscode.commands.registerCommand("globalProjects.importConfiguration", async () => {
        await importConfiguration(store, provider);
    }), vscode.commands.registerCommand("globalProjects.addRootGroup", async () => {
        await createGroup(store, provider);
    }), vscode.commands.registerCommand("globalProjects.addSubgroup", async (item) => {
        await createGroup(store, provider, item.group.id);
    }), vscode.commands.registerCommand("globalProjects.addProject", async (target) => {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Add Project Folder"
        });
        if (!picked?.length) {
            return;
        }
        const projectPath = picked[0].fsPath;
        const defaultName = path.basename(projectPath);
        const name = await vscode.window.showInputBox({
            prompt: "Project display name",
            value: defaultName
        });
        if (!name) {
            return;
        }
        try {
            await store.addProject({
                parentGroupId: getAddProjectParentGroupId(store, target),
                name,
                projectPath
            });
            provider.refresh();
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.renameGroup", async (item) => {
        const name = await vscode.window.showInputBox({
            prompt: "New folder name",
            value: item.group.name
        });
        if (!name) {
            return;
        }
        try {
            await store.renameGroup(item.group.id, name);
            provider.refresh();
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.renameProject", async (item) => {
        const name = await vscode.window.showInputBox({
            prompt: "New project name",
            value: item.project.name
        });
        if (!name) {
            return;
        }
        try {
            await store.renameProject(item.project.id, name);
            provider.refresh();
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.addProjectScript", async (item) => {
        await addProjectScript(store, provider, item);
    }), vscode.commands.registerCommand("globalProjects.removeProjectScript", async (item) => {
        const label = getProjectScriptLabel(item.script);
        const answer = await vscode.window.showWarningMessage(`Remove script "${label}"?`, { modal: true }, "Remove");
        if (answer !== "Remove") {
            return;
        }
        try {
            await store.removeProjectScript(item.project.id, item.script.id);
            provider.refresh();
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.runProjectScript", async (item) => {
        try {
            const command = await (0, projectScripts_1.resolveProjectScriptCommand)(item.project.projectPath, item.script);
            const terminal = vscode.window.createTerminal({
                name: `${item.project.name}: ${getProjectScriptLabel(item.script)}`,
                cwd: item.project.projectPath
            });
            terminal.show();
            terminal.sendText(command, true);
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.removeItem", async (item) => {
        const label = item instanceof tree_1.GroupItem ? item.group.name : item.project.name;
        const answer = await vscode.window.showWarningMessage(`Remove "${label}"?`, { modal: true }, "Remove");
        if (answer !== "Remove") {
            return;
        }
        try {
            await store.removeNode(item instanceof tree_1.GroupItem ? item.group.id : item.project.id);
            provider.refresh();
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.moveItemToFolder", async (item) => {
        await moveItemToFolder(store, provider, item);
    }), vscode.commands.registerCommand("globalProjects.openProject", async (item) => {
        await openProjectInCurrentWindow(item);
    }), vscode.commands.registerCommand("globalProjects.openProjectInNewWindow", async (item) => {
        await openProjectInNewWindow(item);
    }), vscode.commands.registerCommand("globalProjects.openInExplorer", async (item) => {
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.project.projectPath));
    }), vscode.commands.registerCommand("globalProjects.openProjectFromRow", async (item) => {
        await openProjectFromRow(item);
    }), vscode.commands.registerCommand("globalProjects.cloneGroupWithNewBase", async (item) => {
        const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: "Select New Base Folder"
        });
        if (!picked?.length) {
            return;
        }
        const newBasePath = picked[0].fsPath;
        const newName = await vscode.window.showInputBox({
            prompt: "Name for the cloned group",
            value: item.group.name
        });
        if (!newName) {
            return;
        }
        try {
            const { commonBase } = await store.cloneGroupWithNewBase(item.group.id, newName, newBasePath);
            provider.refresh();
            await vscode.window.showInformationMessage(`Group cloned. Paths rebased from "${commonBase}" to "${newBasePath}".`);
        }
        catch (error) {
            await vscode.window.showErrorMessage(asMessage(error));
        }
    }), vscode.commands.registerCommand("globalProjects.enableEditMode", async () => {
        await setEditMode(true);
    }), vscode.commands.registerCommand("globalProjects.disableEditMode", async () => {
        await setEditMode(false);
    }), vscode.commands.registerCommand("globalProjects.cycleSortFromNone", async () => {
        await cycleSortMode(provider, "asc");
    }), vscode.commands.registerCommand("globalProjects.cycleSortFromAsc", async () => {
        await cycleSortMode(provider, "desc");
    }), vscode.commands.registerCommand("globalProjects.cycleSortFromDesc", async () => {
        await cycleSortMode(provider, "none");
    }));
}
function deactivate() { }
async function openProjectFromRow(item) {
    const action = getClickAction();
    if (action === "noAction") {
        return;
    }
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
        forceNewWindow: action === "openNewInstance"
    });
}
async function openProjectInCurrentWindow(item) {
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
        forceNewWindow: false
    });
}
async function openProjectInNewWindow(item) {
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
        forceNewWindow: true
    });
}
function getClickAction() {
    return (0, config_1.getShelfySetting)("clickAction", "openSameInstance");
}
async function setEffectiveClickActionContext() {
    await vscode.commands.executeCommand("setContext", "globalProjects.clickAction", getClickAction());
}
async function createGroup(store, provider, parentGroupId) {
    const name = await vscode.window.showInputBox({
        prompt: parentGroupId ? "Subgroup name" : "Group name"
    });
    if (!name) {
        return;
    }
    try {
        await store.addGroup(name, parentGroupId);
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function moveItemToFolder(store, provider, item) {
    if (!(item instanceof tree_1.GroupItem) && !(item instanceof tree_1.ProjectItem)) {
        await vscode.window.showInformationMessage("Use Move to Folder from a Shelfy project or folder.");
        return;
    }
    const nodeId = item instanceof tree_1.GroupItem ? item.group.id : item.project.id;
    const label = item instanceof tree_1.GroupItem ? item.group.name : item.project.name;
    const destinations = (0, treeBehavior_1.getMoveDestinations)(store.read().children, nodeId);
    if (destinations.length === 0) {
        await vscode.window.showInformationMessage(`No available destination folders for "${label}".`);
        return;
    }
    const picked = await vscode.window.showQuickPick(destinations.map((destination) => ({
        ...destination
    })), {
        title: "Move to Folder",
        placeHolder: `Choose a destination for "${label}"`
    });
    if (!picked) {
        return;
    }
    try {
        await store.moveNode(nodeId, picked.targetGroupId, picked.targetIndex);
        if (picked.targetGroupId) {
            await provider.markExpanded(picked.targetGroupId);
        }
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function exportConfiguration(store) {
    const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(path.join(os.homedir(), "shelfy.json")),
        filters: {
            JSON: ["json"]
        },
        saveLabel: "Export Configuration"
    });
    if (!target) {
        return;
    }
    const content = JSON.stringify(store.exportData(), null, 2);
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
    await vscode.window.showInformationMessage(`Configuration exported to "${target.fsPath}".`);
}
async function importConfiguration(store, provider) {
    const target = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            JSON: ["json"]
        },
        openLabel: "Import Configuration"
    });
    if (!target?.length) {
        return;
    }
    const hasExistingItems = store.read().children.length > 0;
    if (hasExistingItems) {
        const answer = await vscode.window.showWarningMessage("Importing will replace the current folders, projects, and scripts configuration.", { modal: true }, "Import");
        if (answer !== "Import") {
            return;
        }
    }
    try {
        const raw = Buffer.from(await vscode.workspace.fs.readFile(target[0])).toString("utf8");
        const parseErrors = [];
        const parsed = (0, jsonc_parser_1.parse)(raw, parseErrors);
        if (parseErrors.length > 0) {
            throw new Error("The selected file is not valid JSON.");
        }
        await store.importData(parsed);
        provider.refresh();
        await vscode.window.showInformationMessage(`Configuration imported from "${target[0].fsPath}".`);
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function addProjectScript(store, provider, item) {
    const packageScripts = await getAvailablePackageScripts(item.project);
    const source = await pickScriptSource(packageScripts.length > 0);
    if (!source) {
        return;
    }
    const scriptsToAdd = source === "package"
        ? await pickPackageScripts(packageScripts)
        : await promptForCustomScripts();
    if (!scriptsToAdd?.length) {
        return;
    }
    try {
        const added = await store.addProjectScripts(item.project.id, scriptsToAdd);
        provider.refresh();
        if (added.length === 0) {
            await vscode.window.showInformationMessage("Those scripts are already configured for this project.");
        }
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function getAvailablePackageScripts(project) {
    const configured = new Set((project.scripts ?? [])
        .filter((script) => script.kind === "package")
        .map((script) => script.scriptName));
    try {
        const packageScripts = await (0, projectScripts_1.readPackageScripts)(project.projectPath);
        return packageScripts.filter((script) => !configured.has(script.name));
    }
    catch {
        return [];
    }
}
async function pickScriptSource(hasPackageScripts) {
    if (!hasPackageScripts) {
        return "custom";
    }
    const picked = await vscode.window.showQuickPick([
        {
            label: "Select from package.json",
            description: "Add one or more scripts defined in the project package.json",
            value: "package"
        },
        {
            label: "Enter custom command",
            description: "Add your own terminal command to run in the project folder",
            value: "custom"
        }
    ], {
        title: "Add Project Script",
        placeHolder: "Choose the source for the script you want to add"
    });
    return picked?.value;
}
async function pickPackageScripts(packageScripts) {
    if (packageScripts.length === 0) {
        await vscode.window.showInformationMessage("No new package.json scripts are available to add.");
        return [];
    }
    const picked = await vscode.window.showQuickPick(packageScripts.map((script) => ({
        label: script.name,
        description: script.command
    })), {
        canPickMany: true,
        title: "Add package.json scripts",
        placeHolder: "Select one or more scripts to add"
    });
    if (!picked?.length) {
        return undefined;
    }
    return picked.map((script) => ({
        kind: "package",
        scriptName: script.label
    }));
}
async function promptForCustomScripts() {
    const scripts = [];
    while (true) {
        const name = await vscode.window.showInputBox({
            prompt: "Script label",
            placeHolder: "API dev server"
        });
        if (!name) {
            return scripts.length > 0 ? scripts : undefined;
        }
        const command = await vscode.window.showInputBox({
            prompt: "Command to run in the project folder",
            placeHolder: "npm run dev"
        });
        if (!command) {
            return scripts.length > 0 ? scripts : undefined;
        }
        scripts.push({
            kind: "custom",
            name,
            command
        });
        const next = await vscode.window.showQuickPick([
            { label: "Done", value: "done" },
            { label: "Add another custom script", value: "add" }
        ], {
            title: "Custom script added",
            placeHolder: "Choose whether to keep adding custom scripts"
        });
        if (next?.value !== "add") {
            return scripts;
        }
    }
}
function getAddProjectParentGroupId(store, target) {
    if (target instanceof tree_1.GroupItem) {
        return target.group.id;
    }
    if (target instanceof tree_1.ProjectItem || target instanceof tree_1.ScriptItem) {
        return store.getParentGroupId(target.project.id);
    }
    return undefined;
}
function getProjectScriptLabel(script) {
    return script.kind === "package" ? script.scriptName : script.name;
}
function asMessage(error) {
    return error instanceof Error ? error.message : "Unknown error";
}
async function cycleSortMode(provider, nextMode) {
    await provider.setSortMode(nextMode);
    await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", nextMode);
}
//# sourceMappingURL=extension.js.map