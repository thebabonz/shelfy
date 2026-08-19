import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import {
  GroupNodeData,
  NewProjectScriptData,
  NodePersonalization,
  NodeData,
  ProjectNodeData,
  ProjectScriptData,
  RootData
} from "./model";
import {
  isKnownFontAwesomeIcon,
  normalizeNodePersonalization
} from "./personalization";
import { isColorValue } from "./projectColor";
import { addProjectScriptsToProject, updateProjectScriptInProject } from "./projectScriptState";
import { StorageMode, getStorageMode } from "./config";

const STORAGE_KEY = "shelfy.data.v2";
const LEGACY_STORAGE_KEY = "globalProjects.data.v2";
const GLOBAL_STORAGE_FILE = "shelfy-data.json";

interface IDataStorage {
  read(): Promise<RootData>;
  write(data: RootData): Promise<void>;
}

class ProfileDataStorage implements IDataStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async read(): Promise<RootData> {
    const stored = this.context.globalState.get<RootData>(STORAGE_KEY);
    const legacy = this.context.globalState.get<RootData>(LEGACY_STORAGE_KEY);

    if (isEmptyRootData(stored) && hasRootChildren(legacy)) {
      return legacy;
    }

    return (
      stored ??
      legacy ?? {
        version: 2,
        children: []
      }
    );
  }

  async write(data: RootData): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, data);
    await this.context.globalState.update(LEGACY_STORAGE_KEY, undefined);
  }
}

class GlobalDataStorage implements IDataStorage {
  constructor(private readonly context: vscode.ExtensionContext) {}

  private getDataFilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, GLOBAL_STORAGE_FILE);
  }

  async read(): Promise<RootData> {
    try {
      const filePath = this.getDataFilePath();
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content) as RootData;
      return data;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return {
          version: 2,
          children: []
        };
      }
      throw error;
    }
  }

  async write(data: RootData): Promise<void> {
    const filePath = this.getDataFilePath();
    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, "utf-8");
  }
}

