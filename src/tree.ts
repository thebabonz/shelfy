import * as vscode from "vscode";
import { getShelfySetting } from "./config";
import { GroupNodeData, NodeData, ProjectNodeData, ProjectScriptData } from "./model";
import { readProjectColor } from "./projectColor";
import { ProjectStore } from "./store";
import {
  getShelfyTreeMimeTypes,
  getProjectRowCommandDefinition,
  SHELFY_TREE_MIME
} from "./treeBehavior";
import { filterTreeNodes, hasActiveTreeFilter, normalizeTreeFilterText } from "./treeFilter";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";

type DragPayload = {
  nodeId: string;
  nodeKind: "group" | "project";
};

export type SortMode = "none" | "asc" | "desc";

const EXPANDED_GROUPS_KEY = "shelfy.expandedGroups";
const LEGACY_EXPANDED_GROUPS_KEY = "globalProjects.expandedGroups";
const SORT_MODE_KEY = "shelfy.sortMode";
const LEGACY_SORT_MODE_KEY = "globalProjects.sortMode";
const FILTER_TEXT_KEY = "shelfy.filterText";
const LEGACY_FILTER_TEXT_KEY = "globalProjects.filterText";

export class GroupItem extends vscode.TreeItem {
  constructor(public readonly group: GroupNodeData) {
    super(group.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = group.id;
    this.contextValue = "group";
    this.tooltip = group.name;
    this.iconPath = new vscode.ThemeIcon("folder-library");
  }
}

export class ProjectItem extends vscode.TreeItem {
  constructor(
    public readonly project: ProjectNodeData,
    iconPath: vscode.ThemeIcon | vscode.Uri,
    projectColor?: string,
    showPath = true,
    editMode = false,
    expandScripts = editMode
  ) {
    const scriptCount = project.scripts?.length ?? 0;

    super(
      project.name,
      scriptCount > 0
        ? expandScripts
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    this.id = project.id;
    this.contextValue = "project";
    this.description = showPath ? project.projectPath : undefined;
    const scriptSummary = scriptCount > 0 ? `\nScripts: ${scriptCount}` : "";
    this.tooltip = `${project.projectPath}${projectColor ? `\nColor: ${projectColor}` : ""}${scriptSummary}`;

    const command = getProjectRowCommandDefinition(editMode);
    if (command) {
      this.command = {
        ...command,
        arguments: [this]
      };
    }

    this.iconPath = iconPath;
  }
}

export class ScriptItem extends vscode.TreeItem {
  constructor(
    public readonly project: ProjectNodeData,
    public readonly script: ProjectScriptData,
    editMode: boolean
  ) {
    super(
      script.kind === "package" ? script.scriptName : script.name,
      vscode.TreeItemCollapsibleState.None
    );

    this.id = script.id;
    this.contextValue = "script";
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

export class ShelfyProvider
  implements
    vscode.TreeDataProvider<GroupItem | ProjectItem | ScriptItem>,
    vscode.TreeDragAndDropController<GroupItem | ProjectItem | ScriptItem>
{
  private readonly emitter = new vscode.EventEmitter<
    GroupItem | ProjectItem | ScriptItem | undefined | void
  >();
  readonly onDidChangeTreeData = this.emitter.event;

  get dropMimeTypes(): readonly string[] {
    return getShelfyTreeMimeTypes(this.editMode);
  }

  get dragMimeTypes(): readonly string[] {
    return getShelfyTreeMimeTypes(this.editMode);
  }

  private readonly colorCache = new Map<string, string | undefined>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly expandedGroupIds = new Set<string>();
  private editMode = false;
  private sortMode: SortMode = "none";
  private filterText: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: ProjectStore
  ) {
    const saved = this.context.workspaceState.get<string[]>(
      EXPANDED_GROUPS_KEY,
      this.context.workspaceState.get<string[]>(LEGACY_EXPANDED_GROUPS_KEY, [])
    );
    for (const id of saved) {
      this.expandedGroupIds.add(id);
    }

    this.sortMode = this.context.workspaceState.get<SortMode>(
      SORT_MODE_KEY,
      this.context.workspaceState.get<SortMode>(LEGACY_SORT_MODE_KEY, "none")
    );
    this.filterText = normalizeTreeFilterText(
      this.context.workspaceState.get<string>(FILTER_TEXT_KEY) ??
        this.context.workspaceState.get<string>(LEGACY_FILTER_TEXT_KEY)
    );
  }

  async initialize(): Promise<void> {
    await this.syncWatchers();
  }

  refresh(): void {
    void this.syncWatchers();
    this.emitter.fire();
  }

  setEditMode(enabled: boolean): void {
    this.editMode = enabled;
    this.emitter.fire();
  }

  getSortMode(): SortMode {
    return this.sortMode;
  }

  getFilterText(): string | undefined {
    return this.filterText;
  }

  hasFilter(): boolean {
    return hasActiveTreeFilter(this.filterText);
  }

  async setSortMode(mode: SortMode): Promise<void> {
    this.sortMode = mode;
    await this.context.workspaceState.update(SORT_MODE_KEY, mode);
    this.emitter.fire();
  }

  async setFilterText(filterText: string | undefined): Promise<void> {
    const normalized = normalizeTreeFilterText(filterText);
    if (normalized === this.filterText) {
      return;
    }

    this.filterText = normalized;
    await this.context.workspaceState.update(FILTER_TEXT_KEY, normalized);
    this.emitter.fire();
  }

  getTreeItem(element: GroupItem | ProjectItem | ScriptItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: GroupItem | ProjectItem | ScriptItem
  ): Promise<Array<GroupItem | ProjectItem | ScriptItem>> {
    if (!element) {
      return this.toItems(filterTreeNodes(this.store.read().children, this.filterText));
    }

    if (element instanceof GroupItem) {
      return this.toItems(element.group.children);
    }

    if (element instanceof ProjectItem) {
      return this.toScriptItems(element.project);
    }

    return [];
  }

  async markExpanded(groupId: string): Promise<void> {
    this.expandedGroupIds.add(groupId);
    await this.persistExpandedState();
  }

  async markCollapsed(groupId: string): Promise<void> {
    this.expandedGroupIds.delete(groupId);
    await this.persistExpandedState();
  }

  getExpandedGroupIds(): string[] {
    return [...this.expandedGroupIds];
  }

  private async persistExpandedState(): Promise<void> {
    await this.context.workspaceState.update(
      EXPANDED_GROUPS_KEY,
      [...this.expandedGroupIds]
    );
  }

  private async toItems(nodes: NodeData[]): Promise<Array<GroupItem | ProjectItem>> {
    const items: Array<GroupItem | ProjectItem> = [];
    const nodesToRender = this.sortNodes(nodes);
    const expandForFilter = this.hasFilter();

    for (const node of nodesToRender) {
      if (node.kind === "group") {
        const item = new GroupItem(node);
        item.collapsibleState = expandForFilter || this.expandedGroupIds.has(node.id)
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.Collapsed;
        items.push(item);
      } else {
        const color = await this.ensureColor(node.projectPath);
        const iconPath = color
          ? await getOrCreateColorIcon(this.context, color)
          : new vscode.ThemeIcon("folder");
        const showPath = getShelfySetting<boolean>("showProjectPath", false);

        items.push(new ProjectItem(node, iconPath, color, showPath, this.editMode, this.editMode || expandForFilter));
      }
    }

    return items;
  }

  private toScriptItems(project: ProjectNodeData): ScriptItem[] {
    return (project.scripts ?? []).map((script) => new ScriptItem(project, script, this.editMode));
  }

  private sortNodes(nodes: NodeData[]): NodeData[] {
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

  async handleDrag(
    source: readonly (GroupItem | ProjectItem | ScriptItem)[],
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
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

    const payload: DragPayload =
      item instanceof GroupItem
        ? { nodeId: item.group.id, nodeKind: "group" }
        : { nodeId: item.project.id, nodeKind: "project" };

    dataTransfer.set(
      SHELFY_TREE_MIME,
      new vscode.DataTransferItem(JSON.stringify(payload))
    );
  }

  async handleDrop(
    target: GroupItem | ProjectItem | ScriptItem | undefined,
    dataTransfer: vscode.DataTransfer
  ): Promise<void> {
    if (!this.editMode) {
      return;
    }

    const item = dataTransfer.get(SHELFY_TREE_MIME);
    if (!item) {
      return;
    }

    const raw = await item.asString();
    const payload = JSON.parse(raw) as DragPayload;

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
      if (
        sourcePosition &&
        sourcePosition.parentGroupId === targetPosition.parentGroupId &&
        sourcePosition.index < targetIndex
      ) {
        targetIndex -= 1;
      }

      await this.store.moveNode(payload.nodeId, targetPosition.parentGroupId, targetIndex);
    } else if (target instanceof GroupItem) {
      await this.store.moveNode(payload.nodeId, target.group.id, target.group.children.length);
    } else {
      const rootChildren = this.store.read().children;
      await this.store.moveNode(payload.nodeId, undefined, rootChildren.length);
    }

    this.refresh();
  }

  async ensureColor(projectPath: string): Promise<string | undefined> {
    if (this.colorCache.has(projectPath)) {
      return this.colorCache.get(projectPath);
    }

    const color = await readProjectColor(projectPath);
    this.colorCache.set(projectPath, color);
    return color;
  }

  async invalidateProjectColor(projectPath: string): Promise<void> {
    this.colorCache.delete(projectPath);
    const color = await readProjectColor(projectPath);
    this.colorCache.set(projectPath, color);
    this.emitter.fire();
  }

  private async syncWatchers(): Promise<void> {
    const projects = collectProjects(this.store.read().children);
    const activePaths = new Set(projects.map((p) => p.projectPath));

    for (const project of projects) {
      if (this.watchers.has(project.projectPath)) {
        continue;
      }

      const settingsUri = vscode.Uri.file(path.join(project.projectPath, ".vscode", "settings.json"));
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(path.dirname(settingsUri.fsPath), path.basename(settingsUri.fsPath))
      );

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

  private findNodePosition(
    nodeId: string
  ): { parentGroupId: string | undefined; index: number } | undefined {
    const walk = (
      nodes: NodeData[],
      parentGroupId?: string
    ): { parentGroupId: string | undefined; index: number } | undefined => {
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

  private findParentGroupId(nodeId: string): string | undefined {
    const walk = (nodes: NodeData[], parentGroupId?: string): string | undefined => {
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

function collectProjects(nodes: NodeData[]): ProjectNodeData[] {
  const result: ProjectNodeData[] = [];

  for (const node of nodes) {
    if (node.kind === "project") {
      result.push(node);
    } else {
      result.push(...collectProjects(node.children));
    }
  }

  return result;
}

async function getOrCreateColorIcon(
  context: vscode.ExtensionContext,
  color: string
): Promise<vscode.Uri> {
  const normalized = color.toLowerCase();
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  const iconDir = path.join(context.globalStorageUri.fsPath, "icons");
  const iconFile = path.join(iconDir, `${hash}.svg`);

  await fs.mkdir(iconDir, { recursive: true });

  try {
    await fs.access(iconFile);
  } catch {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <rect x="2" y="2" width="12" height="12" rx="3" ry="3" fill="${normalized}" stroke="#888888" stroke-width="1"/>
</svg>`.trim();

    await fs.writeFile(iconFile, svg, "utf8");
  }

  return vscode.Uri.file(iconFile);
}