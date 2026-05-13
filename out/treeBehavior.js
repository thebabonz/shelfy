"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_PROJECTS_TREE_MIME = void 0;
exports.getGlobalProjectsTreeMimeTypes = getGlobalProjectsTreeMimeTypes;
exports.getProjectRowCommandDefinition = getProjectRowCommandDefinition;
exports.getMoveDestinations = getMoveDestinations;
exports.GLOBAL_PROJECTS_TREE_MIME = "application/vnd.code.tree.globalProjectsView";
function getGlobalProjectsTreeMimeTypes(editMode) {
    // VS Code snapshots tree drag/drop MIME types when the controller is
    // registered, so edit-mode toggles recreate the tree view.
    return editMode ? [exports.GLOBAL_PROJECTS_TREE_MIME] : [];
}
function getProjectRowCommandDefinition(editMode) {
    if (editMode) {
        return undefined;
    }
    return {
        command: "globalProjects.openProjectFromRow",
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
    for (const node of nodes) {
        if (node.id === sourceNodeId) {
            return {
                node,
                parentGroupId
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