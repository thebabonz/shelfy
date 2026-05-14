import { parse, ParseError } from "jsonc-parser";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { affectsShelfySetting, getShelfySetting } from "./config";
import { NewProjectScriptData, ProjectNodeData, ProjectScriptData } from "./model";
import { PackageScriptOption, readPackageScripts, resolveProjectScriptCommand } from "./projectScripts";
import { ProjectStore } from "./store";
import { ShelfyProvider, GroupItem, ProjectItem, ScriptItem, SortMode } from "./tree";
import { getShelfyTreeMimeTypes, getMoveDestinations } from "./treeBehavior";

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
  const provider = new ShelfyProvider(context, store);
  await provider.initialize();

  await vscode.commands.executeCommand("setContext", "shelfy.editMode", false);
  await vscode.commands.executeCommand("setContext", "shelfy.sortMode", provider.getSortMode());
  await setEffectiveClickActionContext();
  await setFilterContext(provider);

  let editMode = false;
  let treeView: vscode.TreeView<GroupItem | ProjectItem | ScriptItem> | undefined;
  let treeViewDisposables: vscode.Disposable[] = [];

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
      showCollapseAll: true
    };

    if (getShelfyTreeMimeTypes(editMode).length > 0) {
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

  const setEditMode = async (enabled: boolean): Promise<void> => {
    editMode = enabled;
    await vscode.commands.executeCommand("setContext", "shelfy.editMode", enabled);
    provider.setEditMode(enabled);
    registerTreeView();
  };

  registerTreeView();
  context.subscriptions.push({
    dispose: () => {
      for (const disposable of treeViewDisposables) {
        disposable.dispose();
      }
    }
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
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
      updateTreeViewState();
      await setFilterContext(provider);
    }),

    ...registerShelfyCommand("shelfy.clearFilter", async () => {
      await provider.setFilterText(undefined);
      updateTreeViewState();
      await setFilterContext(provider);
    }),

    ...registerShelfyCommand("shelfy.exportConfiguration", async () => {
      await exportConfiguration(store);
    }),

    ...registerShelfyCommand("shelfy.importConfiguration", async () => {
      await importConfiguration(store, provider);
    }),

    ...registerShelfyCommand("shelfy.addRootGroup", async () => {
      await createGroup(store, provider);
    }),

    ...registerShelfyCommand("shelfy.addSubgroup", async (item: GroupItem) => {
      await createGroup(store, provider, item.group.id);
    }),

    ...registerShelfyCommand(
      "shelfy.addProject",
      async (target?: GroupItem | ProjectItem | ScriptItem) => {
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
      }
    ),

    ...registerShelfyCommand("shelfy.renameGroup", async (item: GroupItem) => {
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

    ...registerShelfyCommand("shelfy.renameProject", async (item: ProjectItem) => {
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

    ...registerShelfyCommand("shelfy.addProjectScript", async (item: ProjectItem) => {
      await addProjectScript(store, provider, item);
    }),

    ...registerShelfyCommand("shelfy.editProjectScript", async (item: ScriptItem) => {
      await editProjectScript(store, provider, item);
    }),

    ...registerShelfyCommand("shelfy.removeProjectScript", async (item: ScriptItem) => {
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

    ...registerShelfyCommand("shelfy.runProjectScript", async (item: ScriptItem) => {
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

    ...registerShelfyCommand("shelfy.removeItem", async (item: GroupItem | ProjectItem) => {
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

    ...registerShelfyCommand("shelfy.moveItemToFolder", async (item?: GroupItem | ProjectItem) => {
      await moveItemToFolder(store, provider, item);
    }),

    ...registerShelfyCommand("shelfy.openProject", async (item: ProjectItem) => {
      await openProjectInCurrentWindow(item);
    }),

    ...registerShelfyCommand("shelfy.openProjectInNewWindow", async (item: ProjectItem) => {
      await openProjectInNewWindow(item);
    }),

    ...registerShelfyCommand("shelfy.openInExplorer", async (item: ProjectItem) => {
      await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(item.project.projectPath));
    }),

    ...registerShelfyCommand("shelfy.openProjectFromRow", async (item: ProjectItem) => {
      await openProjectFromRow(item);
    }),

    ...registerShelfyCommand("shelfy.cloneGroupWithNewBase", async (item: GroupItem) => {
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
  return getShelfySetting<ClickAction>("clickAction", "openSameInstance");
}

async function setEffectiveClickActionContext(): Promise<void> {
  await vscode.commands.executeCommand("setContext", "shelfy.clickAction", getClickAction());
}

async function setFilterContext(provider: ShelfyProvider): Promise<void> {
  await vscode.commands.executeCommand("setContext", "shelfy.hasFilter", provider.hasFilter());
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

async function cycleSortMode(provider: ShelfyProvider, nextMode: SortMode): Promise<void> {
  await provider.setSortMode(nextMode);
  await vscode.commands.executeCommand("setContext", "shelfy.sortMode", nextMode);
}
