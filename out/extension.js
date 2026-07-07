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
const crypto = __importStar(require("crypto"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const personalization_1 = require("./personalization");
const personalizationEditor_1 = require("./personalizationEditor");
const projectScripts_1 = require("./projectScripts");
const store_1 = require("./store");
const tree_1 = require("./tree");
const treeBehavior_1 = require("./treeBehavior");
function registerShelfyCommand(command, callback) {
    const legacyCommand = command.replace(/^shelfy\./, "globalProjects.");
    return [
        vscode.commands.registerCommand(command, callback),
        vscode.commands.registerCommand(legacyCommand, (...args) => vscode.commands.executeCommand(command, ...args))
    ];
}
async function activate(context) {
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const store = new store_1.ProjectStore(context);
    await store.initialize();
    const provider = new tree_1.ShelfyProvider(context, store);
    await provider.initialize();
    await vscode.commands.executeCommand("setContext", "shelfy.editMode", false);
    await vscode.commands.executeCommand("setContext", "shelfy.sortMode", provider.getSortMode());
    await setEffectiveClickActionContext();
    await setFilterContext(provider);
    let editMode = false;
    let treeEditable = false;
    let treeView;
    let treeViewDisposables = [];
    const currentProjectStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    currentProjectStatusBar.name = "Shelfy Current Project";
    currentProjectStatusBar.command = "shelfy.selectProjectInCurrentWindow";
    const updateCurrentProjectStatusBar = () => {
        const currentProject = getCurrentWorkspaceProject(store);
        if (!currentProject) {
            currentProjectStatusBar.hide();
            return;
        }
        const iconLabel = (0, personalization_1.formatPersonalizationIcon)(currentProject.project.personalization?.icon);
        const locationLabel = getProjectLocationLabel(currentProject.folderPath, currentProject.project.name);
        currentProjectStatusBar.text = iconLabel
            ? `$(folder-library) ${locationLabel} ${iconLabel}`
            : `$(folder-library) ${locationLabel}`;
        currentProjectStatusBar.tooltip = [
            `Current Shelfy project: ${locationLabel}`,
            currentProject.project.projectPath,
            iconLabel ? `Icon: ${iconLabel}` : undefined,
            "Select another saved project to open in this window"
        ]
            .filter((line) => Boolean(line))
            .join("\n");
        currentProjectStatusBar.show();
    };
    const updateTreeViewState = () => {
        if (treeView) {
            treeView.message = provider.getFilterText()
                ? `Filter: ${provider.getFilterText()}`
                : undefined;
        }
    };
    const registerTreeView = () => {
        for (const disposable of treeViewDisposables) {
            disposable.dispose();
        }
        const treeViewOptions = {
            treeDataProvider: provider,
            showCollapseAll: false
        };
        if ((0, treeBehavior_1.getShelfyTreeMimeTypes)(treeEditable).length > 0) {
            treeViewOptions.dragAndDropController = provider;
        }
        treeView = vscode.window.createTreeView("shelfyView", treeViewOptions);
        updateTreeViewState();
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
    const applyTreeEditability = async () => {
        const nextTreeEditable = (0, treeBehavior_1.isShelfyTreeEditable)(editMode, provider.hasFilter());
        if (nextTreeEditable === treeEditable) {
            return;
        }
        treeEditable = nextTreeEditable;
        await vscode.commands.executeCommand("setContext", "shelfy.editMode", treeEditable);
        provider.setEditMode(treeEditable);
        registerTreeView();
    };
    const ensureTreeEditable = async () => {
        if (provider.hasFilter()) {
            await vscode.window.showInformationMessage("Clear the active filter before editing the Shelfy list.");
            return false;
        }
        return treeEditable;
    };
    const requireTreeEditable = (callback) => {
        return async (...args) => {
            if (!(await ensureTreeEditable())) {
                return;
            }
            await callback(...args);
        };
    };
    const setEditMode = async (enabled) => {
        if (enabled && provider.hasFilter()) {
            await vscode.window.showInformationMessage("Clear the active filter before entering edit mode.");
            return;
        }
        editMode = enabled;
        await applyTreeEditability();
    };
    registerTreeView();
    context.subscriptions.push({
        dispose: () => {
            for (const disposable of treeViewDisposables) {
                disposable.dispose();
            }
        }
    });
    context.subscriptions.push(currentProjectStatusBar);
    context.subscriptions.push(provider.onDidChangeTreeData(() => updateCurrentProjectStatusBar()));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => updateCurrentProjectStatusBar()));
    updateCurrentProjectStatusBar();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if ((0, config_1.affectsShelfySetting)(event, "storageMode")) {
            await handleStorageModeChange(store, provider);
            return;
        }
        if ((0, config_1.affectsShelfySetting)(event, "clickAction")) {
            await setEffectiveClickActionContext();
        }
        if ((0, config_1.affectsShelfySetting)(event, "showProjectPath")) {
            provider.refresh();
        }
    }));
    context.subscriptions.push(...registerShelfyCommand("shelfy.refresh", () => provider.refresh()), ...registerShelfyCommand("shelfy.collapseAll", async () => {
        await vscode.commands.executeCommand("workbench.actions.treeView.shelfyView.collapseAll");
    }), ...registerShelfyCommand("shelfy.setFilter", async () => {
        const filterText = await vscode.window.showInputBox({
            title: "Filter Shelfy tree",
            prompt: "Filter folders, projects, paths, and scripts",
            value: provider.getFilterText(),
            placeHolder: "frontend, api, npm run dev"
        });
        if (filterText === undefined) {
            return;
        }
        await provider.setFilterText(filterText);
        if (provider.hasFilter()) {
            editMode = false;
        }
        updateTreeViewState();
        await setFilterContext(provider);
        await applyTreeEditability();
    }), ...registerShelfyCommand("shelfy.clearFilter", async () => {
        await provider.setFilterText(undefined);
        updateTreeViewState();
        await setFilterContext(provider);
        await applyTreeEditability();
    }), ...registerShelfyCommand("shelfy.exportConfiguration", async () => {
        await exportConfiguration(store);
    }), ...registerShelfyCommand("shelfy.importConfiguration", async () => {
        await importConfiguration(store, provider);
    }), ...registerShelfyCommand("shelfy.importFromProjectManager", async () => {
        await importFromProjectManager(store, provider);
    }), ...registerShelfyCommand("shelfy.openSettings", async () => {
        await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${context.extension.id}`);
    }), ...registerShelfyCommand("shelfy.addRootGroup", requireTreeEditable(async () => {
        await createGroup(store, provider);
    })), ...registerShelfyCommand("shelfy.addSubgroup", requireTreeEditable(async (item) => {
        await createGroup(store, provider, item.group.id);
    })), ...registerShelfyCommand("shelfy.addProject", requireTreeEditable(async (target) => {
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
    })), ...registerShelfyCommand("shelfy.renameGroup", requireTreeEditable(async (item) => {
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
    })), ...registerShelfyCommand("shelfy.renameProject", requireTreeEditable(async (item) => {
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
    })), ...registerShelfyCommand("shelfy.changeProjectPath", requireTreeEditable(async (item) => {
        await changeProjectPath(store, provider, item);
    })), ...registerShelfyCommand("shelfy.editItemPersonalization", requireTreeEditable(async (item) => {
        await editItemPersonalization(store, provider, item);
    })), ...registerShelfyCommand("shelfy.revertItemPersonalization", requireTreeEditable(async (item) => {
        await revertItemPersonalization(store, provider, item);
    })), ...registerShelfyCommand("shelfy.addProjectScript", requireTreeEditable(async (item) => {
        await addProjectScript(store, provider, item);
    })), ...registerShelfyCommand("shelfy.editProjectScript", requireTreeEditable(async (item) => {
        await editProjectScript(store, provider, item);
    })), ...registerShelfyCommand("shelfy.removeProjectScript", requireTreeEditable(async (item) => {
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
    })), ...registerShelfyCommand("shelfy.runProjectScript", async (item) => {
        try {
            if (!(await ensureProjectPathExists(item.project))) {
                return;
            }
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
    }), ...registerShelfyCommand("shelfy.removeItem", requireTreeEditable(async (item) => {
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
    })), ...registerShelfyCommand("shelfy.moveItemToFolder", requireTreeEditable(async (item) => {
        await moveItemToFolder(store, provider, item);
    })), ...registerShelfyCommand("shelfy.moveItemUp", requireTreeEditable(async (item) => {
        await moveItemAdjacent(store, provider, item, "up");
    })), ...registerShelfyCommand("shelfy.moveItemDown", requireTreeEditable(async (item) => {
        await moveItemAdjacent(store, provider, item, "down");
    })), ...registerShelfyCommand("shelfy.openProject", async (item) => {
        await openProjectInCurrentWindow(item);
    }), ...registerShelfyCommand("shelfy.selectProjectInCurrentWindow", async () => {
        const picked = await pickSavedProjectInCurrentWindow(store);
        if (!picked) {
            return;
        }
        await openProjectInCurrentWindowByProject(picked);
    }), ...registerShelfyCommand("shelfy.openProjectInNewWindow", async (item) => {
        await openProjectInNewWindow(item);
    }), ...registerShelfyCommand("shelfy.openInExplorer", async (item) => {
        if (item instanceof tree_1.ProjectItem) {
            if (!(await ensureProjectPathExists(item.project))) {
                return;
            }
            await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.project.projectPath));
        }
        else {
            const projects = (0, tree_1.collectProjects)(item.group.children);
            const firstExisting = await findFirstExistingProject(projects);
            if (!firstExisting) {
                await vscode.window.showInformationMessage("No reachable project folders found in this group.");
                return;
            }
            await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(firstExisting.projectPath));
        }
    }), ...registerShelfyCommand("shelfy.revealInVSCodeExplorer", async (item) => {
        const projects = (0, tree_1.collectProjects)(item.group.children);
        if (projects.length === 0) {
            await vscode.window.showInformationMessage("This group contains no projects.");
            return;
        }
        const existing = await filterExistingProjects(projects);
        if (existing.length === 0) {
            await vscode.window.showInformationMessage("No reachable project folders found in this group.");
            return;
        }
        const currentFsPaths = new Set((vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath));
        const toAdd = existing
            .filter((p) => !currentFsPaths.has(p.projectPath))
            .map((p) => ({ uri: vscode.Uri.file(p.projectPath) }));
        if (toAdd.length > 0) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders?.length ?? 0, 0, ...toAdd);
        }
        await vscode.commands.executeCommand("workbench.view.explorer");
    }), ...registerShelfyCommand("shelfy.openProjectFromRow", async (item) => {
        await openProjectFromRow(item);
    }), ...registerShelfyCommand("shelfy.cloneGroupWithNewBase", requireTreeEditable(async (item) => {
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
    })), ...registerShelfyCommand("shelfy.enableEditMode", async () => {
        await setEditMode(true);
    }), ...registerShelfyCommand("shelfy.disableEditMode", async () => {
        await setEditMode(false);
    }), ...registerShelfyCommand("shelfy.cycleSortFromNone", async () => {
        await cycleSortMode(provider, "asc");
    }), ...registerShelfyCommand("shelfy.cycleSortFromAsc", async () => {
        await cycleSortMode(provider, "desc");
    }), ...registerShelfyCommand("shelfy.cycleSortFromDesc", async () => {
        await cycleSortMode(provider, "none");
    }));
}
function deactivate() { }
async function openProjectFromRow(item) {
    const action = getClickAction();
    if (action === "noAction") {
        return;
    }
    const confirmOnClick = (0, config_1.getShelfySetting)("confirmOnClick", false);
    if (confirmOnClick) {
        const projectName = item.project.name;
        const actionLabel = action === "openNewInstance"
            ? `Open '${projectName}' in a new window?`
            : `Open '${projectName}' in this window?`;
        const confirmed = await vscode.window.showInformationMessage(actionLabel, { modal: true }, "Open");
        if (confirmed !== "Open") {
            return;
        }
    }
    await openProject(item.project, action === "openNewInstance");
}
async function openProjectInCurrentWindow(item) {
    await openProjectInCurrentWindowByProject(item.project);
}
async function openProjectInNewWindow(item) {
    await openProject(item.project, true);
}
async function openProjectInCurrentWindowByProject(project) {
    await openProject(project, false);
}
async function openProject(project, forceNewWindow) {
    if (!(await ensureProjectPathExists(project))) {
        return;
    }
    await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(project.projectPath), {
        forceNewWindow
    });
}
function getClickAction() {
    return (0, config_1.getShelfySetting)("clickAction", "openSameInstance");
}
async function pickSavedProjectInCurrentWindow(store) {
    const nodes = store.read().children;
    const projects = (0, tree_1.collectProjects)(nodes);
    if (projects.length === 0) {
        await vscode.window.showInformationMessage("No saved Shelfy projects are available to open.");
        return undefined;
    }
    const currentProjectPath = getCurrentWorkspaceProject(store)?.project.projectPath;
    const picked = await vscode.window.showQuickPick(projects.map((project) => {
        const folderPath = getProjectFolderPath(nodes, project.id);
        const iconLabel = (0, personalization_1.formatPersonalizationIcon)(project.personalization?.icon);
        const detailParts = [project.projectPath, iconLabel];
        if (currentProjectPath && (0, store_1.normalizeProjectPath)(project.projectPath) === (0, store_1.normalizeProjectPath)(currentProjectPath)) {
            detailParts.push("Current window");
        }
        return {
            label: project.name,
            description: folderPath ?? "Root",
            detail: detailParts.join(" • "),
            project
        };
    }), {
        title: "Open Saved Project in Current Window",
        placeHolder: "Type to filter saved projects",
        matchOnDescription: true,
        matchOnDetail: true
    });
    return picked?.project;
}
function getItemLabel(item) {
    return item instanceof tree_1.GroupItem ? item.group.name : item.project.name;
}
function getItemNodeId(item) {
    return item instanceof tree_1.GroupItem ? item.group.id : item.project.id;
}
function getItemPersonalization(item) {
    return item instanceof tree_1.GroupItem ? item.group.personalization : item.project.personalization;
}
async function setEffectiveClickActionContext() {
    await vscode.commands.executeCommand("setContext", "shelfy.clickAction", getClickAction());
}
async function setFilterContext(provider) {
    await vscode.commands.executeCommand("setContext", "shelfy.hasFilter", provider.hasFilter());
}
function getCurrentWorkspaceProject(store) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return undefined;
    }
    const nodes = store.read().children;
    const project = (0, store_1.findProjectByPath)(nodes, (0, store_1.normalizeProjectPath)(workspaceFolder.uri.fsPath));
    if (!project) {
        return undefined;
    }
    return {
        project,
        folderPath: getProjectFolderPath(nodes, project.id)
    };
}
function getProjectFolderPath(nodes, projectId, groupNames = []) {
    for (const node of nodes) {
        if (node.kind === "project") {
            if (node.id === projectId) {
                return groupNames.length > 0 ? groupNames.join(" / ") : undefined;
            }
            continue;
        }
        const nested = getProjectFolderPath(node.children, projectId, [...groupNames, node.name]);
        if (nested !== undefined) {
            return nested;
        }
    }
    return undefined;
}
function getProjectLocationLabel(folderPath, projectName) {
    return folderPath ? `${folderPath} / ${projectName}` : `Root / ${projectName}`;
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
async function editItemPersonalization(store, provider, item) {
    if (!(item instanceof tree_1.GroupItem) && !(item instanceof tree_1.ProjectItem)) {
        await vscode.window.showInformationMessage("Use Edit Personalization from a Shelfy project or folder.");
        return;
    }
    const current = getItemPersonalization(item);
    const label = getItemLabel(item);
    const projectConfigColor = item instanceof tree_1.ProjectItem
        ? await provider.getProjectConfigurationColor(item.project.projectPath)
        : undefined;
    const next = await (0, personalizationEditor_1.showPersonalizationEditor)({
        label,
        kind: item instanceof tree_1.GroupItem ? "group" : "project",
        personalization: current,
        projectConfigColor
    });
    if (!next) {
        return;
    }
    await saveItemPersonalization(store, provider, item, next);
}
async function revertItemPersonalization(store, provider, item) {
    if (!(item instanceof tree_1.GroupItem) && !(item instanceof tree_1.ProjectItem)) {
        await vscode.window.showInformationMessage("Use Revert Personalization from a Shelfy project or folder.");
        return;
    }
    try {
        await store.setNodePersonalization(getItemNodeId(item), undefined);
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function saveItemPersonalization(store, provider, item, update) {
    const current = getItemPersonalization(item);
    const personalization = (0, personalization_1.normalizeNodePersonalization)({
        color: update.color === undefined
            ? current?.color
            : update.color === null
                ? undefined
                : update.color,
        icon: update.icon === undefined
            ? current?.icon
            : update.icon === null
                ? undefined
                : update.icon
    });
    try {
        await store.setNodePersonalization(getItemNodeId(item), personalization);
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function changeProjectPath(store, provider, item) {
    if (!(item instanceof tree_1.ProjectItem)) {
        await vscode.window.showInformationMessage("Use Change Project Folder from a Shelfy project.");
        return;
    }
    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri: vscode.Uri.file(item.project.projectPath),
        openLabel: "Select Project Folder"
    });
    if (!picked?.length) {
        return;
    }
    try {
        await store.updateProjectPath(item.project.id, picked[0].fsPath);
        provider.refresh();
        await vscode.window.showInformationMessage(`Project folder updated for "${item.project.name}".`);
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
async function moveItemAdjacent(store, provider, item, direction) {
    if (item instanceof tree_1.ScriptItem) {
        await moveProjectScriptAdjacent(store, provider, item, direction);
        return;
    }
    if (!(item instanceof tree_1.GroupItem) && !(item instanceof tree_1.ProjectItem)) {
        await vscode.window.showInformationMessage("Use Move Up or Move Down from a Shelfy project, folder, or script.");
        return;
    }
    const nodeId = item instanceof tree_1.GroupItem ? item.group.id : item.project.id;
    const target = (0, treeBehavior_1.getAdjacentMoveTargets)(store.read().children, nodeId)[direction];
    if (!target) {
        return;
    }
    try {
        await store.moveNode(nodeId, target.parentGroupId, target.targetIndex);
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function moveProjectScriptAdjacent(store, provider, item, direction) {
    const target = (0, treeBehavior_1.getAdjacentScriptMoveTargets)(item.project.scripts, item.script.id)[direction];
    if (!target) {
        return;
    }
    try {
        await store.moveProjectScript(item.project.id, item.script.id, target.targetIndex);
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
async function importFromProjectManager(store, provider) {
    const target = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            JSON: ["json"]
        },
        openLabel: "Import from Project Manager"
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
        if (!Array.isArray(parsed)) {
            throw new Error("The selected file does not contain a valid Project Manager configuration.");
        }
        const entries = parsed;
        const rootData = convertProjectManagerData(entries);
        await store.write(rootData);
        provider.refresh();
        await vscode.window.showInformationMessage(`Project Manager configuration imported from "${target[0].fsPath}".`);
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
function convertProjectManagerData(entries) {
    const tagMap = new Map();
    for (const entry of entries) {
        const project = {
            kind: "project",
            id: crypto.randomUUID(),
            name: entry.name,
            projectPath: (0, store_1.normalizeProjectPath)(entry.rootPath),
            scripts: []
        };
        if (!entry.tags || entry.tags.length === 0) {
            tagMap.set("", [...(tagMap.get("") ?? []), project]);
        }
        else {
            for (const tag of entry.tags) {
                tagMap.set(tag, [...(tagMap.get(tag) ?? []), { ...project, id: crypto.randomUUID() }]);
            }
        }
    }
    const children = [];
    for (const [tag, projects] of tagMap) {
        if (tag === "") {
            children.push(...projects);
        }
        else {
            children.push({
                kind: "group",
                id: crypto.randomUUID(),
                name: tag,
                children: projects
            });
        }
    }
    return { version: 2, children };
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
async function editProjectScript(store, provider, item) {
    const nextScript = await promptForProjectScriptUpdate(item.project, item.script);
    if (!nextScript) {
        return;
    }
    try {
        await store.updateProjectScript(item.project.id, item.script.id, nextScript);
        provider.refresh();
    }
    catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
    }
}
async function promptForProjectScriptUpdate(project, script) {
    if (script.kind === "package") {
        return promptForPackageScriptUpdate(project, script.scriptName);
    }
    return promptForCustomScriptUpdate(script.name, script.command);
}
async function getAvailablePackageScripts(project, includedScriptName) {
    const configured = new Set((project.scripts ?? [])
        .filter((script) => script.kind === "package")
        .map((script) => script.scriptName));
    if (includedScriptName) {
        configured.delete(includedScriptName);
    }
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
async function promptForPackageScriptUpdate(project, currentScriptName) {
    const packageScripts = await getAvailablePackageScripts(project, currentScriptName);
    if (packageScripts.length === 0) {
        await vscode.window.showInformationMessage("No package.json scripts are available to select.");
        return undefined;
    }
    const picked = await vscode.window.showQuickPick(packageScripts.map((script) => ({
        label: script.name,
        description: script.command,
        detail: script.name === currentScriptName ? "Current selection" : undefined
    })), {
        title: "Edit package.json script",
        placeHolder: `Select the script to store for "${project.name}"`
    });
    if (!picked) {
        return undefined;
    }
    return {
        kind: "package",
        scriptName: picked.label
    };
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
async function promptForCustomScriptUpdate(currentName, currentCommand) {
    const name = await promptForRequiredInput({
        prompt: "Script label",
        placeHolder: "API dev server",
        value: currentName
    });
    if (name === undefined) {
        return undefined;
    }
    const command = await promptForRequiredInput({
        prompt: "Command to run in the project folder",
        placeHolder: "npm run dev",
        value: currentCommand
    });
    if (command === undefined) {
        return undefined;
    }
    return {
        kind: "custom",
        name,
        command
    };
}
async function promptForCustomScripts() {
    const scripts = [];
    while (true) {
        const name = await promptForRequiredInput({
            prompt: "Script label",
            placeHolder: "API dev server"
        });
        if (name === undefined) {
            return scripts.length > 0 ? scripts : undefined;
        }
        const command = await promptForRequiredInput({
            prompt: "Command to run in the project folder",
            placeHolder: "npm run dev"
        });
        if (command === undefined) {
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
async function promptForRequiredInput(options) {
    const value = await vscode.window.showInputBox({
        prompt: options.prompt,
        placeHolder: options.placeHolder,
        value: options.value,
        validateInput: (input) => (input.trim().length > 0 ? undefined : "A value is required.")
    });
    return value === undefined ? undefined : value.trim();
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
async function ensureProjectPathExists(project) {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
        if (stat.type & vscode.FileType.Directory) {
            return true;
        }
    }
    catch {
        // Fall through to the user-facing message below.
    }
    await vscode.window.showErrorMessage(`Project folder not found for "${project.name}": ${project.projectPath}`);
    return false;
}
async function findFirstExistingProject(projects) {
    for (const project of projects) {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
            if (stat.type & vscode.FileType.Directory) {
                return project;
            }
        }
        catch {
            // Skip missing paths.
        }
    }
    return undefined;
}
async function filterExistingProjects(projects) {
    const results = [];
    for (const project of projects) {
        try {
            const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
            if (stat.type & vscode.FileType.Directory) {
                results.push(project);
            }
        }
        catch {
            // Skip missing paths.
        }
    }
    return results;
}
async function cycleSortMode(provider, nextMode) {
    await provider.setSortMode(nextMode);
    await vscode.commands.executeCommand("setContext", "shelfy.sortMode", nextMode);
}
async function handleStorageModeChange(store, provider) {
    try {
        await store.migrateStorageIfNeeded();
        provider.refresh();
        await vscode.window.showInformationMessage(`Shelfy storage migrated to ${(0, config_1.getStorageMode)()} mode. Reload the extension to complete the migration.`);
    }
    catch (error) {
        await vscode.window.showErrorMessage(`Failed to migrate storage: ${asMessage(error)}`);
    }
}
//# sourceMappingURL=extension.js.map