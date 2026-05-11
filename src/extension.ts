import { parse, ParseError } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { NewProjectScriptData, ProjectNodeData, ProjectScriptData } from "./model";
import { PackageScriptOption, readPackageScripts, resolveProjectScriptCommand } from "./projectScripts";
import { ProjectStore } from "./store";
import { GlobalProjectsProvider, GroupItem, ProjectItem, ScriptItem, SortMode } from "./tree";

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

    vscode.commands.registerCommand("globalProjects.exportConfiguration", async () => {
      await exportConfiguration(store);
    }),

    vscode.commands.registerCommand("globalProjects.importConfiguration", async () => {
      await importConfiguration(store, provider);
    }),

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

    vscode.commands.registerCommand("globalProjects.addProjectScript", async (item: ProjectItem) => {
      await addProjectScript(store, provider, item);
    }),

    vscode.commands.registerCommand("globalProjects.removeProjectScript", async (item: ScriptItem) => {
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
    }),

    vscode.commands.registerCommand("globalProjects.runProjectScript", async (item: ScriptItem) => {
      try {
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
  provider: GlobalProjectsProvider
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

async function addProjectScript(
  store: ProjectStore,
  provider: GlobalProjectsProvider,
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

async function getAvailablePackageScripts(project: ProjectNodeData): Promise<PackageScriptOption[]> {
  const configured = new Set(
    (project.scripts ?? [])
      .filter((script): script is Extract<ProjectScriptData, { kind: "package" }> => script.kind === "package")
      .map((script) => script.scriptName)
  );

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

async function promptForCustomScripts(): Promise<NewProjectScriptData[] | undefined> {
  const scripts: NewProjectScriptData[] = [];

  while (true) {
    const name = await vscode.window.showInputBox({
      prompt: "Script label",
      placeHolder: "API dev server"
    });

    if (!name) {
      return scripts.length > 0 ? scripts : undefined;
    }

    const command = await vscode.window.showInputBox({
      prompt: "Command to run in the project folder",
      placeHolder: "npm run dev"
    });

    if (!command) {
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

function getProjectScriptLabel(script: ProjectScriptData): string {
  return script.kind === "package" ? script.scriptName : script.name;
}

function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function cycleSortMode(provider: GlobalProjectsProvider, nextMode: SortMode): Promise<void> {
  await provider.setSortMode(nextMode);
  await vscode.commands.executeCommand("setContext", "globalProjects.sortMode", nextMode);
}