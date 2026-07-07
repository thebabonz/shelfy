import { parse, ParseError } from "jsonc-parser";
import * as crypto from "crypto";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { affectsShelfySetting, getShelfySetting, getStorageMode } from "./config";
import {
  NewProjectScriptData,
  NodeData,
  NodePersonalization,
  ProjectNodeData,
  ProjectScriptData,
  RootData
} from "./model";
import {
  formatPersonalizationIcon,
  normalizeNodePersonalization
} from "./personalization";
import { showPersonalizationEditor } from "./personalizationEditor";
import { isColorValue } from "./projectColor";
import { PackageScriptOption, readPackageScripts, resolveProjectScriptCommand } from "./projectScripts";
import { findProjectByPath, normalizeProjectPath, ProjectStore } from "./store";
import { collectProjects, ShelfyProvider, GroupItem, ProjectItem, ScriptItem, SortMode } from "./tree";
import {
  getAdjacentMoveTargets,
  getAdjacentScriptMoveTargets,
  getShelfyTreeMimeTypes,
  getMoveDestinations,
  isShelfyTreeEditable
} from "./treeBehavior";

function registerShelfyCommand<TArgs extends unknown[]>(
  command: `shelfy.${string}`,
  callback: (...args: TArgs) => unknown
): vscode.Disposable[] {
  const legacyCommand = command.replace(/^shelfy\./, "globalProjects.");

  return [
    vscode.commands.registerCommand(command, callback),
    vscode.commands.registerCommand(legacyCommand, (...args) => vscode.commands.executeCommand(command, ...args))
  ];
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);

  const store = new ProjectStore(context);
  await store.initialize();
  const provider = new ShelfyProvider(context, store);
  await provider.initialize();

  await vscode.commands.executeCommand("setContext", "shelfy.editMode", false);
  await vscode.commands.executeCommand("setContext", "shelfy.sortMode", provider.getSortMode());
  await setEffectiveClickActionContext();
  await setFilterContext(provider);

  let editMode = false;
  let treeEditable = false;
  let treeView: vscode.TreeView<GroupItem | ProjectItem | ScriptItem> | undefined;
  let treeViewDisposables: vscode.Disposable[] = [];
  const currentProjectStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  currentProjectStatusBar.name = "Shelfy Current Project";
  currentProjectStatusBar.command = "shelfy.selectProjectInCurrentWindow";

  const updateCurrentProjectStatusBar = (): void => {
    const currentProject = getCurrentWorkspaceProject(store);
    if (!currentProject) {
      currentProjectStatusBar.hide();
      return;
    }

    const iconLabel = formatPersonalizationIcon(currentProject.project.personalization?.icon);
    const locationLabel = getProjectLocationLabel(currentProject.folderPath, currentProject.project.name);

    currentProjectStatusBar.text = iconLabel
      ? `$(folder-library) ${locationLabel} ${iconLabel}`
      : `$(folder-library) ${locationLabel}`;
    currentProjectStatusBar.tooltip = [
      `Current Shelfy project: ${locationLabel}`,
      currentProject.project.projectPath,
      iconLabel ? `Icon: ${iconLabel}` : undefined,
      "Select another saved project to open in this window"
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
    currentProjectStatusBar.show();
  };

  const updateTreeViewState = (): void => {
    if (treeView) {
      treeView.message = provider.getFilterText()
        ? `Filter: ${provider.getFilterText()}`
        : undefined;
    }
  };

  const registerTreeView = (): void => {
    for (const disposable of treeViewDisposables) {
      disposable.dispose();
    }

    const treeViewOptions: vscode.TreeViewOptions<GroupItem | ProjectItem | ScriptItem> = {
      treeDataProvider: provider,
      showCollapseAll: false
    };

    if (getShelfyTreeMimeTypes(treeEditable).length > 0) {
      treeViewOptions.dragAndDropController = provider;
    }

    treeView = vscode.window.createTreeView("shelfyView", treeViewOptions);
    updateTreeViewState();

    treeViewDisposables = [
      treeView,
      treeView.onDidExpandElement(async (event) => {
        if (event.element instanceof GroupItem) {
          await provider.markExpanded(event.element.group.id);
        }
      }),
      treeView.onDidCollapseElement(async (event) => {
        if (event.element instanceof GroupItem) {
          await provider.markCollapsed(event.element.group.id);
        }
      })
    ];
  };

  const applyTreeEditability = async (): Promise<void> => {
    const nextTreeEditable = isShelfyTreeEditable(editMode, provider.hasFilter());
    if (nextTreeEditable === treeEditable) {
      return;
    }

    treeEditable = nextTreeEditable;
    await vscode.commands.executeCommand("setContext", "shelfy.editMode", treeEditable);
    provider.setEditMode(treeEditable);
    registerTreeView();
  };

  const ensureTreeEditable = async (): Promise<boolean> => {
    if (provider.hasFilter()) {
      await vscode.window.showInformationMessage(
        "Clear the active filter before editing the Shelfy list."
      );
      return false;
    }

    return treeEditable;
  };

  const requireTreeEditable = <TArgs extends unknown[]>(
    callback: (...args: TArgs) => Promise<void> | void
  ) => {
    return async (...args: TArgs): Promise<void> => {
      if (!(await ensureTreeEditable())) {
        return;
      }

      await callback(...args);
    };
  };

  const setEditMode = async (enabled: boolean): Promise<void> => {
    if (enabled && provider.hasFilter()) {
      await vscode.window.showInformationMessage(
        "Clear the active filter before entering edit mode."
      );
      return;
    }

    editMode = enabled;
    await applyTreeEditability();
  };

  registerTreeView();
  context.subscriptions.push({
    dispose: () => {
      for (const disposable of treeViewDisposables) {
        disposable.dispose();
      }
    }
  });
  context.subscriptions.push(currentProjectStatusBar);
  context.subscriptions.push(provider.onDidChangeTreeData(() => updateCurrentProjectStatusBar()));
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => updateCurrentProjectStatusBar())
  );
  updateCurrentProjectStatusBar();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (affectsShelfySetting(event, "storageMode")) {
        await handleStorageModeChange(store, provider);
        return;
      }

      if (affectsShelfySetting(event, "clickAction")) {
        await setEffectiveClickActionContext();
      }

      if (affectsShelfySetting(event, "showProjectPath")) {
        provider.refresh();
      }
    })
  );

  context.subscriptions.push(
    ...registerShelfyCommand("shelfy.refresh", () => provider.refresh()),

    ...registerShelfyCommand("shelfy.collapseAll", async () => {
      await vscode.commands.executeCommand("workbench.actions.treeView.shelfyView.collapseAll");
    }),

    ...registerShelfyCommand("shelfy.setFilter", async () => {
      const filterText = await vscode.window.showInputBox({
        title: "Filter Shelfy tree",
        prompt: "Filter folders, projects, paths, and scripts",
        value: provider.getFilterText(),
        placeHolder: "frontend, api, npm run dev"
      });

      if (filterText === undefined) {
        return;
      }

      await provider.setFilterText(filterText);
      if (provider.hasFilter()) {
        editMode = false;
      }
      updateTreeViewState();
      await setFilterContext(provider);
      await applyTreeEditability();
    }),

    ...registerShelfyCommand("shelfy.clearFilter", async () => {
      await provider.setFilterText(undefined);
      updateTreeViewState();
      await setFilterContext(provider);
      await applyTreeEditability();
    }),

    ...registerShelfyCommand("shelfy.exportConfiguration", async () => {
      await exportConfiguration(store);
    }),

    ...registerShelfyCommand("shelfy.importConfiguration", async () => {
      await importConfiguration(store, provider);
    }),

    ...registerShelfyCommand("shelfy.importFromProjectManager", async () => {
      await importFromProjectManager(store, provider);
    }),

    ...registerShelfyCommand("shelfy.openSettings", async () => {
      await vscode.commands.executeCommand("workbench.action.openSettings", `@ext:${context.extension.id}`);
    }),

    ...registerShelfyCommand("shelfy.addRootGroup", requireTreeEditable(async () => {
      await createGroup(store, provider);
    })),

    ...registerShelfyCommand("shelfy.addSubgroup", requireTreeEditable(async (item: GroupItem) => {
      await createGroup(store, provider, item.group.id);
    })),

    ...registerShelfyCommand(
      "shelfy.addProject",
      requireTreeEditable(async (target?: GroupItem | ProjectItem | ScriptItem) => {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Add Project Folder"
        });

        if (!picked?.length) {
          return;
        }

        const projectPath = picked[0].fsPath;
        const defaultName = path.basename(projectPath);

        const name = await vscode.window.showInputBox({
          prompt: "Project display name",
          value: defaultName
        });

        if (!name) {
          return;
        }

        try {
          await store.addProject({
            parentGroupId: getAddProjectParentGroupId(store, target),
            name,
            projectPath
          });
          provider.refresh();
        } catch (error) {
          await vscode.window.showErrorMessage(asMessage(error));
        }
      })
    ),

    ...registerShelfyCommand("shelfy.renameGroup", requireTreeEditable(async (item: GroupItem) => {
      const name = await vscode.window.showInputBox({
        prompt: "New folder name",
        value: item.group.name
      });

      if (!name) {
        return;
      }

      try {
        await store.renameGroup(item.group.id, name);
        provider.refresh();
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    })),

    ...registerShelfyCommand("shelfy.renameProject", requireTreeEditable(async (item: ProjectItem) => {
      const name = await vscode.window.showInputBox({
        prompt: "New project name",
        value: item.project.name
      });

      if (!name) {
        return;
      }

      try {
        await store.renameProject(item.project.id, name);
        provider.refresh();
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    })),

    ...registerShelfyCommand("shelfy.changeProjectPath", requireTreeEditable(async (item?: ProjectItem) => {
      await changeProjectPath(store, provider, item);
    })),

    ...registerShelfyCommand(
      "shelfy.editItemPersonalization",
      requireTreeEditable(async (item?: GroupItem | ProjectItem) => {
        await editItemPersonalization(store, provider, item);
      })
    ),

    ...registerShelfyCommand(
      "shelfy.revertItemPersonalization",
      requireTreeEditable(async (item?: GroupItem | ProjectItem) => {
        await revertItemPersonalization(store, provider, item);
      })
    ),

    ...registerShelfyCommand("shelfy.addProjectScript", requireTreeEditable(async (item: ProjectItem) => {
      await addProjectScript(store, provider, item);
    })),

    ...registerShelfyCommand("shelfy.editProjectScript", requireTreeEditable(async (item: ScriptItem) => {
      await editProjectScript(store, provider, item);
    })),

    ...registerShelfyCommand("shelfy.removeProjectScript", requireTreeEditable(async (item: ScriptItem) => {
      const label = getProjectScriptLabel(item.script);
      const answer = await vscode.window.showWarningMessage(
        `Remove script "${label}"?`,
        { modal: true },
        "Remove"
      );

      if (answer !== "Remove") {
        return;
      }

      try {
        await store.removeProjectScript(item.project.id, item.script.id);
        provider.refresh();
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    })),

    ...registerShelfyCommand("shelfy.runProjectScript", async (item: ScriptItem) => {
      try {
        if (!(await ensureProjectPathExists(item.project))) {
          return;
        }

        const command = await resolveProjectScriptCommand(item.project.projectPath, item.script);
        const terminal = vscode.window.createTerminal({
          name: `${item.project.name}: ${getProjectScriptLabel(item.script)}`,
          cwd: item.project.projectPath
        });

        terminal.show();
        terminal.sendText(command, true);
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    }),

    ...registerShelfyCommand("shelfy.removeItem", requireTreeEditable(async (item: GroupItem | ProjectItem) => {
      const label = item instanceof GroupItem ? item.group.name : item.project.name;
      const answer = await vscode.window.showWarningMessage(
        `Remove "${label}"?`,
        { modal: true },
        "Remove"
      );

      if (answer !== "Remove") {
        return;
      }

      try {
        await store.removeNode(item instanceof GroupItem ? item.group.id : item.project.id);
        provider.refresh();
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    })),

    ...registerShelfyCommand("shelfy.moveItemToFolder", requireTreeEditable(async (item?: GroupItem | ProjectItem) => {
      await moveItemToFolder(store, provider, item);
    })),

    ...registerShelfyCommand("shelfy.moveItemUp", requireTreeEditable(async (item?: GroupItem | ProjectItem | ScriptItem) => {
      await moveItemAdjacent(store, provider, item, "up");
    })),

    ...registerShelfyCommand("shelfy.moveItemDown", requireTreeEditable(async (item?: GroupItem | ProjectItem | ScriptItem) => {
      await moveItemAdjacent(store, provider, item, "down");
    })),

    ...registerShelfyCommand("shelfy.openProject", async (item: ProjectItem) => {
      await openProjectInCurrentWindow(item);
    }),

    ...registerShelfyCommand("shelfy.selectProjectInCurrentWindow", async () => {
      const picked = await pickSavedProjectInCurrentWindow(store);
      if (!picked) {
        return;
      }

      await openProjectInCurrentWindowByProject(picked);
    }),

    ...registerShelfyCommand("shelfy.openProjectInNewWindow", async (item: ProjectItem) => {
      await openProjectInNewWindow(item);
    }),

    ...registerShelfyCommand("shelfy.openInExplorer", async (item: ProjectItem | GroupItem) => {
      if (item instanceof ProjectItem) {
        if (!(await ensureProjectPathExists(item.project))) {
          return;
        }
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.project.projectPath));
      } else {
        const projects = collectProjects(item.group.children);
        const firstExisting = await findFirstExistingProject(projects);
        if (!firstExisting) {
          await vscode.window.showInformationMessage("No reachable project folders found in this group.");
          return;
        }
        await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(firstExisting.projectPath));
      }
    }),

    ...registerShelfyCommand("shelfy.revealInVSCodeExplorer", async (item: GroupItem) => {
      const projects = collectProjects(item.group.children);
      if (projects.length === 0) {
        await vscode.window.showInformationMessage("This group contains no projects.");
        return;
      }

      const existing = await filterExistingProjects(projects);
      if (existing.length === 0) {
        await vscode.window.showInformationMessage("No reachable project folders found in this group.");
        return;
      }

      const currentFsPaths = new Set(
        (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath)
      );
      const toAdd = existing
        .filter((p) => !currentFsPaths.has(p.projectPath))
        .map((p) => ({ uri: vscode.Uri.file(p.projectPath) }));

      if (toAdd.length > 0) {
        vscode.workspace.updateWorkspaceFolders(
          vscode.workspace.workspaceFolders?.length ?? 0,
          0,
          ...toAdd
        );
      }

      await vscode.commands.executeCommand("workbench.view.explorer");
    }),

    ...registerShelfyCommand("shelfy.openProjectFromRow", async (item: ProjectItem) => {
      await openProjectFromRow(item);
    }),

    ...registerShelfyCommand("shelfy.cloneGroupWithNewBase", requireTreeEditable(async (item: GroupItem) => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select New Base Folder"
      });

      if (!picked?.length) {
        return;
      }

      const newBasePath = picked[0].fsPath;

      const newName = await vscode.window.showInputBox({
        prompt: "Name for the cloned group",
        value: item.group.name
      });

      if (!newName) {
        return;
      }

      try {
        const { commonBase } = await store.cloneGroupWithNewBase(item.group.id, newName, newBasePath);
        provider.refresh();
        await vscode.window.showInformationMessage(
          `Group cloned. Paths rebased from "${commonBase}" to "${newBasePath}".`
        );
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    })),

    ...registerShelfyCommand("shelfy.enableEditMode", async () => {
      await setEditMode(true);
    }),

    ...registerShelfyCommand("shelfy.disableEditMode", async () => {
      await setEditMode(false);
    }),

    ...registerShelfyCommand("shelfy.cycleSortFromNone", async () => {
      await cycleSortMode(provider, "asc");
    }),

    ...registerShelfyCommand("shelfy.cycleSortFromAsc", async () => {
      await cycleSortMode(provider, "desc");
    }),

    ...registerShelfyCommand("shelfy.cycleSortFromDesc", async () => {
      await cycleSortMode(provider, "none");
    })
  );
}

