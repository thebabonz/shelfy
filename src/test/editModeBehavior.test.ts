import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { NodeData, ProjectNodeData, RootData } from "../model";
import { addProjectScriptsToProject, updateProjectScriptInProject } from "../projectScriptState";
import { ProjectStore } from "../store";
import { filterTreeNodes, normalizeTreeFilterText } from "../treeFilter";
import {
  getAdjacentMoveTargets,
  getAdjacentScriptMoveTargets,
  getMoveDestinations,
  getShelfyTreeMimeTypes,
  getProjectRowCommandDefinition,
  isShelfyTreeEditable,
  SHELFY_TREE_MIME
} from "../treeBehavior";

const STORAGE_KEY = "shelfy.data.v2";
const LEGACY_STORAGE_KEY = "globalProjects.data.v2";

function readManifest(): {
  contributes: {
    commands: Array<{
      command: string;
      icon?: string | { light: string; dark: string };
      enablement?: string;
    }>;
    configuration: {
      properties: Record<string, { type?: string; deprecationMessage?: string }>;
    };
    menus: {
      "view/title": Array<{ command: string; when?: string; group?: string; order?: number }>;
      "view/item/context": Array<{ command: string; when?: string; group?: string }>;
    };
  };
} {
  const manifestPath = path.resolve(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function createTree(): NodeData[] {
  return [
    {
      kind: "group",
      id: "frontend",
      name: "Frontend",
      children: [
        {
          kind: "project",
          id: "web-app",
          name: "Web App",
          projectPath: "C:\\projects\\web-app"
        },
        {
          kind: "group",
          id: "components",
          name: "Components",
          children: [
            {
              kind: "group",
              id: "buttons",
              name: "Buttons",
              children: []
            }
          ]
        }
      ]
    },
    {
      kind: "group",
      id: "backend",
      name: "Backend",
      children: []
    },
    {
      kind: "project",
      id: "root-tool",
      name: "Root Tool",
      projectPath: "C:\\projects\\root-tool"
    }
  ];
}

function createProjectWithScripts(): ProjectNodeData {
  return {
    kind: "project",
    id: "project-a",
    name: "Project A",
    projectPath: "C:\\projects\\project-a",
    scripts: [
      {
        kind: "custom",
        id: "custom-dev",
        name: "Dev Server",
        command: "npm run dev"
      },
      {
        kind: "package",
        id: "package-test",
        scriptName: "test"
      }
    ]
  };
}

function createStoreContext(initialState: Record<string, RootData | undefined>): import("vscode").ExtensionContext {
  const state = new Map<string, RootData>();

  for (const [key, value] of Object.entries(initialState)) {
    if (value !== undefined) {
      state.set(key, value);
    }
  }

  return {
    globalState: {
      get<T>(key: string): T | undefined {
        return state.get(key) as T | undefined;
      },
      update(key: string, value: RootData | undefined): Promise<void> {
        if (value === undefined) {
          state.delete(key);
        } else {
          state.set(key, value);
        }
        return Promise.resolve();
      }
    }
  } as unknown as import("vscode").ExtensionContext;
}

test("drag and drop mime types are disabled outside edit mode", () => {
  assert.deepEqual(getShelfyTreeMimeTypes(false), []);
});

test("drag and drop mime types are enabled in edit mode", () => {
  assert.deepEqual(getShelfyTreeMimeTypes(true), [SHELFY_TREE_MIME]);
});

test("project rows do not expose an open command in edit mode", () => {
  assert.equal(getProjectRowCommandDefinition(true), undefined);
  assert.deepEqual(getProjectRowCommandDefinition(false), {
    command: "shelfy.openProjectFromRow",
    title: "Open Project"
  });
});

test("filter mode disables tree editing affordances", () => {
  assert.equal(isShelfyTreeEditable(true, false), true);
  assert.equal(isShelfyTreeEditable(true, true), false);
  assert.deepEqual(getShelfyTreeMimeTypes(isShelfyTreeEditable(true, true)), []);
  assert.deepEqual(getProjectRowCommandDefinition(isShelfyTreeEditable(true, true)), {
    command: "shelfy.openProjectFromRow",
    title: "Open Project"
  });
});

test("manifest hides project open actions in edit mode", () => {
  const manifest = readManifest();
  const menuItems = manifest.contributes.menus["view/item/context"];
  const commandsToCheck = [
    "shelfy.openProject",
    "shelfy.openProjectInNewWindow",
    "shelfy.openInExplorer"
  ];

  for (const command of commandsToCheck) {
    const menuItem = menuItems.find((item) => item.command === command);
    const commandContribution = manifest.contributes.commands.find((item) => item.command === command);
    assert.ok(menuItem, `Expected to find menu contribution for ${command}`);
    assert.ok(commandContribution, `Expected to find command contribution for ${command}`);
    assert.match(menuItem.when ?? "", /!shelfy\.editMode/);
    assert.match(commandContribution.enablement ?? "", /missingPath/);
  }
});

test("project move destinations include folders other than its current parent", () => {
  const destinations = getMoveDestinations(createTree(), "root-tool");

  assert.deepEqual(
    destinations.map((destination) => destination.targetGroupId),
    ["frontend", "components", "buttons", "backend"]
  );
  assert.equal(destinations.some((destination) => destination.targetGroupId === undefined), false);
});

test("project inside a folder can move to root", () => {
  const destinations = getMoveDestinations(createTree(), "web-app");

  assert.ok(destinations.some((destination) => destination.targetGroupId === undefined));
  assert.equal(destinations.some((destination) => destination.targetGroupId === "frontend"), false);
});

test("folder cannot move into itself or descendants", () => {
  const destinations = getMoveDestinations(createTree(), "frontend");

  assert.deepEqual(
    destinations.map((destination) => destination.targetGroupId),
    ["backend"]
  );
});

test("root and current parent no-op move destinations are excluded", () => {
  const rootProjectDestinations = getMoveDestinations(createTree(), "root-tool");
  const nestedProjectDestinations = getMoveDestinations(createTree(), "web-app");

  assert.equal(
    rootProjectDestinations.some((destination) => destination.targetGroupId === undefined),
    false
  );
  assert.equal(
    nestedProjectDestinations.some((destination) => destination.targetGroupId === "frontend"),
    false
  );
});

test("adjacent move targets stay within the current level", () => {
  assert.deepEqual(getAdjacentMoveTargets(createTree(), "frontend"), {
    up: undefined,
    down: {
      parentGroupId: undefined,
      targetIndex: 1
    }
  });

  assert.deepEqual(getAdjacentMoveTargets(createTree(), "web-app"), {
    up: undefined,
    down: {
      parentGroupId: "frontend",
      targetIndex: 1
    }
  });

  assert.deepEqual(getAdjacentMoveTargets(createTree(), "components"), {
    up: {
      parentGroupId: "frontend",
      targetIndex: 0
    },
    down: undefined
  });

  assert.deepEqual(getAdjacentMoveTargets(createTree(), "buttons"), {
    up: undefined,
    down: undefined
  });
});

test("adjacent script move targets stay within the current command level", () => {
  const project = createProjectWithScripts();

  assert.deepEqual(getAdjacentScriptMoveTargets(project.scripts, "custom-dev"), {
    up: undefined,
    down: {
      parentGroupId: undefined,
      targetIndex: 1
    }
  });

  assert.deepEqual(getAdjacentScriptMoveTargets(project.scripts, "package-test"), {
    up: {
      parentGroupId: undefined,
      targetIndex: 0
    },
    down: undefined
  });
});

test("manifest contributes move up and move down actions in edit mode", () => {
  const manifest = readManifest();
  const commands = manifest.contributes.commands;
  const menuItems = manifest.contributes.menus["view/item/context"];
  const moveUpCommand = commands.find((command) => command.command === "shelfy.moveItemUp");
  const moveDownCommand = commands.find((command) => command.command === "shelfy.moveItemDown");
  const moveUpMenuItem = menuItems.find((item) => item.command === "shelfy.moveItemUp");
  const moveDownMenuItem = menuItems.find((item) => item.command === "shelfy.moveItemDown");

  assert.ok(moveUpCommand, "Expected command contribution for shelfy.moveItemUp");
  assert.ok(moveDownCommand, "Expected command contribution for shelfy.moveItemDown");
  assert.ok(moveUpMenuItem, "Expected to find menu contribution for shelfy.moveItemUp");
  assert.ok(moveDownMenuItem, "Expected to find menu contribution for shelfy.moveItemDown");
  assert.match(moveUpCommand.enablement ?? "", /canMoveUp/);
  assert.match(moveDownCommand.enablement ?? "", /canMoveDown/);
  assert.doesNotMatch(moveUpMenuItem.when ?? "", /canMoveUp/);
  assert.doesNotMatch(moveDownMenuItem.when ?? "", /canMoveDown/);
  assert.match(moveUpMenuItem.when ?? "", /shelfy\.editMode/);
  assert.match(moveDownMenuItem.when ?? "", /shelfy\.editMode/);
  assert.ok(menuItems.some((item) => item.command === "shelfy.moveItemToFolder"));
});

test("manifest contributes personalization actions for projects and folders in edit mode", () => {
  const manifest = readManifest();
  const commands = manifest.contributes.commands;
  const menuItems = manifest.contributes.menus["view/item/context"];
  const editMenuItem = menuItems.find((item) => item.command === "shelfy.editItemPersonalization");
  const revertMenuItem = menuItems.find((item) => item.command === "shelfy.revertItemPersonalization");

  assert.ok(commands.some((command) => command.command === "shelfy.editItemPersonalization"));
  assert.ok(commands.some((command) => command.command === "shelfy.revertItemPersonalization"));
  assert.ok(editMenuItem, "Expected to find menu contribution for shelfy.editItemPersonalization");
  assert.ok(revertMenuItem, "Expected to find menu contribution for shelfy.revertItemPersonalization");
  assert.match(editMenuItem.when ?? "", /shelfy\.editMode/);
  assert.match(editMenuItem.when ?? "", /viewItem =~ \/\^group/);
  assert.match(editMenuItem.when ?? "", /viewItem =~ \/\^project/);
  assert.match(revertMenuItem.when ?? "", /hasPersonalization/);
});

test("manifest contributes change project folder action for projects in edit mode", () => {
  const manifest = readManifest();
  const command = manifest.contributes.commands.find(
    (candidate) => candidate.command === "shelfy.changeProjectPath"
  );
  const menuItem = manifest.contributes.menus["view/item/context"].find(
    (candidate) => candidate.command === "shelfy.changeProjectPath"
  );

  assert.ok(command, "Expected command contribution for shelfy.changeProjectPath");
  assert.ok(menuItem, "Expected menu contribution for shelfy.changeProjectPath");
  assert.equal(command.icon, "$(folder-opened)");
  assert.match(menuItem.when ?? "", /shelfy\.editMode/);
  assert.match(menuItem.when ?? "", /\^project/);
});

test("store reorders projects and folders within their current level", async () => {
  const store = new ProjectStore(createStoreContext({
    [STORAGE_KEY]: {
      version: 2,
      children: createTree()
    }
  }));

  await store.initialize();
  await store.moveNode("web-app", "frontend", 1);
  await store.moveNode("backend", undefined, 0);

  const data = store.read();
  assert.deepEqual(data.children.map((node) => node.id), ["backend", "frontend", "root-tool"]);

  const frontend = data.children[1];
  assert.equal(frontend?.kind, "group");

  if (!frontend || frontend.kind !== "group") {
    throw new Error("Expected frontend group.");
  }

  assert.deepEqual(frontend.children.map((node) => node.id), ["components", "web-app"]);
});

test("store reorders scripts within their project command level", async () => {
  const store = new ProjectStore(createStoreContext({
    [STORAGE_KEY]: {
      version: 2,
      children: [createProjectWithScripts()]
    }
  }));

  await store.initialize();
  await store.moveProjectScript("project-a", "custom-dev", 1);

  let project = store.read().children[0];
  assert.equal(project?.kind, "project");

  if (!project || project.kind !== "project") {
    throw new Error("Expected project with scripts.");
  }

  assert.deepEqual(project.scripts?.map((script) => script.id), ["package-test", "custom-dev"]);

  await store.moveProjectScript("project-a", "custom-dev", 0);

  project = store.read().children[0];
  assert.equal(project?.kind, "project");

  if (!project || project.kind !== "project") {
    throw new Error("Expected project with scripts.");
  }

  assert.deepEqual(project.scripts?.map((script) => script.id), ["custom-dev", "package-test"]);
});

test("store updates project paths and keeps duplicate path protection", async () => {
  const store = new ProjectStore(createStoreContext({
    [STORAGE_KEY]: {
      version: 2,
      children: createTree()
    }
  }));

  await store.initialize();
  await store.updateProjectPath("root-tool", "C:\\projects\\root-tool-renamed");

  const data = store.read();
  const rootTool = data.children.find((node) => node.id === "root-tool");

  assert.equal(rootTool?.kind, "project");

  if (!rootTool || rootTool.kind !== "project") {
    throw new Error("Expected root project.");
  }

  assert.equal(rootTool.projectPath, "C:\\projects\\root-tool-renamed");

  await assert.rejects(
    () => store.updateProjectPath("root-tool", "C:\\projects\\web-app"),
    /already saved/
  );
});

test("store saves and clears personalization for folders and projects", async () => {
  const store = new ProjectStore(createStoreContext({
    [STORAGE_KEY]: {
      version: 2,
      children: createTree()
    }
  }));

  await store.initialize();
  await store.setNodePersonalization("frontend", {
    color: "#123456",
    icon: "folder"
  });
  await store.setNodePersonalization("root-tool", {
    color: "rgb(12, 34, 56)",
    icon: "star"
  });

  let data = store.read();
  const frontend = data.children.find((node) => node.id === "frontend");
  const rootTool = data.children.find((node) => node.id === "root-tool");

  assert.equal(frontend?.kind, "group");
  assert.equal(rootTool?.kind, "project");

  if (!frontend || frontend.kind !== "group" || !rootTool || rootTool.kind !== "project") {
    throw new Error("Expected test nodes to exist.");
  }

  assert.deepEqual(frontend.personalization, {
    color: "#123456",
    icon: "folder"
  });
  assert.deepEqual(rootTool.personalization, {
    color: "rgb(12, 34, 56)",
    icon: "star"
  });

  await store.setNodePersonalization("frontend", undefined);

  data = store.read();
  const updatedFrontend = data.children.find((node) => node.id === "frontend");

  assert.equal(updatedFrontend?.kind, "group");

  if (!updatedFrontend || updatedFrontend.kind !== "group") {
    throw new Error("Expected frontend group to exist.");
  }

  assert.equal(updatedFrontend.personalization, undefined);
});

test("editing a custom script preserves its identifier and updates its values", () => {
  const project = createProjectWithScripts();

  const updated = updateProjectScriptInProject(project, "custom-dev", {
    kind: "custom",
    name: "API Dev",
    command: "pnpm dev"
  });

  assert.deepEqual(updated, {
    kind: "custom",
    id: "custom-dev",
    name: "API Dev",
    command: "pnpm dev"
  });
  assert.deepEqual(project.scripts?.[0], updated);
});

test("editing a script rejects a duplicate package script already on the project", () => {
  const project = createProjectWithScripts();

  addProjectScriptsToProject(project, [{ kind: "package", scriptName: "build" }]);

  assert.throws(
    () =>
      updateProjectScriptInProject(project, "package-test", {
        kind: "package",
        scriptName: "build"
      }),
    /already configured/
  );
});

test("tree filter keeps ancestors of matching projects and matches project paths", () => {
  const filtered = filterTreeNodes(createTree(), "root-tool");

  assert.deepEqual(filtered, [
    {
      kind: "project",
      id: "root-tool",
      name: "Root Tool",
      projectPath: "C:\\projects\\root-tool"
    }
  ]);

  const pathFiltered = filterTreeNodes(createTree(), "projects\\web-app");
  assert.equal(pathFiltered.length, 1);
  assert.equal(pathFiltered[0]?.kind, "group");
  assert.equal(pathFiltered[0]?.id, "frontend");
});

test("tree filter keeps a full matching group subtree", () => {
  const filtered = filterTreeNodes(createTree(), "frontend");

  assert.deepEqual(filtered, [createTree()[0]]);
});

test("tree filter matches scripts on a project", () => {
  const nodes: NodeData[] = [createProjectWithScripts()];

  const filteredByName = filterTreeNodes(nodes, "dev server");
  const filteredByCommand = filterTreeNodes(nodes, "pnpm dev");

  assert.equal(filteredByName.length, 1);
  assert.equal(filteredByCommand.length, 0);

  const updatedProject = createProjectWithScripts();
  updateProjectScriptInProject(updatedProject, "custom-dev", {
    kind: "custom",
    name: "API Dev",
    command: "pnpm dev"
  });

  assert.equal(filterTreeNodes([updatedProject], "pnpm dev").length, 1);
});

test("tree filter normalization trims and lowercases input", () => {
  assert.equal(normalizeTreeFilterText("  FrontEnd  "), "frontend");
  assert.equal(normalizeTreeFilterText("   "), undefined);
});

test("manifest contributes edit script action only for script items in edit mode", () => {
  const manifest = readManifest();
  const menuItems = manifest.contributes.menus["view/item/context"];
  const menuItem = menuItems.find((item) => item.command === "shelfy.editProjectScript");

  assert.ok(
    manifest.contributes.commands.some((command) => command.command === "shelfy.editProjectScript")
  );
  assert.ok(menuItem, "Expected to find menu contribution for shelfy.editProjectScript");
  assert.match(menuItem.when ?? "", /shelfy\.editMode/);
  assert.match(menuItem.when ?? "", /\^script/);
  assert.doesNotMatch(menuItem.when ?? "", /!shelfy\.editMode/);
});

test("manifest contributes filter actions in the view title", () => {
  const manifest = readManifest();
  const titleMenuItems = manifest.contributes.menus["view/title"];
  const setFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.setFilter");
  const clearFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.clearFilter");
  const sortMenuItem = titleMenuItems.find((item) => item.command === "shelfy.cycleSortFromNone");

  assert.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.setFilter"));
  assert.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.clearFilter"));
  assert.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.cycleSortFromNone"));
  assert.ok(setFilterMenuItem, "Expected to find menu contribution for shelfy.setFilter");
  assert.ok(clearFilterMenuItem, "Expected to find menu contribution for shelfy.clearFilter");
  assert.ok(sortMenuItem, "Expected to find menu contribution for shelfy.cycleSortFromNone");
  assert.match(setFilterMenuItem.when ?? "", /view == shelfyView/);
  assert.match(clearFilterMenuItem.when ?? "", /shelfy\.hasFilter/);
  assert.match(sortMenuItem.when ?? "", /shelfy\.sortMode == none/);
  assert.equal(setFilterMenuItem.group, "navigation@1");
  assert.equal(clearFilterMenuItem.group, "navigation@2");
  assert.equal(sortMenuItem.group, "navigation@3");
});

test("manifest orders collapse and edit actions in the view title", () => {
  const manifest = readManifest();
  const titleMenuItems = manifest.contributes.menus["view/title"];

  const collapseMenuItem = titleMenuItems.find((item) => item.command === "shelfy.collapseAll");
  const enableEditMenuItem = titleMenuItems.find((item) => item.command === "shelfy.enableEditMode");
  const disableEditMenuItem = titleMenuItems.find((item) => item.command === "shelfy.disableEditMode");
  const addFolderMenuItem = titleMenuItems.find((item) => item.command === "shelfy.addRootGroup");
  const addProjectMenuItem = titleMenuItems.find((item) => item.command === "shelfy.addProject");
  const refreshMenuItem = titleMenuItems.find((item) => item.command === "shelfy.refresh");
  const settingsMenuItem = titleMenuItems.find((item) => item.command === "shelfy.openSettings");

  assert.equal(collapseMenuItem?.group, "navigation@4");
  assert.equal(collapseMenuItem?.order, 0);
  assert.equal(enableEditMenuItem?.group, "navigation@4");
  assert.equal(enableEditMenuItem?.order, 1);
  assert.equal(disableEditMenuItem?.group, "navigation@6");
  assert.equal(disableEditMenuItem?.order, 1);
  assert.equal(addFolderMenuItem?.group, "navigation@5");
  assert.equal(addProjectMenuItem?.group, "navigation@6");
  assert.equal(addProjectMenuItem?.order, 0);
  assert.equal(refreshMenuItem?.group, "navigation@7");
  assert.equal(settingsMenuItem?.group, "navigation@8");
});

test("manifest contributes a settings action last in the view title", () => {
  const manifest = readManifest();
  const titleMenuItems = manifest.contributes.menus["view/title"];
  const settingsMenuItem = titleMenuItems.find((item) => item.command === "shelfy.openSettings");
  const settingsCommand = manifest.contributes.commands.find(
    (command) => command.command === "shelfy.openSettings"
  );

  assert.ok(settingsCommand, "Expected to find command contribution for shelfy.openSettings");
  assert.equal(settingsCommand.icon, "$(settings-gear)");
  assert.ok(settingsMenuItem, "Expected to find menu contribution for shelfy.openSettings");
  assert.match(settingsMenuItem.when ?? "", /view == shelfyView/);
  assert.equal(settingsMenuItem.group, "navigation@8");

  for (const menuItem of titleMenuItems) {
    if (menuItem.command === "shelfy.openSettings") {
      continue;
    }

    const match = menuItem.group?.match(/@(\d+)$/);
    if (match) {
      assert.ok(Number(match[1]) < 8, `Expected ${menuItem.command} to appear before shelfy.openSettings`);
    }
  }
});

test("manifest hides edit mode toggle while a filter is active", () => {
  const titleMenuItems = readManifest().contributes.menus["view/title"];
  const enableEditModeMenuItem = titleMenuItems.find((item) => item.command === "shelfy.enableEditMode");

  assert.ok(enableEditModeMenuItem, "Expected to find menu contribution for shelfy.enableEditMode");
  assert.match(enableEditModeMenuItem.when ?? "", /!shelfy\.hasFilter/);
});

test("manifest contributes a clear filter lens icon", () => {
  const command = readManifest().contributes.commands.find(
    (candidate) => candidate.command === "shelfy.clearFilter"
  );

  assert.deepEqual(command?.icon, {
    light: "media/light/clear-filter.svg",
    dark: "media/dark/clear-filter.svg"
  });
});

test("manifest contributes shelfy settings and deprecates legacy aliases", () => {
  const properties = readManifest().contributes.configuration.properties;

  assert.ok(properties["shelfy.clickAction"]);
  assert.ok(properties["shelfy.showProjectPath"]);
  assert.ok(properties["shelfy.confirmOnClick"]);
  assert.strictEqual(properties["shelfy.confirmOnClick"].type, "boolean");
  assert.match(properties["globalProjects.clickAction"]?.deprecationMessage ?? "", /shelfy\.clickAction/);
  assert.match(
    properties["globalProjects.showProjectPath"]?.deprecationMessage ?? "",
    /shelfy\.showProjectPath/
  );
});

test("store falls back to legacy data when v2 storage only contains the empty root", async () => {
  const legacyData: RootData = {
    version: 2,
    children: [
      {
        kind: "project",
        id: "legacy-project",
        name: "Legacy Project",
        projectPath: "C:\\projects\\legacy-project"
      }
    ]
  };

  const store = new ProjectStore(
    createStoreContext({
      [STORAGE_KEY]: { version: 2, children: [] },
      [LEGACY_STORAGE_KEY]: legacyData
    })
  );

  await store.initialize();
  assert.deepEqual(store.read(), legacyData);
});

test("writing v2 data clears legacy storage so empty trees stay empty", async () => {
  const legacyData: RootData = {
    version: 2,
    children: [
      {
        kind: "project",
        id: "legacy-project",
        name: "Legacy Project",
        projectPath: "C:\\projects\\legacy-project"
      }
    ]
  };

  const store = new ProjectStore(
    createStoreContext({
      [STORAGE_KEY]: { version: 2, children: [] },
      [LEGACY_STORAGE_KEY]: legacyData
    })
  );

  await store.write({ version: 2, children: [] });

  assert.deepEqual(store.read(), { version: 2, children: [] });
});

const CASE_INSENSITIVE_FILE_SYSTEM = process.platform === "win32" || process.platform === "darwin";

/** Builds an absolute path that is meaningful on the host platform. */
function absoluteProjectPath(...segments: string[]): string {
  return process.platform === "win32"
    ? path.join("C:\\", ...segments)
    : path.join("/", ...segments);
}

/** Two absolute paths that share no common parent folder on the host platform. */
function unrelatedProjectPaths(): [string, string] {
  return process.platform === "win32"
    ? ["C:\alpha\one", "D:\beta\two"]
    : ["/alpha/one", "/beta/two"];
}

function createStoreWithChildren(children: NodeData[]): ProjectStore {
  return new ProjectStore(
    createStoreContext({
      [STORAGE_KEY]: { version: 2, children }
    })
  );
}

function collectProjectPaths(nodes: NodeData[], collected: string[] = []): string[] {
  for (const node of nodes) {
    if (node.kind === "project") {
      collected.push(node.projectPath);
    } else {
      collectProjectPaths(node.children, collected);
    }
  }

  return collected;
}

test("a rejected move leaves the dragged item in the tree", async () => {
  const store = createStoreWithChildren(createTree());
  await store.initialize();

  // Dropping a group onto one of its own descendants has to be refused without
  // extracting the group from the live tree first.
  await assert.rejects(
    () => store.moveNode("frontend", "buttons", 0),
    /into itself or one of its children/
  );

  assert.deepEqual(
    store.read().children.map((node) => node.id),
    ["frontend", "backend", "root-tool"]
  );

  const frontend = store.read().children[0];
  if (!frontend || frontend.kind !== "group") {
    throw new Error("Expected frontend group.");
  }

  assert.deepEqual(frontend.children.map((node) => node.id), ["web-app", "components"]);
});

test("a move onto a missing group is refused without losing the dragged item", async () => {
  const store = createStoreWithChildren(createTree());
  await store.initialize();

  await assert.rejects(() => store.moveNode("root-tool", "does-not-exist", 0), /not found/);

  assert.deepEqual(
    store.read().children.map((node) => node.id),
    ["frontend", "backend", "root-tool"]
  );
});

test("project paths are stored without a trailing separator", async () => {
  const store = createStoreWithChildren([]);
  await store.initialize();

  const projectPath = absoluteProjectPath("projects", "web-app");
  const added = await store.addProject({ name: "Web App", projectPath: projectPath + path.sep });

  assert.equal(added.projectPath, projectPath);
});

test("the same folder cannot be saved twice under an equivalent path", async () => {
  const store = createStoreWithChildren([]);
  await store.initialize();

  const projectPath = absoluteProjectPath("projects", "web-app");
  await store.addProject({ name: "Web App", projectPath });

  const equivalentPaths = [
    projectPath + path.sep,
    path.join(projectPath, ".", ""),
    absoluteProjectPath("projects", "unused", "..", "web-app")
  ];

  for (const equivalentPath of equivalentPaths) {
    await assert.rejects(
      () => store.addProject({ name: "Duplicate", projectPath: equivalentPath }),
      /already saved/,
      `Expected "${equivalentPath}" to be rejected as a duplicate.`
    );
  }

  assert.equal(store.read().children.length, 1);
});

test(
  "the same folder cannot be saved twice under different casing",
  { skip: CASE_INSENSITIVE_FILE_SYSTEM ? false : "file system is case-sensitive" },
  async () => {
    const store = createStoreWithChildren([]);
    await store.initialize();

    const projectPath = absoluteProjectPath("Projects", "Web-App");
    await store.addProject({ name: "Web App", projectPath });

    await assert.rejects(
      () => store.addProject({ name: "Duplicate", projectPath: projectPath.toLowerCase() }),
      /already saved/
    );

    await assert.rejects(
      () => store.updateProjectPath("root-tool", projectPath.toLowerCase()),
      /not found|already saved/
    );

    // The casing the user picked is preserved for display.
    const stored = store.read().children[0];
    if (!stored || stored.kind !== "project") {
      throw new Error("Expected stored project.");
    }

    assert.equal(stored.projectPath, projectPath);
  }
);

test("cloning a group rebases its project paths onto the new base", async () => {
  const store = createStoreWithChildren([
    {
      kind: "group",
      id: "repos",
      name: "Repos",
      children: [
        {
          kind: "project",
          id: "one",
          name: "One",
          projectPath: absoluteProjectPath("src", "one")
        },
        {
          kind: "group",
          id: "nested",
          name: "Nested",
          children: [
            {
              kind: "project",
              id: "two",
              name: "Two",
              projectPath: absoluteProjectPath("src", "nested", "two")
            }
          ]
        }
      ]
    }
  ]);

  await store.initialize();

  const newBase = absoluteProjectPath("worktree");
  const { group, commonBase } = await store.cloneGroupWithNewBase("repos", "Repos Copy", newBase);

  assert.equal(commonBase, absoluteProjectPath("src"));
  assert.deepEqual(collectProjectPaths([group]), [
    path.join(newBase, "one"),
    path.join(newBase, "nested", "two")
  ]);
});

test("cloning a group whose projects share no common base is refused", async () => {
  const [first, second] = unrelatedProjectPaths();
  const store = createStoreWithChildren([
    {
      kind: "group",
      id: "repos",
      name: "Repos",
      children: [
        { kind: "project", id: "one", name: "One", projectPath: first },
        { kind: "project", id: "two", name: "Two", projectPath: second }
      ]
    }
  ]);

  await store.initialize();

  await assert.rejects(
    () => store.cloneGroupWithNewBase("repos", "Repos Copy", absoluteProjectPath("worktree")),
    /do not share a common parent folder/
  );

  // The rejected clone must not have been added to the tree.
  assert.equal(store.read().children.length, 1);
  assert.deepEqual(collectProjectPaths(store.read().children), [first, second]);
});

test("cloning a group is refused when a rebased path is already saved", async () => {
  const store = createStoreWithChildren([
    {
      kind: "group",
      id: "repos",
      name: "Repos",
      children: [
        {
          kind: "project",
          id: "one",
          name: "One",
          projectPath: absoluteProjectPath("src", "one")
        }
      ]
    },
    {
      kind: "project",
      id: "already-there",
      name: "Already There",
      projectPath: absoluteProjectPath("worktree", "one")
    }
  ]);

  await store.initialize();

  await assert.rejects(
    () => store.cloneGroupWithNewBase("repos", "Repos Copy", absoluteProjectPath("worktree")),
    /already saved as "Already There"/
  );

  assert.equal(store.read().children.length, 2);
});

test("an exported configuration can always be imported again", async () => {
  const store = createStoreWithChildren([
    {
      kind: "group",
      id: "repos",
      name: "Repos",
      children: [
        {
          kind: "project",
          id: "one",
          name: "One",
          projectPath: absoluteProjectPath("src", "one")
        }
      ]
    }
  ]);

  await store.initialize();
  await store.cloneGroupWithNewBase("repos", "Repos Copy", absoluteProjectPath("worktree"));

  await store.importData(store.exportData());

  assert.equal(store.read().children.length, 2);
});
