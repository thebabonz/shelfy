"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GLOBAL_PROJECTS_TREE_MIME = void 0;
exports.getGlobalProjectsTreeMimeTypes = getGlobalProjectsTreeMimeTypes;
exports.getProjectRowCommandDefinition = getProjectRowCommandDefinition;
exports.GLOBAL_PROJECTS_TREE_MIME = "application/vnd.code.tree.globalProjectsView";
function getGlobalProjectsTreeMimeTypes(editMode) {
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
//# sourceMappingURL=treeBehavior.js.map