export class ProjectStore {
  private storage: IDataStorage;
  private currentMode: StorageMode;
  private cachedData: RootData | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.currentMode = getStorageMode();
    this.storage = this.createStorage(this.currentMode);
  }

  private createStorage(mode: StorageMode): IDataStorage {
    return mode === "global" ? new GlobalDataStorage(this.context) : new ProfileDataStorage(this.context);
  }

  async initialize(): Promise<void> {
    this.cachedData = await this.storage.read();
  }

  read(): RootData {
    if (!this.cachedData) {
      throw new Error("ProjectStore not initialized. Call initialize() first.");
    }
    return this.cachedData;
  }

  exportData(): RootData {
    return structuredClone(this.read());
  }

  async importData(data: unknown): Promise<RootData> {
    const normalized = normalizeRootData(data);
    await this.write(normalized);
    return normalized;
  }

  async write(data: RootData): Promise<void> {
    this.cachedData = data;
    await this.storage.write(data);
  }

  async migrateStorageIfNeeded(): Promise<void> {
    const nextMode = getStorageMode();
    if (nextMode === this.currentMode) {
      return;
    }

    const data = this.read();
    this.currentMode = nextMode;
    this.storage = this.createStorage(nextMode);
    await this.write(data);
  }

  getParentGroupId(nodeId: string): string | undefined {
    const result = findParentGroupIdForNode(this.read().children, nodeId);
    return result.found ? result.parentId : undefined;
  }

  async addGroup(name: string, parentGroupId?: string): Promise<GroupNodeData> {
    const data = this.read();
    const group: GroupNodeData = {
      kind: "group",
      id: crypto.randomUUID(),
      name,
      children: []
    };

    if (!parentGroupId) {
      data.children.push(group);
    } else {
      const parent = findGroup(data.children, parentGroupId);
      if (!parent) {
        throw new Error("Parent group not found.");
      }
      parent.children.push(group);
    }

    await this.write(data);
    return group;
  }

  async renameGroup(groupId: string, newName: string): Promise<void> {
    const data = this.read();
    const group = findGroup(data.children, groupId);
    if (!group) {
      throw new Error("Group not found.");
    }
    group.name = newName;
    await this.write(data);
  }

  async renameProject(projectId: string, newName: string): Promise<void> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }
    project.name = newName;
    await this.write(data);
  }

  async updateProjectPath(projectId: string, projectPath: string): Promise<void> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const normalized = normalizeProjectPath(projectPath);
    const existing = findProjectByPath(data.children, normalized);
    if (existing && existing.id !== projectId) {
      throw new Error(`That project is already saved as "${existing.name}".`);
    }

    project.projectPath = normalized;
    await this.write(data);
  }

  async setNodePersonalization(
    nodeId: string,
    personalization: NodePersonalization | undefined
  ): Promise<void> {
    const data = this.read();
    const node = findNodeById(data.children, nodeId);
    if (!node) {
      throw new Error("Item not found.");
    }

    node.personalization = cloneNodePersonalization(personalization);
    await this.write(data);
  }

  async addProject(input: {
    parentGroupId?: string;
    name: string;
    projectPath: string;
  }): Promise<ProjectNodeData> {
    const data = this.read();
    const normalized = normalizeProjectPath(input.projectPath);

    const existing = findProjectByPath(data.children, normalized);
    if (existing) {
      throw new Error(`That project is already saved as "${existing.name}".`);
    }

    const project: ProjectNodeData = {
      kind: "project",
      id: crypto.randomUUID(),
      name: input.name,
      projectPath: normalized,
      scripts: []
    };

    if (!input.parentGroupId) {
      data.children.push(project);
    } else {
      const parent = findGroup(data.children, input.parentGroupId);
      if (!parent) {
        throw new Error("Parent group not found.");
      }
      parent.children.push(project);
    }

    await this.write(data);
    return project;
  }

  async addProjectScripts(projectId: string, scripts: NewProjectScriptData[]): Promise<ProjectScriptData[]> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const added = addProjectScriptsToProject(project, scripts);

    await this.write(data);
    return added;
  }

  async updateProjectScript(
    projectId: string,
    scriptId: string,
    nextScript: NewProjectScriptData
  ): Promise<ProjectScriptData> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const updated = updateProjectScriptInProject(project, scriptId, nextScript);

    await this.write(data);
    return updated;
  }

  async removeProjectScript(projectId: string, scriptId: string): Promise<void> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const scripts = project.scripts ?? [];
    const index = scripts.findIndex((script) => script.id === scriptId);
    if (index < 0) {
      throw new Error("Script not found.");
    }

    scripts.splice(index, 1);
    await this.write(data);
  }

  async moveProjectScript(projectId: string, scriptId: string, targetIndex: number): Promise<void> {
    const data = this.read();
    const project = findProjectById(data.children, projectId);
    if (!project) {
      throw new Error("Project not found.");
    }

    const scripts = project.scripts ?? [];
    const index = scripts.findIndex((script) => script.id === scriptId);
    if (index < 0) {
      throw new Error("Script not found.");
    }

    const [script] = scripts.splice(index, 1);
    const clampedIndex = Math.max(0, Math.min(targetIndex, scripts.length));
    scripts.splice(clampedIndex, 0, script);

    await this.write(data);
  }

  async removeNode(nodeId: string): Promise<void> {
    const data = this.read();
    const removed = removeNodeRecursive(data.children, nodeId);
    if (!removed) {
      throw new Error("Item not found.");
    }
    await this.write(data);
  }

  async cloneGroupWithNewBase(groupId: string, newName: string, newBasePath: string): Promise<{ group: GroupNodeData; commonBase: string }> {
    const data = this.read();
    const group = findGroup(data.children, groupId);
    if (!group) {
      throw new Error("Group not found.");
    }

    const projectPaths = collectProjectPathsFromGroup(group);
    if (projectPaths.length === 0) {
      throw new Error("Group has no projects to repath.");
    }

    const commonBase = findCommonBasePath(projectPaths);
    if (!commonBase) {
      throw new Error(
        "The projects in this group do not share a common parent folder, so their paths cannot be rebased."
      );
    }

    const normalizedNew = normalizeProjectPath(newBasePath);
    const cloned = deepCloneGroupWithRebase(group, commonBase, normalizedNew, newName);

    assertClonedProjectPathsAreAvailable(data.children, cloned);

    const parentResult = findParentGroupIdForNode(data.children, groupId);
    if (!parentResult.found) {
      throw new Error("Group not found in tree.");
    }

    if (parentResult.parentId === undefined) {
      data.children.push(cloned);
    } else {
      const parent = findGroup(data.children, parentResult.parentId);
      if (!parent) {
        throw new Error("Parent group not found.");
      }
      parent.children.push(cloned);
    }

    await this.write(data);
    return { group: cloned, commonBase };
  }

  async moveNode(nodeId: string, targetGroupId: string | undefined, targetIndex: number): Promise<void> {
    const data = this.read();

    // Validate and resolve the destination before touching the tree: `read()`
    // returns the live cache, so throwing after extracting the node would drop
    // it from the tree even though the move never completed.
    const node = findNodeById(data.children, nodeId);
    if (!node) {
      throw new Error("Dragged item not found.");
    }

    if (node.kind === "group" && targetGroupId && containsGroup(node, targetGroupId)) {
      throw new Error("Cannot move a group into itself or one of its children.");
    }

    // Splicing mutates these arrays in place, so the reference stays valid
    // across the extraction below.
    const targetArray = targetGroupId
      ? findGroup(data.children, targetGroupId)?.children
      : data.children;

    if (!targetArray) {
      throw new Error("Drop target group not found.");
    }

    const extracted = extractNode(data.children, nodeId);
    if (!extracted) {
      throw new Error("Dragged item not found.");
    }

    const clampedIndex = Math.max(0, Math.min(targetIndex, targetArray.length));
    targetArray.splice(clampedIndex, 0, extracted.node);

    await this.write(data);
  }
}

