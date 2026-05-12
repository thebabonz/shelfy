export const GLOBAL_PROJECTS_TREE_MIME = "application/vnd.code.tree.globalProjectsView";

export type ProjectRowCommandDefinition = {
  command: "globalProjects.openProjectFromRow";
  title: "Open Project";
};

export function getGlobalProjectsTreeMimeTypes(editMode: boolean): readonly string[] {
  return editMode ? [GLOBAL_PROJECTS_TREE_MIME] : [];
}

export function getProjectRowCommandDefinition(
  editMode: boolean
): ProjectRowCommandDefinition | undefined {
  if (editMode) {
    return undefined;
  }

  return {
    command: "globalProjects.openProjectFromRow",
    title: "Open Project"
  };
}