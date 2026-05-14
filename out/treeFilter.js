"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTreeFilterText = normalizeTreeFilterText;
exports.filterTreeNodes = filterTreeNodes;
exports.hasActiveTreeFilter = hasActiveTreeFilter;
exports.groupMatchesTreeFilter = groupMatchesTreeFilter;
function normalizeTreeFilterText(filterText) {
    const normalized = filterText?.trim();
    return normalized ? normalized.toLowerCase() : undefined;
}
function filterTreeNodes(nodes, filterText) {
    const normalized = normalizeTreeFilterText(filterText);
    if (!normalized) {
        return nodes;
    }
    return nodes.flatMap((node) => {
        const filtered = filterTreeNode(node, normalized);
        return filtered ? [filtered] : [];
    });
}
function filterTreeNode(node, filterText) {
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
function matchesProject(project, filterText) {
    if (matchesText(project.name, filterText) || matchesText(project.projectPath, filterText)) {
        return true;
    }
    return (project.scripts ?? []).some((script) => matchesProjectScript(script, filterText));
}
function matchesProjectScript(script, filterText) {
    if (script.kind === "package") {
        return matchesText(script.scriptName, filterText);
    }
    return matchesText(script.name, filterText) || matchesText(script.command, filterText);
}
function matchesText(value, filterText) {
    return value.toLowerCase().includes(filterText);
}
function hasActiveTreeFilter(filterText) {
    return normalizeTreeFilterText(filterText) !== undefined;
}
function groupMatchesTreeFilter(group, filterText) {
    return matchesText(group.name, filterText);
}
//# sourceMappingURL=treeFilter.js.map