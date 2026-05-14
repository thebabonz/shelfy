import { GroupNodeData, NodeData, ProjectNodeData, ProjectScriptData } from "./model";

export function normalizeTreeFilterText(filterText: string | undefined): string | undefined {
  const normalized = filterText?.trim();
  return normalized ? normalized.toLowerCase() : undefined;
}

export function filterTreeNodes(nodes: NodeData[], filterText: string | undefined): NodeData[] {
  const normalized = normalizeTreeFilterText(filterText);
  if (!normalized) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filtered = filterTreeNode(node, normalized);
    return filtered ? [filtered] : [];
  });
}

function filterTreeNode(node: NodeData, filterText: string): NodeData | undefined {
  if (node.kind === "project") {
    return matchesProject(node, filterText) ? node : undefined;
  }

  if (matchesText(node.name, filterText)) {
    return node;
  }

  const children = filterTreeNodes(node.children, filterText);
  if (children.length === 0) {
    return undefined;
  }

  return {
    ...node,
    children
  };
}

function matchesProject(project: ProjectNodeData, filterText: string): boolean {
  if (matchesText(project.name, filterText) || matchesText(project.projectPath, filterText)) {
    return true;
  }

  return (project.scripts ?? []).some((script) => matchesProjectScript(script, filterText));
}

function matchesProjectScript(script: ProjectScriptData, filterText: string): boolean {
  if (script.kind === "package") {
    return matchesText(script.scriptName, filterText);
  }

  return matchesText(script.name, filterText) || matchesText(script.command, filterText);
}

function matchesText(value: string, filterText: string): boolean {
  return value.toLowerCase().includes(filterText);
}

export function hasActiveTreeFilter(filterText: string | undefined): boolean {
  return normalizeTreeFilterText(filterText) !== undefined;
}

export function groupMatchesTreeFilter(group: GroupNodeData, filterText: string): boolean {
  return matchesText(group.name, filterText);
}