import { GroupNodeData, NodeData } from "./model";

export const SHELFY_TREE_MIME = "application/vnd.code.tree.shelfyView";

export type ProjectRowCommandDefinition = {
  command: "shelfy.openProjectFromRow";
  title: "Open Project";
};

export type MoveDestination = {
  label: string;
  description: string;
  targetGroupId: string | undefined;
  targetIndex: number;
};

export type AdjacentMoveTarget = {
  parentGroupId: string | undefined;
  targetIndex: number;
};

export type AdjacentMoveTargets = {
  up: AdjacentMoveTarget | undefined;
  down: AdjacentMoveTarget | undefined;
};

export function isShelfyTreeEditable(editMode: boolean, hasFilter: boolean): boolean {
  return editMode && !hasFilter;
}

export function getShelfyTreeMimeTypes(editMode: boolean): readonly string[] {
  // VS Code snapshots tree drag/drop MIME types when the controller is
  // registered, so edit-mode toggles recreate the tree view.
  return editMode ? [SHELFY_TREE_MIME] : [];
}

export function getProjectRowCommandDefinition(
  editMode: boolean
): ProjectRowCommandDefinition | undefined {
  if (editMode) {
    return undefined;
  }

  return {
    command: "shelfy.openProjectFromRow",
    title: "Open Project"
  };
}

export function getMoveDestinations(
  nodes: NodeData[],
  sourceNodeId: string
): MoveDestination[] {
  const source = findNodeInfo(nodes, sourceNodeId);
  if (!source) {
    return [];
  }

  const destinations: MoveDestination[] = [];

  if (source.parentGroupId !== undefined) {
    destinations.push({
      label: "Root",
      description: "Top level",
      targetGroupId: undefined,
      targetIndex: nodes.length
    });
  }

  collectGroupDestinations(nodes, source, [], destinations);
  return destinations;
}

export function getAdjacentMoveTargets(
  nodes: NodeData[],
  sourceNodeId: string
): AdjacentMoveTargets {
  const source = findNodeInfo(nodes, sourceNodeId);
  if (!source) {
    return {
      up: undefined,
      down: undefined
    };
  }

  return {
    up:
      source.index > 0
        ? {
            parentGroupId: source.parentGroupId,
            targetIndex: source.index - 1
          }
        : undefined,
    down:
      source.index < source.siblingCount - 1
        ? {
            parentGroupId: source.parentGroupId,
            targetIndex: source.index + 1
          }
        : undefined
  };
}

type NodeInfo = {
  node: NodeData;
  parentGroupId: string | undefined;
  index: number;
  siblingCount: number;
};

function collectGroupDestinations(
  nodes: NodeData[],
  source: NodeInfo,
  parentNames: string[],
  destinations: MoveDestination[]
): void {
  for (const node of nodes) {
    if (node.kind !== "group") {
      continue;
    }

    if (isValidGroupDestination(node, source)) {
      destinations.push({
        label: node.name,
        description: parentNames.length > 0 ? parentNames.join(" / ") : "Top level",
        targetGroupId: node.id,
        targetIndex: node.children.length
      });
    }

    collectGroupDestinations(node.children, source, [...parentNames, node.name], destinations);
  }
}

function isValidGroupDestination(group: GroupNodeData, source: NodeInfo): boolean {
  if (group.id === source.parentGroupId) {
    return false;
  }

  if (source.node.kind === "group" && containsGroupId(source.node, group.id)) {
    return false;
  }

  return true;
}

function containsGroupId(group: GroupNodeData, groupId: string): boolean {
  if (group.id === groupId) {
    return true;
  }

  return group.children.some((child) => child.kind === "group" && containsGroupId(child, groupId));
}

function findNodeInfo(
  nodes: NodeData[],
  sourceNodeId: string,
  parentGroupId: string | undefined = undefined
): NodeInfo | undefined {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === sourceNodeId) {
      return {
        node,
        parentGroupId,
        index,
        siblingCount: nodes.length
      };
    }

    if (node.kind === "group") {
      const nested = findNodeInfo(node.children, sourceNodeId, node.id);
      if (nested) {
        return nested;
      }
    }
  }

  return undefined;
}
