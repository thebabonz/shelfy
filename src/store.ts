import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import {
  GroupNodeData,
  NewProjectScriptData,
  NodeData,
  ProjectNodeData,
  ProjectScriptData,
  RootData
} from "./model";

const STORAGE_KEY = "globalProjects.data.v2";

export class ProjectStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  read(): RootData {
    return (
      this.context.globalState.get<RootData>(STORAGE_KEY) ?? {
        version: 2,
        children: []
      }
    );
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
    await this.context.globalState.update(STORAGE_KEY, data);
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

    const projectScripts = project.scripts ?? (project.scripts = []);
    const added: ProjectScriptData[] = [];

    for (const script of scripts) {
      if (hasMatchingProjectScript(projectScripts, script)) {
        continue;
      }

      const nextScript: ProjectScriptData =
        script.kind === "package"
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

      projectScripts.push(nextScript);
      added.push(nextScript);
    }

    await this.write(data);
    return added;
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
    const normalizedNew = path.normalize(newBasePath);
    const cloned = deepCloneGroupWithRebase(group, commonBase, normalizedNew, newName);

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

    const extracted = extractNode(data.children, nodeId);
    if (!extracted) {
      throw new Error("Dragged item not found.");
    }

    if (extracted.node.kind === "group" && targetGroupId) {
      const dropTarget = findGroup(data.children, targetGroupId);
      if (!dropTarget) {
        throw new Error("Drop target group not found.");
      }
      if (containsGroup(extracted.node, targetGroupId)) {
        throw new Error("Cannot move a group into itself or one of its children.");
      }
    }

    const targetArray = targetGroupId
      ? findGroup(data.children, targetGroupId)?.children
      : data.children;

    if (!targetArray) {
      throw new Error("Target container not found.");
    }

    const clampedIndex = Math.max(0, Math.min(targetIndex, targetArray.length));
    targetArray.splice(clampedIndex, 0, extracted.node);

    await this.write(data);
  }
}

export function normalizeProjectPath(input: string): string {
  return path.normalize(input);
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
  for (const node of nodes) {
    if (node.kind === "project") {
      if (normalizeProjectPath(node.projectPath) === projectPath) {
        return node;
      }
    } else {
      const nested = findProjectByPath(node.children, projectPath);
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
  const normalized = paths.map((p) => path.normalize(p));
  const segments = normalized.map((p) => p.split(path.sep));
  const first = segments[0];
  // Start at most at the parent of the first path (exclude the leaf segment)
  let commonLength = first.length - 1;

  for (const segs of segments.slice(1)) {
    let i = 0;
    while (i < commonLength && i < segs.length && first[i] === segs[i]) {
      i++;
    }
    commonLength = i;
  }

  return first.slice(0, commonLength).join(path.sep);
}

function rebasePath(projectPath: string, oldBase: string, newBase: string): string {
  const normalized = path.normalize(projectPath);
  const normalizedOld = path.normalize(oldBase);

  const prefix = normalizedOld + path.sep;
  if (normalized.startsWith(prefix)) {
    return path.join(newBase, normalized.slice(prefix.length));
  }
  if (normalized === normalizedOld) {
    return newBase;
  }
  return normalized;
}

function deepCloneGroupWithRebase(group: GroupNodeData, oldBase: string, newBase: string, newName: string): GroupNodeData {
  return {
    kind: "group",
    id: crypto.randomUUID(),
    name: newName,
    children: group.children.map((child) => {
      if (child.kind === "group") {
        return deepCloneGroupWithRebase(child, oldBase, newBase, child.name);
      } else {
        return {
          kind: "project",
          id: crypto.randomUUID(),
          name: child.name,
          projectPath: rebasePath(child.projectPath, oldBase, newBase),
          scripts: child.scripts?.map(cloneProjectScript)
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

function hasMatchingProjectScript(
  existingScripts: ProjectScriptData[],
  nextScript: NewProjectScriptData
): boolean {
  if (nextScript.kind === "package") {
    return existingScripts.some(
      (script) => script.kind === "package" && script.scriptName === nextScript.scriptName
    );
  }

  return existingScripts.some((script) => {
    return script.kind === "custom" && script.command === nextScript.command;
  });
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
      children: normalizeNodes(record.children ?? [], usedIds, projectPaths, `${location}.children`)
    };
  }

  if (record.kind === "project") {
    const projectPath = normalizeProjectPath(
      readNonEmptyString(record.projectPath, `Project path at ${location}`)
    );

    if (projectPaths.has(projectPath)) {
      throw new Error(`Duplicate project path in import file: "${projectPath}".`);
    }

    projectPaths.add(projectPath);

    return {
      kind: "project",
      id: getUniqueId(record.id, usedIds),
      name: readNonEmptyString(record.name, `Project name at ${location}`),
      projectPath,
      scripts: normalizeProjectScripts(record.scripts ?? [], usedIds, `${location}.scripts`)
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