export function deactivate(): void {}

type ClickAction = "noAction" | "openSameInstance" | "openNewInstance";

async function openProjectFromRow(item: ProjectItem): Promise<void> {
  const action = getClickAction();

  if (action === "noAction") {
    return;
  }

  const confirmOnClick = getShelfySetting<boolean>("confirmOnClick", false);
  if (confirmOnClick) {
    const projectName = item.project.name;
    const actionLabel =
      action === "openNewInstance"
        ? `Open '${projectName}' in a new window?`
        : `Open '${projectName}' in this window?`;
    const confirmed = await vscode.window.showInformationMessage(actionLabel, { modal: true }, "Open");
    if (confirmed !== "Open") {
      return;
    }
  }

  await openProject(item.project, action === "openNewInstance");
}

async function openProjectInCurrentWindow(item: ProjectItem): Promise<void> {
  await openProjectInCurrentWindowByProject(item.project);
}

async function openProjectInNewWindow(item: ProjectItem): Promise<void> {
  await openProject(item.project, true);
}

async function openProjectInCurrentWindowByProject(project: ProjectNodeData): Promise<void> {
  await openProject(project, false);
}

async function openProject(project: ProjectNodeData, forceNewWindow: boolean): Promise<void> {
  if (!(await ensureProjectPathExists(project))) {
    return;
  }

  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(project.projectPath), {
    forceNewWindow
  });
}