export function normalizeProjectPath(input: string): string {
  return stripTrailingSeparators(path.normalize(input.trim()));
}

/**
 * Comparison key for a project path. Paths are stored with the casing the user
 * picked, but compared case-insensitively where the file system is, so the same
 * folder cannot be saved twice under different casing.
 */
export function getProjectPathKey(projectPath: string): string {
  const normalized = normalizeProjectPath(projectPath);
  return isCaseInsensitiveFileSystem() ? normalized.toLowerCase() : normalized;
}

function isCaseInsensitiveFileSystem(): boolean {
  return process.platform === "win32" || process.platform === "darwin";
}

function stripTrailingSeparators(normalized: string): string {
  let end = normalized.length;
  while (end > 1 && normalized.charAt(end - 1) === path.sep) {
    end -= 1;
  }

  const trimmed = normalized.slice(0, end);

  // "C:\", "/" and "\\" are roots rather than folders named "C:" or "", so they
  // keep their separator; everything else drops it.
  if (trimmed.length === 0 || trimmed === path.sep || /^[A-Za-z]:$/.test(trimmed)) {
    return normalized;
  }

  return trimmed;
}

function hasRootChildren(data: RootData | undefined): data is RootData {
  return data !== undefined && data.children.length > 0;
}

function isEmptyRootData(data: RootData | undefined): data is RootData {
  return data !== undefined && data.children.length === 0;
}

