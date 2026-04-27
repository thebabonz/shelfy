import * as crypto from "crypto";
import * as path from "path";
import * as vscode from "vscode";
import { GroupNodeData, NodeData, ProjectNodeData, RootData } from "./model";

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

  async write(data: RootData): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, data);
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
      projectPath: normalized
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
          projectPath: rebasePath(child.projectPath, oldBase, newBase)
        };
      }
    })
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