function getClickAction(): ClickAction {
  return getShelfySetting<ClickAction>("clickAction", "openSameInstance");
}

async function pickSavedProjectInCurrentWindow(
  store: ProjectStore
): Promise<ProjectNodeData | undefined> {
  const nodes = store.read().children;
  const projects = collectProjects(nodes);

  if (projects.length === 0) {
    await vscode.window.showInformationMessage("No saved Shelfy projects are available to open.");
    return undefined;
  }

  const currentProjectPath = getCurrentWorkspaceProject(store)?.project.projectPath;
  const picked = await vscode.window.showQuickPick(
    projects.map((project) => {
      const folderPath = getProjectFolderPath(nodes, project.id);
      const iconLabel = formatPersonalizationIcon(project.personalization?.icon);
      const detailParts = [project.projectPath, iconLabel];

      if (currentProjectPath && normalizeProjectPath(project.projectPath) === normalizeProjectPath(currentProjectPath)) {
        detailParts.push("Current window");
      }

      return {
        label: project.name,
        description: folderPath ?? "Root",
        detail: detailParts.join(" • "),
        project
      };
    }),
    {
      title: "Open Saved Project in Current Window",
      placeHolder: "Type to filter saved projects",
      matchOnDescription: true,
      matchOnDetail: true
    }
  );

  return picked?.project;
}

