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
exports.ShelfyProvider = exports.ScriptItem = exports.ProjectItem = exports.GroupItem = void 0;
exports.collectProjects = collectProjects;
const vscode = __importStar(require("vscode"));
const config_1 = require("./config");
const personalization_1 = require("./personalization");
const projectColor_1 = require("./projectColor");
const treeBehavior_1 = require("./treeBehavior");
const treeFilter_1 = require("./treeFilter");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const EXPANDED_GROUPS_KEY = "shelfy.expandedGroups";
const LEGACY_EXPANDED_GROUPS_KEY = "globalProjects.expandedGroups";
const SORT_MODE_KEY = "shelfy.sortMode";
const LEGACY_SORT_MODE_KEY = "globalProjects.sortMode";
const FILTER_TEXT_KEY = "shelfy.filterText";
const LEGACY_FILTER_TEXT_KEY = "globalProjects.filterText";
class GroupItem extends vscode.TreeItem {
    constructor(group, iconPath, contextValue = "group") {
        super(group.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.group = group;
        this.id = group.id;
        this.contextValue = contextValue;
        this.tooltip = buildGroupTooltip(group);
        this.iconPath = iconPath;
    }
}
exports.GroupItem = GroupItem;
class ProjectItem extends vscode.TreeItem {
    constructor(project, iconPath, projectColor, projectIcon, showPath = true, editMode = false, expandScripts = editMode, contextValue = "project", projectPathExists = true) {
        const scriptCount = project.scripts?.length ?? 0;
        super(project.name, scriptCount > 0
            ? expandScripts
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None);
        this.project = project;
        this.id = project.id;
        this.contextValue = contextValue;
        this.description = projectPathExists
            ? showPath
                ? project.projectPath
                : undefined
            : showPath
                ? `Missing: ${project.projectPath}`
                : "Missing path";
        const scriptSummary = scriptCount > 0 ? `\nScripts: ${scriptCount}` : "";
        const colorSummary = projectColor ? `\nColor: ${projectColor}` : "";
        const iconSummary = projectIcon ? `\nIcon: ${projectIcon}` : "";
        const pathSummary = projectPathExists
            ? project.projectPath
            : `Missing path\n${project.projectPath}`;
        this.tooltip = `${pathSummary}${colorSummary}${iconSummary}${scriptSummary}`;
        const command = (0, treeBehavior_1.getProjectRowCommandDefinition)(editMode);
        if (command && projectPathExists) {
            this.command = {
                ...command,
                arguments: [this]
            };
        }
        this.iconPath = iconPath;
    }
}
exports.ProjectItem = ProjectItem;
class ScriptItem extends vscode.TreeItem {
    constructor(project, script, editMode, contextValue = "script") {
        super(script.kind === "package" ? script.scriptName : script.name, vscode.TreeItemCollapsibleState.None);
        this.project = project;
        this.script = script;
        this.id = script.id;
        this.contextValue = contextValue;
        this.description = script.kind === "package" ? "package.json" : script.command;
        this.tooltip =
            script.kind === "package"
                ? `Runs package.json script "${script.scriptName}"\n${project.projectPath}`
                : `${script.command}\n${project.projectPath}`;
        if (!editMode) {
            this.command = {
                command: "shelfy.runProjectScript",
                title: "Run Script",
                arguments: [this]
            };
        }
        this.iconPath = new vscode.ThemeIcon("terminal");
    }
}
exports.ScriptItem = ScriptItem;
class ShelfyProvider {
    get dropMimeTypes() {
        return (0, treeBehavior_1.getShelfyTreeMimeTypes)(this.editMode);
    }
    get dragMimeTypes() {
        return (0, treeBehavior_1.getShelfyTreeMimeTypes)(this.editMode);
    }
    constructor(context, store) {
        this.context = context;
        this.store = store;
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.emitter.event;
        this.colorCache = new Map();
        this.watchers = new Map();
        this.expandedGroupIds = new Set();
        this.editMode = false;
        this.sortMode = "none";
        const saved = this.context.workspaceState.get(EXPANDED_GROUPS_KEY, this.context.workspaceState.get(LEGACY_EXPANDED_GROUPS_KEY, []));
        for (const id of saved) {
            this.expandedGroupIds.add(id);
        }
        this.sortMode = this.context.workspaceState.get(SORT_MODE_KEY, this.context.workspaceState.get(LEGACY_SORT_MODE_KEY, "none"));
        this.filterText = (0, treeFilter_1.normalizeTreeFilterText)(this.context.workspaceState.get(FILTER_TEXT_KEY) ??
            this.context.workspaceState.get(LEGACY_FILTER_TEXT_KEY));
    }
    async initialize() {
        await this.syncWatchers();
    }
    refresh() {
        void this.syncWatchers();
        this.emitter.fire();
    }
    setEditMode(enabled) {
        this.editMode = enabled;
        this.emitter.fire();
    }
    getSortMode() {
        return this.sortMode;
    }
    getFilterText() {
        return this.filterText;
    }
    hasFilter() {
        return (0, treeFilter_1.hasActiveTreeFilter)(this.filterText);
    }
    async setSortMode(mode) {
        this.sortMode = mode;
        await this.context.workspaceState.update(SORT_MODE_KEY, mode);
        this.emitter.fire();
    }
    async setFilterText(filterText) {
        const normalized = (0, treeFilter_1.normalizeTreeFilterText)(filterText);
        if (normalized === this.filterText) {
            return;
        }
        this.filterText = normalized;
        await this.context.workspaceState.update(FILTER_TEXT_KEY, normalized);
        this.emitter.fire();
    }
    async getProjectConfigurationColor(projectPath) {
        return this.ensureColor(projectPath);
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.toItems((0, treeFilter_1.filterTreeNodes)(this.store.read().children, this.filterText));
        }
        if (element instanceof GroupItem) {
            return this.toItems(element.group.children);
        }
        if (element instanceof ProjectItem) {
            return this.toScriptItems(element.project);
        }
        return [];
    }
    async markExpanded(groupId) {
        this.expandedGroupIds.add(groupId);
        await this.persistExpandedState();
    }
    async markCollapsed(groupId) {
        this.expandedGroupIds.delete(groupId);
        await this.persistExpandedState();
    }
    getExpandedGroupIds() {
        return [...this.expandedGroupIds];
    }
    async persistExpandedState() {
        await this.context.workspaceState.update(EXPANDED_GROUPS_KEY, [...this.expandedGroupIds]);
    }
    async toItems(nodes) {
        const items = [];
        const nodesToRender = this.sortNodes(nodes);
        const expandForFilter = this.hasFilter();
        const rootNodes = this.store.read().children;
        for (const node of nodesToRender) {
            const adjacentMoveTargets = (0, treeBehavior_1.getAdjacentMoveTargets)(rootNodes, node.id);
            if (node.kind === "group") {
                const iconPath = await this.resolveGroupIconPath(node);
                const item = new GroupItem(node, iconPath, getMoveContextValue("group", adjacentMoveTargets, (0, personalization_1.hasNodePersonalization)(node.personalization)));
                item.collapsibleState = expandForFilter || this.expandedGroupIds.has(node.id)
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed;
                items.push(item);
            }
            else {
                const projectPathExists = await isDirectory(node.projectPath);
                const color = await this.resolveProjectDisplayColor(node);
                const iconPath = await this.resolveProjectIconPath(node, color, projectPathExists);
                const showPath = (0, config_1.getShelfySetting)("showProjectPath", false);
                items.push(new ProjectItem(node, iconPath, color, (0, personalization_1.formatPersonalizationIcon)(node.personalization?.icon), showPath, this.editMode, this.editMode || expandForFilter, getMoveContextValue("project", adjacentMoveTargets, (0, personalization_1.hasNodePersonalization)(node.personalization), projectPathExists ? [] : ["missingPath"]), projectPathExists));
            }
        }
        return items;
    }
    toScriptItems(project) {
        return (project.scripts ?? []).map((script) => {
            const adjacentMoveTargets = (0, treeBehavior_1.getAdjacentScriptMoveTargets)(project.scripts, script.id);
            return new ScriptItem(project, script, this.editMode, getMoveContextValue("script", adjacentMoveTargets));
        });
    }
    sortNodes(nodes) {
        if (this.sortMode === "none") {
            return nodes;
        }
        const direction = this.sortMode === "asc" ? 1 : -1;
        return [...nodes].sort((a, b) => {
            if (a.kind !== b.kind) {
                return a.kind === "group" ? -1 : 1;
            }
            const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
            if (nameCompare !== 0) {
                return nameCompare * direction;
            }
            return a.id.localeCompare(b.id) * direction;
        });
    }
    async handleDrag(source, dataTransfer) {
        if (!this.editMode) {
            return;
        }
        if (source.length !== 1) {
            return;
        }
        const item = source[0];
        if (item instanceof ScriptItem) {
            return;
        }
        const payload = item instanceof GroupItem
            ? { nodeId: item.group.id, nodeKind: "group" }
            : { nodeId: item.project.id, nodeKind: "project" };
        dataTransfer.set(treeBehavior_1.SHELFY_TREE_MIME, new vscode.DataTransferItem(JSON.stringify(payload)));
    }
    async handleDrop(target, dataTransfer) {
        if (!this.editMode) {
            return;
        }
        const item = dataTransfer.get(treeBehavior_1.SHELFY_TREE_MIME);
        if (!item) {
            return;
        }
        const raw = await item.asString();
        const payload = JSON.parse(raw);
        if (target instanceof ScriptItem) {
            return;
        }
        if (target instanceof ProjectItem) {
            const targetPosition = this.findNodePosition(target.project.id);
            if (!targetPosition) {
                return;
            }
            const sourcePosition = this.findNodePosition(payload.nodeId);
            let targetIndex = targetPosition.index;
            // `moveNode` removes the source first, so dragging downward in the same
            // container needs an index shift to keep drop-before-target behavior.
            if (sourcePosition &&
                sourcePosition.parentGroupId === targetPosition.parentGroupId &&
                sourcePosition.index < targetIndex) {
                targetIndex -= 1;
            }
            await this.store.moveNode(payload.nodeId, targetPosition.parentGroupId, targetIndex);
        }
        else if (target instanceof GroupItem) {
            await this.store.moveNode(payload.nodeId, target.group.id, target.group.children.length);
        }
        else {
            const rootChildren = this.store.read().children;
            await this.store.moveNode(payload.nodeId, undefined, rootChildren.length);
        }
        this.refresh();
    }
    async ensureColor(projectPath) {
        if (this.colorCache.has(projectPath)) {
            return this.colorCache.get(projectPath);
        }
        const color = await (0, projectColor_1.readProjectColor)(projectPath);
        this.colorCache.set(projectPath, color);
        return color;
    }
    async invalidateProjectColor(projectPath) {
        this.colorCache.delete(projectPath);
        const color = await (0, projectColor_1.readProjectColor)(projectPath);
        this.colorCache.set(projectPath, color);
        this.emitter.fire();
    }
    async resolveProjectDisplayColor(project) {
        return project.personalization?.color ?? this.ensureColor(project.projectPath);
    }
    async resolveProjectIconPath(project, color, projectPathExists) {
        if (!projectPathExists) {
            return new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"));
        }
        const personalizedIcon = await getOrCreatePersonalizedIcon(this.context, project.personalization, color);
        if (personalizedIcon) {
            return personalizedIcon;
        }
        return color ? getOrCreateColorIcon(this.context, color) : new vscode.ThemeIcon("folder");
    }
    async resolveGroupIconPath(group) {
        const personalizedIcon = await getOrCreatePersonalizedIcon(this.context, group.personalization, group.personalization?.color);
        if (personalizedIcon) {
            return personalizedIcon;
        }
        return group.personalization?.color
            ? getOrCreateColorIcon(this.context, group.personalization.color)
            : new vscode.ThemeIcon("folder-library");
    }
    async syncWatchers() {
        const projects = collectProjects(this.store.read().children);
        const activePaths = new Set(projects.map((p) => p.projectPath));
        for (const project of projects) {
            if (this.watchers.has(project.projectPath)) {
                continue;
            }
            const settingsUri = vscode.Uri.file(path.join(project.projectPath, ".vscode", "settings.json"));
            const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(path.dirname(settingsUri.fsPath), path.basename(settingsUri.fsPath)));
            const onChange = () => {
                void this.invalidateProjectColor(project.projectPath);
            };
            watcher.onDidChange(onChange);
            watcher.onDidCreate(onChange);
            watcher.onDidDelete(onChange);
            this.watchers.set(project.projectPath, watcher);
            this.context.subscriptions.push(watcher);
        }
        for (const [projectPath, watcher] of [...this.watchers.entries()]) {
            if (!activePaths.has(projectPath)) {
                watcher.dispose();
                this.watchers.delete(projectPath);
                this.colorCache.delete(projectPath);
            }
        }
    }
    findNodePosition(nodeId) {
        const walk = (nodes, parentGroupId) => {
            for (let i = 0; i < nodes.length; i += 1) {
                const node = nodes[i];
                if (node.id === nodeId) {
                    return { parentGroupId, index: i };
                }
                if (node.kind === "group") {
                    const nested = walk(node.children, node.id);
                    if (nested !== undefined) {
                        return nested;
                    }
                }
            }
            return undefined;
        };
        return walk(this.store.read().children);
    }
    findParentGroupId(nodeId) {
        const walk = (nodes, parentGroupId) => {
            for (const node of nodes) {
                if (node.id === nodeId) {
                    return parentGroupId;
                }
                if (node.kind === "group") {
                    const nested = walk(node.children, node.id);
                    if (nested !== undefined) {
                        return nested;
                    }
                }
            }
            return undefined;
        };
        return walk(this.store.read().children);
    }
}
exports.ShelfyProvider = ShelfyProvider;
function getMoveContextValue(kind, adjacentMoveTargets, hasPersonalization = false, extraContextValues = []) {
    const contextValues = [kind];
    if (adjacentMoveTargets.up) {
        contextValues.push("canMoveUp");
    }
    if (adjacentMoveTargets.down) {
        contextValues.push("canMoveDown");
    }
    if (hasPersonalization) {
        contextValues.push("hasPersonalization");
    }
    contextValues.push(...extraContextValues);
    return contextValues.join(":");
}
function buildGroupTooltip(group) {
    const colorSummary = group.personalization?.color ? `\nColor: ${group.personalization.color}` : "";
    const iconLabel = (0, personalization_1.formatPersonalizationIcon)(group.personalization?.icon);
    const iconSummary = iconLabel ? `\nIcon: ${iconLabel}` : "";
    return `${group.name}${colorSummary}${iconSummary}`;
}
function collectProjects(nodes) {
    const result = [];
    for (const node of nodes) {
        if (node.kind === "project") {
            result.push(node);
        }
        else {
            result.push(...collectProjects(node.children));
        }
    }
    return result;
}
async function isDirectory(projectPath) {
    try {
        const stat = await fs.stat(projectPath);
        return stat.isDirectory();
    }
    catch {
        return false;
    }
}
async function getOrCreateColorIcon(context, color) {
    const normalized = color.toLowerCase();
    const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
    const iconDir = path.join(context.globalStorageUri.fsPath, "icons");
    const iconFile = path.join(iconDir, `${hash}.svg`);
    await fs.mkdir(iconDir, { recursive: true });
    try {
        await fs.access(iconFile);
    }
    catch {
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="2" y="2" width="12" height="12" rx="3" ry="3" fill="${normalized}" stroke="#888888" stroke-width="1"/>
</svg>`.trim();
        await fs.writeFile(iconFile, svg, "utf8");
    }
    return vscode.Uri.file(iconFile);
}
async function getOrCreatePersonalizedIcon(context, personalization, fallbackColor) {
    if (!personalization?.icon) {
        return undefined;
    }
    const icon = (0, personalization_1.getFontAwesomeIcon)(personalization.icon);
    if (!icon) {
        return undefined;
    }
    const fill = (personalization.color ?? fallbackColor ?? "#888888").toLowerCase();
    const hash = crypto
        .createHash("sha1")
        .update(`${icon.iconName}:${fill}`)
        .digest("hex")
        .slice(0, 12);
    const iconDir = path.join(context.globalStorageUri.fsPath, "icons");
    const iconFile = path.join(iconDir, `fa-${hash}.svg`);
    await fs.mkdir(iconDir, { recursive: true });
    try {
        await fs.access(iconFile);
    }
    catch {
        const [width, height, , , svgPathData] = icon.icon;
        const paths = (Array.isArray(svgPathData) ? svgPathData : [svgPathData])
            .map((pathData) => `<path d="${pathData}" fill="${fill}"/>`)
            .join("");
        const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 ${width} ${height}">
  ${paths}
</svg>`.trim();
        await fs.writeFile(iconFile, svg, "utf8");
    }
    return vscode.Uri.file(iconFile);
}
//# sourceMappingURL=tree.js.map