import * as path from "path";
import * as vscode from "vscode";
import { ProjectStore } from "./store";
import { GlobalProjectsProvider, GroupItem, ProjectItem, SortMode } from "./tree";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await vscode.workspace.fs.createDirectory(context.globalStorageUri);

  const store = new ProjectStore(context);
  const provider = new GlobalProjectsProvider(context, store);
  await provider.initialize();

  await vscode.commands.executeCommand("setContext", "globalProjects.editMode", false);
  await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", provider.getSortMode());
  await setEffectiveClickActionContext();

  const treeView = vscode.window.createTreeView("globalProjectsView", {
    treeDataProvider: provider,
    dragAndDropController: provider,
    showCollapseAll: true
  });

  context.subscriptions.push(treeView);

  context.subscriptions.push(
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
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("globalProjects.clickAction")) {
        await setEffectiveClickActionContext();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("globalProjects.refresh", () => provider.refresh()),

    vscode.commands.registerCommand("globalProjects.addRootGroup", async () => {
      await createGroup(store, provider);
    }),

    vscode.commands.registerCommand("globalProjects.addSubgroup", async (item: GroupItem) => {
      await createGroup(store, provider, item.group.id);
    }),

    vscode.commands.registerCommand("globalProjects.addProject", async (target?: GroupItem) => {
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
          parentGroupId: target?.group.id,
          name,
          projectPath
        });
        provider.refresh();
      } catch (error) {
        await vscode.window.showErrorMessage(asMessage(error));
      }
    }),

    vscode.commands.registerCommand("globalProjects.renameGroup", async (item: GroupItem) => {
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
    }),

    vscode.commands.registerCommand("globalProjects.renameProject", async (item: ProjectItem) => {
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
    }),

    vscode.commands.registerCommand("globalProjects.removeItem", async (item: GroupItem | ProjectItem) => {
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
    }),

    vscode.commands.registerCommand("globalProjects.openProject", async (item: ProjectItem) => {
      await openProjectInCurrentWindow(item);
    }),

    vscode.commands.registerCommand("globalProjects.openProjectInNewWindow", async (item: ProjectItem) => {
      await openProjectInNewWindow(item);
    }),

    vscode.commands.registerCommand("globalProjects.openInExplorer", async (item: ProjectItem) => {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.project.projectPath));
    }),

    vscode.commands.registerCommand("globalProjects.openProjectFromRow", async (item: ProjectItem) => {
      await openProjectFromRow(item);
    }),

    vscode.commands.registerCommand("globalProjects.cloneGroupWithNewBase", async (item: GroupItem) => {
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
    }),

    vscode.commands.registerCommand("globalProjects.enableEditMode", async () => {
      await vscode.commands.executeCommand("setContext", "globalProjects.editMode", true);
      provider.setEditMode(true);
    }),

    vscode.commands.registerCommand("globalProjects.disableEditMode", async () => {
      await vscode.commands.executeCommand("setContext", "globalProjects.editMode", false);
      provider.setEditMode(false);
    }),

    vscode.commands.registerCommand("globalProjects.cycleSortFromNone", async () => {
      await cycleSortMode(provider, "asc");
    }),

    vscode.commands.registerCommand("globalProjects.cycleSortFromAsc", async () => {
      await cycleSortMode(provider, "desc");
    }),

    vscode.commands.registerCommand("globalProjects.cycleSortFromDesc", async () => {
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

  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
    forceNewWindow: action === "openNewInstance"
  });
}

async function openProjectInCurrentWindow(item: ProjectItem): Promise<void> {
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
    forceNewWindow: false
  });
}

async function openProjectInNewWindow(item: ProjectItem): Promise<void> {
  await vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(item.project.projectPath), {
    forceNewWindow: true
  });
}

function getClickAction(): ClickAction {
  const config = vscode.workspace.getConfiguration("globalProjects");
  return config.get<ClickAction>("clickAction", "openSameInstance");
}

async function setEffectiveClickActionContext(): Promise<void> {
  await vscode.commands.executeCommand("setContext", "globalProjects.clickAction", getClickAction());
}

async function createGroup(
  store: ProjectStore,
  provider: GlobalProjectsProvider,
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

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function cycleSortMode(provider: GlobalProjectsProvider, nextMode: SortMode): Promise<void> {
  await provider.setSortMode(nextMode);
  await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", nextMode);
}