function getItemLabel(item: GroupItem | ProjectItem): string {
  return item instanceof GroupItem ? item.group.name : item.project.name;
}

function getItemNodeId(item: GroupItem | ProjectItem): string {
  return item instanceof GroupItem ? item.group.id : item.project.id;
}

function getItemPersonalization(item: GroupItem | ProjectItem): NodePersonalization | undefined {
  return item instanceof GroupItem ? item.group.personalization : item.project.personalization;
}

async function setEffectiveClickActionContext(): Promise<void> {
  await vscode.commands.executeCommand("setContext", "shelfy.clickAction", getClickAction());
}

async function setFilterContext(provider: ShelfyProvider): Promise<void> {
  await vscode.commands.executeCommand("setContext", "shelfy.hasFilter", provider.hasFilter());
}

function getCurrentWorkspaceProject(
  store: ProjectStore
): { project: ProjectNodeData; folderPath: string | undefined } | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }

  const nodes = store.read().children;
  const project = findProjectByPath(nodes, normalizeProjectPath(workspaceFolder.uri.fsPath));
  if (!project) {
    return undefined;
  }

  return {
    project,
    folderPath: getProjectFolderPath(nodes, project.id)
  };
}

function getProjectFolderPath(
  nodes: NodeData[],
  projectId: string,
  groupNames: string[] = []
): string | undefined {
  for (const node of nodes) {
    if (node.kind === "project") {
      if (node.id === projectId) {
        return groupNames.length > 0 ? groupNames.join(" / ") : undefined;
      }
      continue;
    }

    const nested = getProjectFolderPath(node.children, projectId, [...groupNames, node.name]);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function getProjectLocationLabel(folderPath: string | undefined, projectName: string): string {
  return folderPath ? `${folderPath} / ${projectName}` : `Root / ${projectName}`;
}

async function createGroup(
  store: ProjectStore,
  provider: ShelfyProvider,
  parentGroupId?: string
): Promise<void> {
  const name = await vscode.window.showInputBox({
    prompt: parentGroupId ? "Subgroup name" : "Group name"
  });

  if (!name) {
    return;
  }

  try {
    await store.addGroup(name, parentGroupId);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function editItemPersonalization(
  store: ProjectStore,
  provider: ShelfyProvider,
  item?: GroupItem | ProjectItem
): Promise<void> {
  if (!(item instanceof GroupItem) && !(item instanceof ProjectItem)) {
    await vscode.window.showInformationMessage(
      "Use Edit Personalization from a Shelfy project or folder."
    );
    return;
  }

  const current = getItemPersonalization(item);
  const label = getItemLabel(item);
  const projectConfigColor =
    item instanceof ProjectItem
      ? await provider.getProjectConfigurationColor(item.project.projectPath)
      : undefined;

  const next = await showPersonalizationEditor({
    label,
    kind: item instanceof GroupItem ? "group" : "project",
    personalization: current,
    projectConfigColor
  });

  if (!next) {
    return;
  }

  await saveItemPersonalization(store, provider, item, next);
}

async function revertItemPersonalization(
  store: ProjectStore,
  provider: ShelfyProvider,
  item?: GroupItem | ProjectItem
): Promise<void> {
  if (!(item instanceof GroupItem) && !(item instanceof ProjectItem)) {
    await vscode.window.showInformationMessage(
      "Use Revert Personalization from a Shelfy project or folder."
    );
    return;
  }

  try {
    await store.setNodePersonalization(getItemNodeId(item), undefined);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function saveItemPersonalization(
  store: ProjectStore,
  provider: ShelfyProvider,
  item: GroupItem | ProjectItem,
  update: { color?: string | null; icon?: string | null }
): Promise<void> {
  const current = getItemPersonalization(item);
  const personalization = normalizeNodePersonalization({
    color:
      update.color === undefined
        ? current?.color
        : update.color === null
          ? undefined
          : update.color,
    icon:
      update.icon === undefined
        ? current?.icon
        : update.icon === null
          ? undefined
          : update.icon
  });

  try {
    await store.setNodePersonalization(getItemNodeId(item), personalization);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function changeProjectPath(
  store: ProjectStore,
  provider: ShelfyProvider,
  item?: ProjectItem
): Promise<void> {
  if (!(item instanceof ProjectItem)) {
    await vscode.window.showInformationMessage("Use Change Project Folder from a Shelfy project.");
    return;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(item.project.projectPath),
    openLabel: "Select Project Folder"
  });

  if (!picked?.length) {
    return;
  }

  try {
    await store.updateProjectPath(item.project.id, picked[0].fsPath);
    provider.refresh();
    await vscode.window.showInformationMessage(`Project folder updated for "${item.project.name}".`);
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function moveItemToFolder(
  store: ProjectStore,
  provider: ShelfyProvider,
  item?: GroupItem | ProjectItem
): Promise<void> {
  if (!(item instanceof GroupItem) && !(item instanceof ProjectItem)) {
    await vscode.window.showInformationMessage("Use Move to Folder from a Shelfy project or folder.");
    return;
  }

  const nodeId = item instanceof GroupItem ? item.group.id : item.project.id;
  const label = item instanceof GroupItem ? item.group.name : item.project.name;
  const destinations = getMoveDestinations(store.read().children, nodeId);

  if (destinations.length === 0) {
    await vscode.window.showInformationMessage(`No available destination folders for "${label}".`);
    return;
  }

  const picked = await vscode.window.showQuickPick(
    destinations.map((destination) => ({
      ...destination
    })),
    {
      title: "Move to Folder",
      placeHolder: `Choose a destination for "${label}"`
    }
  );

  if (!picked) {
    return;
  }

  try {
    await store.moveNode(nodeId, picked.targetGroupId, picked.targetIndex);

    if (picked.targetGroupId) {
      await provider.markExpanded(picked.targetGroupId);
    }

    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function moveItemAdjacent(
  store: ProjectStore,
  provider: ShelfyProvider,
  item: GroupItem | ProjectItem | ScriptItem | undefined,
  direction: "up" | "down"
): Promise<void> {
  if (item instanceof ScriptItem) {
    await moveProjectScriptAdjacent(store, provider, item, direction);
    return;
  }

  if (!(item instanceof GroupItem) && !(item instanceof ProjectItem)) {
    await vscode.window.showInformationMessage(
      "Use Move Up or Move Down from a Shelfy project, folder, or script."
    );
    return;
  }

  const nodeId = item instanceof GroupItem ? item.group.id : item.project.id;
  const target = getAdjacentMoveTargets(store.read().children, nodeId)[direction];
  if (!target) {
    return;
  }

  try {
    await store.moveNode(nodeId, target.parentGroupId, target.targetIndex);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function moveProjectScriptAdjacent(
  store: ProjectStore,
  provider: ShelfyProvider,
  item: ScriptItem,
  direction: "up" | "down"
): Promise<void> {
  const target = getAdjacentScriptMoveTargets(item.project.scripts, item.script.id)[direction];
  if (!target) {
    return;
  }

  try {
    await store.moveProjectScript(item.project.id, item.script.id, target.targetIndex);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function exportConfiguration(store: ProjectStore): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(os.homedir(), "shelfy.json")),
    filters: {
      JSON: ["json"]
    },
    saveLabel: "Export Configuration"
  });

  if (!target) {
    return;
  }

  const content = JSON.stringify(store.exportData(), null, 2);
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
  await vscode.window.showInformationMessage(`Configuration exported to "${target.fsPath}".`);
}

async function importConfiguration(
  store: ProjectStore,
  provider: ShelfyProvider
): Promise<void> {
  const target = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      JSON: ["json"]
    },
    openLabel: "Import Configuration"
  });

  if (!target?.length) {
    return;
  }

  const hasExistingItems = store.read().children.length > 0;
  if (hasExistingItems) {
    const answer = await vscode.window.showWarningMessage(
      "Importing will replace the current folders, projects, and scripts configuration.",
      { modal: true },
      "Import"
    );

    if (answer !== "Import") {
      return;
    }
  }

  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(target[0])).toString("utf8");
    const parseErrors: ParseError[] = [];
    const parsed = parse(raw, parseErrors);

    if (parseErrors.length > 0) {
      throw new Error("The selected file is not valid JSON.");
    }

    await store.importData(parsed);
    provider.refresh();
    await vscode.window.showInformationMessage(`Configuration imported from "${target[0].fsPath}".`);
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

type ProjectManagerEntry = {
  name: string;
  rootPath: string;
  tags: string[];
  enabled: boolean;
};

async function importFromProjectManager(
  store: ProjectStore,
  provider: ShelfyProvider
): Promise<void> {
  const target = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: {
      JSON: ["json"]
    },
    openLabel: "Import from Project Manager"
  });

  if (!target?.length) {
    return;
  }

  const hasExistingItems = store.read().children.length > 0;
  if (hasExistingItems) {
    const answer = await vscode.window.showWarningMessage(
      "Importing will replace the current folders, projects, and scripts configuration.",
      { modal: true },
      "Import"
    );

    if (answer !== "Import") {
      return;
    }
  }

  try {
    const raw = Buffer.from(await vscode.workspace.fs.readFile(target[0])).toString("utf8");
    const parseErrors: ParseError[] = [];
    const parsed = parse(raw, parseErrors);

    if (parseErrors.length > 0) {
      throw new Error("The selected file is not valid JSON.");
    }

    if (!Array.isArray(parsed)) {
      throw new Error("The selected file does not contain a valid Project Manager configuration.");
    }

    const entries = parsed as ProjectManagerEntry[];
    const rootData = convertProjectManagerData(entries);

    await store.write(rootData);
    provider.refresh();
    await vscode.window.showInformationMessage(
      `Project Manager configuration imported from "${target[0].fsPath}".`
    );
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

function convertProjectManagerData(entries: ProjectManagerEntry[]): RootData {
  const tagMap = new Map<string, ProjectNodeData[]>();

  for (const entry of entries) {
    const project: ProjectNodeData = {
      kind: "project",
      id: crypto.randomUUID(),
      name: entry.name,
      projectPath: normalizeProjectPath(entry.rootPath),
      scripts: []
    };

    if (!entry.tags || entry.tags.length === 0) {
      tagMap.set("", [...(tagMap.get("") ?? []), project]);
    } else {
      for (const tag of entry.tags) {
        tagMap.set(tag, [...(tagMap.get(tag) ?? []), { ...project, id: crypto.randomUUID() }]);
      }
    }
  }

  const children: NodeData[] = [];

  for (const [tag, projects] of tagMap) {
    if (tag === "") {
      children.push(...projects);
    } else {
      children.push({
        kind: "group",
        id: crypto.randomUUID(),
        name: tag,
        children: projects
      });
    }
  }

  return { version: 2, children };
}

async function addProjectScript(
  store: ProjectStore,
  provider: ShelfyProvider,
  item: ProjectItem
): Promise<void> {
  const packageScripts = await getAvailablePackageScripts(item.project);
  const source = await pickScriptSource(packageScripts.length > 0);

  if (!source) {
    return;
  }

  const scriptsToAdd =
    source === "package"
      ? await pickPackageScripts(packageScripts)
      : await promptForCustomScripts();

  if (!scriptsToAdd?.length) {
    return;
  }

  try {
    const added = await store.addProjectScripts(item.project.id, scriptsToAdd);
    provider.refresh();

    if (added.length === 0) {
      await vscode.window.showInformationMessage("Those scripts are already configured for this project.");
    }
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function editProjectScript(
  store: ProjectStore,
  provider: ShelfyProvider,
  item: ScriptItem
): Promise<void> {
  const nextScript = await promptForProjectScriptUpdate(item.project, item.script);

  if (!nextScript) {
    return;
  }

  try {
    await store.updateProjectScript(item.project.id, item.script.id, nextScript);
    provider.refresh();
  } catch (error) {
    await vscode.window.showErrorMessage(asMessage(error));
  }
}

async function promptForProjectScriptUpdate(
  project: ProjectNodeData,
  script: ProjectScriptData
): Promise<NewProjectScriptData | undefined> {
  if (script.kind === "package") {
    return promptForPackageScriptUpdate(project, script.scriptName);
  }

  return promptForCustomScriptUpdate(script.name, script.command);
}

async function getAvailablePackageScripts(
  project: ProjectNodeData,
  includedScriptName?: string
): Promise<PackageScriptOption[]> {
  const configured = new Set(
    (project.scripts ?? [])
      .filter((script): script is Extract<ProjectScriptData, { kind: "package" }> => script.kind === "package")
      .map((script) => script.scriptName)
  );

  if (includedScriptName) {
    configured.delete(includedScriptName);
  }

  try {
    const packageScripts = await readPackageScripts(project.projectPath);
    return packageScripts.filter((script) => !configured.has(script.name));
  } catch {
    return [];
  }
}

async function pickScriptSource(
  hasPackageScripts: boolean
): Promise<"package" | "custom" | undefined> {
  if (!hasPackageScripts) {
    return "custom";
  }

  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "Select from package.json",
        description: "Add one or more scripts defined in the project package.json",
        value: "package" as const
      },
      {
        label: "Enter custom command",
        description: "Add your own terminal command to run in the project folder",
        value: "custom" as const
      }
    ],
    {
      title: "Add Project Script",
      placeHolder: "Choose the source for the script you want to add"
    }
  );

  return picked?.value;
}

async function promptForPackageScriptUpdate(
  project: ProjectNodeData,
  currentScriptName: string
): Promise<NewProjectScriptData | undefined> {
  const packageScripts = await getAvailablePackageScripts(project, currentScriptName);

  if (packageScripts.length === 0) {
    await vscode.window.showInformationMessage("No package.json scripts are available to select.");
    return undefined;
  }

  const picked = await vscode.window.showQuickPick(
    packageScripts.map((script) => ({
      label: script.name,
      description: script.command,
      detail: script.name === currentScriptName ? "Current selection" : undefined
    })),
    {
      title: "Edit package.json script",
      placeHolder: `Select the script to store for "${project.name}"`
    }
  );

  if (!picked) {
    return undefined;
  }

  return {
    kind: "package",
    scriptName: picked.label
  };
}

async function pickPackageScripts(
  packageScripts: PackageScriptOption[]
): Promise<NewProjectScriptData[] | undefined> {
  if (packageScripts.length === 0) {
    await vscode.window.showInformationMessage("No new package.json scripts are available to add.");
    return [];
  }

  const picked = await vscode.window.showQuickPick(
    packageScripts.map((script) => ({
      label: script.name,
      description: script.command
    })),
    {
      canPickMany: true,
      title: "Add package.json scripts",
      placeHolder: "Select one or more scripts to add"
    }
  );

  if (!picked?.length) {
    return undefined;
  }

  return picked.map((script) => ({
    kind: "package",
    scriptName: script.label
  }));
}

async function promptForCustomScriptUpdate(
  currentName: string,
  currentCommand: string
): Promise<NewProjectScriptData | undefined> {
  const name = await promptForRequiredInput({
    prompt: "Script label",
    placeHolder: "API dev server",
    value: currentName
  });

  if (name === undefined) {
    return undefined;
  }

  const command = await promptForRequiredInput({
    prompt: "Command to run in the project folder",
    placeHolder: "npm run dev",
    value: currentCommand
  });

  if (command === undefined) {
    return undefined;
  }

  return {
    kind: "custom",
    name,
    command
  };
}

async function promptForCustomScripts(): Promise<NewProjectScriptData[] | undefined> {
  const scripts: NewProjectScriptData[] = [];

  while (true) {
    const name = await promptForRequiredInput({
      prompt: "Script label",
      placeHolder: "API dev server"
    });

    if (name === undefined) {
      return scripts.length > 0 ? scripts : undefined;
    }

    const command = await promptForRequiredInput({
      prompt: "Command to run in the project folder",
      placeHolder: "npm run dev"
    });

    if (command === undefined) {
      return scripts.length > 0 ? scripts : undefined;
    }

    scripts.push({
      kind: "custom",
      name,
      command
    });

    const next = await vscode.window.showQuickPick(
      [
        { label: "Done", value: "done" as const },
        { label: "Add another custom script", value: "add" as const }
      ],
      {
        title: "Custom script added",
        placeHolder: "Choose whether to keep adding custom scripts"
      }
    );

    if (next?.value !== "add") {
      return scripts;
    }
  }
}

type RequiredInputOptions = {
  prompt: string;
  placeHolder: string;
  value?: string;
};

async function promptForRequiredInput(options: RequiredInputOptions): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt: options.prompt,
    placeHolder: options.placeHolder,
    value: options.value,
    validateInput: (input) => (input.trim().length > 0 ? undefined : "A value is required.")
  });

  return value === undefined ? undefined : value.trim();
}

function getAddProjectParentGroupId(
  store: ProjectStore,
  target?: GroupItem | ProjectItem | ScriptItem
): string | undefined {
  if (target instanceof GroupItem) {
    return target.group.id;
  }

  if (target instanceof ProjectItem || target instanceof ScriptItem) {
    return store.getParentGroupId(target.project.id);
  }

  return undefined;
}

function getProjectScriptLabel(script: ProjectScriptData): string {
  return script.kind === "package" ? script.scriptName : script.name;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function ensureProjectPathExists(project: ProjectNodeData): Promise<boolean> {
  try {
    const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
    if (stat.type & vscode.FileType.Directory) {
      return true;
    }
  } catch {
    // Fall through to the user-facing message below.
  }

  await vscode.window.showErrorMessage(
    `Project folder not found for "${project.name}": ${project.projectPath}`
  );
  return false;
}

async function findFirstExistingProject(
  projects: ProjectNodeData[]
): Promise<ProjectNodeData | undefined> {
  for (const project of projects) {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
      if (stat.type & vscode.FileType.Directory) {
        return project;
      }
    } catch {
      // Skip missing paths.
    }
  }
  return undefined;
}

async function filterExistingProjects(projects: ProjectNodeData[]): Promise<ProjectNodeData[]> {
  const results: ProjectNodeData[] = [];
  for (const project of projects) {
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(project.projectPath));
      if (stat.type & vscode.FileType.Directory) {
        results.push(project);
      }
    } catch {
      // Skip missing paths.
    }
  }
  return results;
}

async function cycleSortMode(provider: ShelfyProvider, nextMode: SortMode): Promise<void> {
  await provider.setSortMode(nextMode);
  await vscode.commands.executeCommand("setContext", "shelfy.sortMode", nextMode);
}

async function handleStorageModeChange(store: ProjectStore, provider: ShelfyProvider): Promise<void> {
  try {
    await store.migrateStorageIfNeeded();
    provider.refresh();
    await vscode.window.showInformationMessage(
      `Shelfy storage migrated to ${getStorageMode()} mode. Reload the extension to complete the migration.`
    );
  } catch (error) {
    await vscode.window.showErrorMessage(`Failed to migrate storage: ${asMessage(error)}`);
  }
}