export function findGroup(nodes: NodeData[], groupId: string): GroupNodeData | undefined {
  for (const node of nodes) {
    if (node.kind === "group") {
      if (node.id === groupId) {
        return node;
      }
      const nested = findGroup(node.children, groupId);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

export function findProjectByPath(nodes: NodeData[], projectPath: string): ProjectNodeData | undefined {
  return findProjectByPathKey(nodes, getProjectPathKey(projectPath));
}

function findProjectByPathKey(nodes: NodeData[], projectPathKey: string): ProjectNodeData | undefined {
  for (const node of nodes) {
    if (node.kind === "project") {
      if (getProjectPathKey(node.projectPath) === projectPathKey) {
        return node;
      }
    } else {
      const nested = findProjectByPathKey(node.children, projectPathKey);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function findProjectById(nodes: NodeData[], projectId: string): ProjectNodeData | undefined {
  for (const node of nodes) {
    if (node.kind === "project") {
      if (node.id === projectId) {
        return node;
      }
    } else {
      const nested = findProjectById(node.children, projectId);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function removeNodeRecursive(nodes: NodeData[], nodeId: string): boolean {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index >= 0) {
    nodes.splice(index, 1);
    return true;
  }

  for (const node of nodes) {
    if (node.kind === "group" && removeNodeRecursive(node.children, nodeId)) {
      return true;
    }
  }

  return false;
}

function extractNode(nodes: NodeData[], nodeId: string): { node: NodeData } | undefined {
  const index = nodes.findIndex((node) => node.id === nodeId);
  if (index >= 0) {
    const [node] = nodes.splice(index, 1);
    return { node };
  }

  for (const node of nodes) {
    if (node.kind === "group") {
      const extracted = extractNode(node.children, nodeId);
      if (extracted) {
        return extracted;
      }
    }
  }

  return undefined;
}

function containsGroup(group: GroupNodeData, groupId: string): boolean {
  if (group.id === groupId) {
    return true;
  }

  for (const child of group.children) {
    if (child.kind === "group" && containsGroup(child, groupId)) {
      return true;
    }
  }

  return false;
}

/**
 * Every saved project must have a unique path, so a clone that would collide
 * with an existing project (or with another project inside the clone) is
 * rejected before it reaches the tree.
 */
function assertClonedProjectPathsAreAvailable(nodes: NodeData[], cloned: GroupNodeData): void {
  const clonedKeys = new Set<string>();

  for (const clonedPath of collectProjectPathsFromGroup(cloned)) {
    const key = getProjectPathKey(clonedPath);

    const existing = findProjectByPathKey(nodes, key);
    if (existing) {
      throw new Error(
        `Cloning would reuse "${clonedPath}", which is already saved as "${existing.name}".`
      );
    }

    if (clonedKeys.has(key)) {
      throw new Error(`Cloning would save "${clonedPath}" more than once.`);
    }

    clonedKeys.add(key);
  }
}

function collectProjectPathsFromGroup(group: GroupNodeData): string[] {
  const result: string[] = [];
  for (const child of group.children) {
    if (child.kind === "project") {
      result.push(child.projectPath);
    } else {
      result.push(...collectProjectPathsFromGroup(child));
    }
  }
  return result;
}

export function findCommonBasePath(paths: string[]): string {
  if (paths.length === 0) {
    return "";
  }
  const normalized = paths.map((p) => normalizeProjectPath(p));
  const segments = normalized.map((p) => p.split(path.sep));
  const first = segments[0];
  // Start at most at the parent of the first path (exclude the leaf segment)
  let commonLength = first.length - 1;

  for (const segs of segments.slice(1)) {
    let i = 0;
    while (i < commonLength && i < segs.length && matchesPathSegment(first[i], segs[i])) {
      i++;
    }
    commonLength = i;
  }

  return first.slice(0, commonLength).join(path.sep);
}

function matchesPathSegment(left: string, right: string): boolean {
  return isCaseInsensitiveFileSystem() ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function rebasePath(projectPath: string, oldBase: string, newBase: string): string {
  const normalized = normalizeProjectPath(projectPath);
  const normalizedOld = normalizeProjectPath(oldBase);

  const prefix = normalizedOld + path.sep;
  if (normalized.startsWith(prefix)) {
    return normalizeProjectPath(path.join(newBase, normalized.slice(prefix.length)));
  }
  if (normalized === normalizedOld) {
    return normalizeProjectPath(newBase);
  }
  return normalized;
}

function deepCloneGroupWithRebase(group: GroupNodeData, oldBase: string, newBase: string, newName: string): GroupNodeData {
  return {
    kind: "group",
    id: crypto.randomUUID(),
    name: newName,
    personalization: cloneNodePersonalization(group.personalization),
    children: group.children.map((child) => {
      if (child.kind === "group") {
        return deepCloneGroupWithRebase(child, oldBase, newBase, child.name);
      } else {
        return {
          kind: "project",
          id: crypto.randomUUID(),
          name: child.name,
          projectPath: rebasePath(child.projectPath, oldBase, newBase),
          scripts: child.scripts?.map(cloneProjectScript),
          personalization: cloneNodePersonalization(child.personalization)
        };
      }
    })
  };
}

function cloneProjectScript(script: ProjectScriptData): ProjectScriptData {
  return script.kind === "package"
    ? {
        kind: "package",
        id: crypto.randomUUID(),
        scriptName: script.scriptName
      }
    : {
        kind: "custom",
        id: crypto.randomUUID(),
        name: script.name,
        command: script.command
      };
}

function findParentGroupIdForNode(
  nodes: NodeData[],
  targetId: string,
  currentParentId: string | undefined = undefined
): { found: true; parentId: string | undefined } | { found: false } {
  for (const node of nodes) {
    if (node.id === targetId) {
      return { found: true, parentId: currentParentId };
    }
    if (node.kind === "group") {
      const result = findParentGroupIdForNode(node.children, targetId, node.id);
      if (result.found) {
        return result;
      }
    }
  }
  return { found: false };
}

function normalizeRootData(value: unknown): RootData {
  const record = asRecord(value, "The selected file does not contain a valid Shelfy configuration.");

  if (record.version !== 2) {
    throw new Error(`Unsupported configuration version "${String(record.version)}".`);
  }

  if (!Array.isArray(record.children)) {
    throw new Error("The selected configuration is missing its project tree.");
  }

  const usedIds = new Set<string>();
  const projectPaths = new Set<string>();

  return {
    version: 2,
    children: normalizeNodes(record.children, usedIds, projectPaths, "root")
  };
}

function normalizeNodes(
  value: unknown,
  usedIds: Set<string>,
  projectPaths: Set<string>,
  location: string
): NodeData[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected an array of items at ${location}.`);
  }

  return value.map((node, index) => normalizeNode(node, usedIds, projectPaths, `${location}[${index}]`));
}

function normalizeNode(
  value: unknown,
  usedIds: Set<string>,
  projectPaths: Set<string>,
  location: string
): NodeData {
  const record = asRecord(value, `Invalid item at ${location}.`);

  if (record.kind === "group") {
    return {
      kind: "group",
      id: getUniqueId(record.id, usedIds),
      name: readNonEmptyString(record.name, `Group name at ${location}`),
      children: normalizeNodes(record.children ?? [], usedIds, projectPaths, `${location}.children`),
      personalization: normalizeOptionalNodePersonalization(
        record.personalization,
        `${location}.personalization`
      )
    };
  }

  if (record.kind === "project") {
    const projectPath = normalizeProjectPath(
      readNonEmptyString(record.projectPath, `Project path at ${location}`)
    );

    const projectPathKey = getProjectPathKey(projectPath);
    if (projectPaths.has(projectPathKey)) {
      throw new Error(`Duplicate project path in import file: "${projectPath}".`);
    }

    projectPaths.add(projectPathKey);

    return {
      kind: "project",
      id: getUniqueId(record.id, usedIds),
      name: readNonEmptyString(record.name, `Project name at ${location}`),
      projectPath,
      scripts: normalizeProjectScripts(record.scripts ?? [], usedIds, `${location}.scripts`),
      personalization: normalizeOptionalNodePersonalization(
        record.personalization,
        `${location}.personalization`
      )
    };
  }

  throw new Error(`Unsupported item kind at ${location}.`);
}

function normalizeProjectScripts(
  value: unknown,
  usedIds: Set<string>,
  location: string
): ProjectScriptData[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected an array of scripts at ${location}.`);
  }

  const seenScripts = new Set<string>();
  const scripts: ProjectScriptData[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const script = normalizeProjectScript(value[index], usedIds, `${location}[${index}]`);
    const scriptKey =
      script.kind === "package" ? `package:${script.scriptName}` : `custom:${script.command}`;

    if (seenScripts.has(scriptKey)) {
      throw new Error(`Duplicate script entry at ${location}: "${scriptKey}".`);
    }

    seenScripts.add(scriptKey);
    scripts.push(script);
  }

  return scripts;
}

function normalizeProjectScript(
  value: unknown,
  usedIds: Set<string>,
  location: string
): ProjectScriptData {
  const record = asRecord(value, `Invalid script at ${location}.`);

  if (record.kind === "package") {
    return {
      kind: "package",
      id: getUniqueId(record.id, usedIds),
      scriptName: readNonEmptyString(record.scriptName, `Package script name at ${location}`)
    };
  }

  if (record.kind === "custom") {
    return {
      kind: "custom",
      id: getUniqueId(record.id, usedIds),
      name: readNonEmptyString(record.name, `Custom script name at ${location}`),
      command: readNonEmptyString(record.command, `Custom script command at ${location}`)
    };
  }

  throw new Error(`Unsupported script kind at ${location}.`);
}

function normalizeOptionalNodePersonalization(
  value: unknown,
  location: string
): NodePersonalization | undefined {
  if (value === undefined) {
    return undefined;
  }

  const record = asRecord(value, `Invalid personalization at ${location}.`);
  const color = readOptionalColor(record.color, `${location}.color`);
  const icon = readOptionalFontAwesomeIcon(record.icon, `${location}.icon`);

  return normalizeNodePersonalization({ color, icon });
}

function readOptionalColor(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const color = readNonEmptyString(value, label);
  if (!isColorValue(color)) {
    throw new Error(`${label} must be a valid color value.`);
  }

  return color;
}

function readOptionalFontAwesomeIcon(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const iconName = readNonEmptyString(value, label);
  if (!isKnownFontAwesomeIcon(iconName)) {
    throw new Error(`${label} must be a valid Font Awesome Free Solid icon name.`);
  }

  return iconName;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(message);
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a non-empty string.`);
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return normalized;
}

function getUniqueId(value: unknown, usedIds: Set<string>): string {
  const preferred = typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  if (preferred && !usedIds.has(preferred)) {
    usedIds.add(preferred);
    return preferred;
  }

  let generated = crypto.randomUUID();
  while (usedIds.has(generated)) {
    generated = crypto.randomUUID();
  }

  usedIds.add(generated);
  return generated;
}

function findNodeById(nodes: NodeData[], nodeId: string): GroupNodeData | ProjectNodeData | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) {
      return node;
    }

    if (node.kind === "group") {
      const nested = findNodeById(node.children, nodeId);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}

function cloneNodePersonalization(
  personalization: NodePersonalization | undefined
): NodePersonalization | undefined {
  return normalizeNodePersonalization(personalization);
}
