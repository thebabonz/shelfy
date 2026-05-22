"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHELFY_TREE_MIME = void 0;
exports.isShelfyTreeEditable = isShelfyTreeEditable;
exports.getShelfyTreeMimeTypes = getShelfyTreeMimeTypes;
exports.getProjectRowCommandDefinition = getProjectRowCommandDefinition;
exports.getMoveDestinations = getMoveDestinations;
exports.getAdjacentMoveTargets = getAdjacentMoveTargets;
exports.getAdjacentScriptMoveTargets = getAdjacentScriptMoveTargets;
exports.SHELFY_TREE_MIME = "application/vnd.code.tree.shelfyView";
function isShelfyTreeEditable(editMode, hasFilter) {
    return editMode && !hasFilter;
}
function getShelfyTreeMimeTypes(editMode) {
    // VS Code snapshots tree drag/drop MIME types when the controller is
    // registered, so edit-mode toggles recreate the tree view.
    return editMode ? [exports.SHELFY_TREE_MIME] : [];
}
function getProjectRowCommandDefinition(editMode) {
    if (editMode) {
        return undefined;
    }
    return {
        command: "shelfy.openProjectFromRow",
        title: "Open Project"
    };
}
function getMoveDestinations(nodes, sourceNodeId) {
    const source = findNodeInfo(nodes, sourceNodeId);
    if (!source) {
        return [];
    }
    const destinations = [];
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
function getAdjacentMoveTargets(nodes, sourceNodeId) {
    const source = findNodeInfo(nodes, sourceNodeId);
    if (!source) {
        return {
            up: undefined,
            down: undefined
        };
    }
    return {
        up: source.index > 0
            ? {
                parentGroupId: source.parentGroupId,
                targetIndex: source.index - 1
            }
            : undefined,
        down: source.index < source.siblingCount - 1
            ? {
                parentGroupId: source.parentGroupId,
                targetIndex: source.index + 1
            }
            : undefined
    };
}
function getAdjacentScriptMoveTargets(scripts, sourceScriptId) {
    const sourceIndex = scripts?.findIndex((script) => script.id === sourceScriptId) ?? -1;
    const siblingCount = scripts?.length ?? 0;
    if (sourceIndex < 0) {
        return {
            up: undefined,
            down: undefined
        };
    }
    return {
        up: sourceIndex > 0
            ? {
                parentGroupId: undefined,
                targetIndex: sourceIndex - 1
            }
            : undefined,
        down: sourceIndex < siblingCount - 1
            ? {
                parentGroupId: undefined,
                targetIndex: sourceIndex + 1
            }
            : undefined
    };
}
function collectGroupDestinations(nodes, source, parentNames, destinations) {
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
function isValidGroupDestination(group, source) {
    if (group.id === source.parentGroupId) {
        return false;
    }
    if (source.node.kind === "group" && containsGroupId(source.node, group.id)) {
        return false;
    }
    return true;
}
function containsGroupId(group, groupId) {
    if (group.id === groupId) {
        return true;
    }
    return group.children.some((child) => child.kind === "group" && containsGroupId(child, groupId));
}
function findNodeInfo(nodes, sourceNodeId, parentGroupId = undefined) {
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
//# sourceMappingURL=treeBehavior.js.map