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
exports.GlobalProjectsProvider = exports.ProjectItem = exports.GroupItem = void 0;
const vscode = __importStar(require("vscode"));
const projectColor_1 = require("./projectColor");
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const EXPANDED_GROUPS_KEY = "globalProjects.expandedGroups";
const SORT_MODE_KEY = "globalProjects.sortMode";
class GroupItem extends vscode.TreeItem {
    constructor(group) {
        super(group.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.group = group;
        this.id = group.id;
        this.contextValue = "group";
        this.tooltip = group.name;
        this.iconPath = new vscode.ThemeIcon("folder-library");
    }
}
exports.GroupItem = GroupItem;
class ProjectItem extends vscode.TreeItem {
    constructor(project, iconPath, projectColor, showPath = true) {
        super(project.name, vscode.TreeItemCollapsibleState.None);
        this.project = project;
        this.id = project.id;
        this.contextValue = "project";
        this.description = showPath ? project.projectPath : undefined;
        this.tooltip = `${project.projectPath}${projectColor ? `\nColor: ${projectColor}` : ""}`;
        this.command = {
            command: "globalProjects.openProjectFromRow",
            title: "Open Project",
            arguments: [this]
        };
        this.iconPath = iconPath;
    }
}
exports.ProjectItem = ProjectItem;
class GlobalProjectsProvider {
    get dropMimeTypes() {
        return this.editMode ? ["application/vnd.code.tree.globalProjectsView"] : [];
    }
    get dragMimeTypes() {
        return this.editMode ? ["application/vnd.code.tree.globalProjectsView"] : [];
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
        const saved = this.context.workspaceState.get(EXPANDED_GROUPS_KEY, []);
        for (const id of saved) {
            this.expandedGroupIds.add(id);
        }
        this.sortMode = this.context.workspaceState.get(SORT_MODE_KEY, "none");
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
    async setSortMode(mode) {
        this.sortMode = mode;
        await this.context.workspaceState.update(SORT_MODE_KEY, mode);
        this.emitter.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        if (!element) {
            return this.toItems(this.store.read().children);
        }
        if (element instanceof GroupItem) {
            return this.toItems(element.group.children);
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
        for (const node of nodesToRender) {
            if (node.kind === "group") {
                const item = new GroupItem(node);
                item.collapsibleState = this.expandedGroupIds.has(node.id)
                    ? vscode.TreeItemCollapsibleState.Expanded
                    : vscode.TreeItemCollapsibleState.Collapsed;
                items.push(item);
            }
            else {
                const color = await this.ensureColor(node.projectPath);
                const iconPath = color
                    ? await getOrCreateColorIcon(this.context, color)
                    : new vscode.ThemeIcon("folder");
                const showPath = vscode.workspace
                    .getConfiguration("globalProjects")
                    .get("showProjectPath", false);
                items.push(new ProjectItem(node, iconPath, color, showPath));
            }
        }
        return items;
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
        const payload = item instanceof GroupItem
            ? { nodeId: item.group.id, nodeKind: "group" }
            : { nodeId: item.project.id, nodeKind: "project" };
        dataTransfer.set("application/vnd.code.tree.globalProjectsView", new vscode.DataTransferItem(JSON.stringify(payload)));
    }
    async handleDrop(target, dataTransfer) {
        if (!this.editMode) {
            return;
        }
        const item = dataTransfer.get("application/vnd.code.tree.globalProjectsView");
        if (!item) {
            return;
        }
        const raw = await item.asString();
        const payload = JSON.parse(raw);
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
exports.GlobalProjectsProvider = GlobalProjectsProvider;
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
//# sourceMappingURL=tree.js.map