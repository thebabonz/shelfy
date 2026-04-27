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
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const store_1 = require("./store");
const tree_1 = require("./tree");
async function activate(context) {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const store = new store_1.ProjectStore(context);
    const provider = new tree_1.GlobalProjectsProvider(context, store);
    await provider.initialize();
    await vscode.commands.executeCommand("setContext", "globalProjects.editMode", false);
    await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", provider.getSortMode());
    await setEffectiveClickActionContext();
    const treeView = vscode.window.createTreeView("globalProjectsView", {
        treeDataProvider: provider,
        dragAndDropController: provider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);
    context.subscriptions.push(treeView.onDidExpandElement(async (event) => {
        if (event.element instanceof tree_1.GroupItem) {
            await provider.markExpanded(event.element.group.id);
        }
    }), treeView.onDidCollapseElement(async (event) => {
        if (event.element instanceof tree_1.GroupItem) {
            await provider.markCollapsed(event.element.group.id);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration("globalProjects.clickAction")) {
            await setEffectiveClickActionContext();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("globalProjects.refresh", () => provider.refresh()), vscode.commands.registerCommand("globalProjects.addRootGroup", async () => {
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
                parentGroupId: target?.group.id,
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
        await vscode.commands.executeCommand("setContext", "globalProjects.editMode", true);
        provider.setEditMode(true);
    }), vscode.commands.registerCommand("globalProjects.disableEditMode", async () => {
        await vscode.commands.executeCommand("setContext", "globalProjects.editMode", false);
        provider.setEditMode(false);
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
    const config = vscode.workspace.getConfiguration("globalProjects");
    return config.get("clickAction", "openSameInstance");
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
function asMessage(error) {
    return error instanceof Error ? error.message : "Unknown error";
}
async function cycleSortMode(provider, nextMode) {
    await provider.setSortMode(nextMode);
    await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", nextMode);
}
//# sourceMappingURL=extension.js.map