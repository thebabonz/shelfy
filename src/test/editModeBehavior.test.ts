import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { NodeData, ProjectNodeData } from "../model";
import { addProjectScriptsToProject, updateProjectScriptInProject } from "../projectScriptState";
import { filterTreeNodes, normalizeTreeFilterText } from "../treeFilter";
import {
  getMoveDestinations,
  getShelfyTreeMimeTypes,
  getProjectRowCommandDefinition,
  SHELFY_TREE_MIME
} from "../treeBehavior";

function readManifest(): {
  contributes: {
    commands: Array<{ command: string }>;
    configuration: {
      properties: Record<string, { deprecationMessage?: string }>;
    };
    menus: {
      "view/title": Array<{ command: string; when?: string }>;
      "view/item/context": Array<{ command: string; when?: string }>;
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

test("manifest hides project open actions in edit mode", () => {
  const menuItems = readManifest().contributes.menus["view/item/context"];
  const commandsToCheck = [
    "shelfy.openProject",
    "shelfy.openProjectInNewWindow",
    "shelfy.openInExplorer"
  ];

  for (const command of commandsToCheck) {
    const menuItem = menuItems.find((item) => item.command === command);
    assert.ok(menuItem, `Expected to find menu contribution for ${command}`);
    assert.match(menuItem.when ?? "", /!shelfy\.editMode/);
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

test("manifest shows move action only for projects and folders in edit mode", () => {
  const menuItems = readManifest().contributes.menus["view/item/context"];
  const menuItem = menuItems.find((item) => item.command === "shelfy.moveItemToFolder");

  assert.ok(menuItem, "Expected to find menu contribution for shelfy.moveItemToFolder");
  assert.match(menuItem.when ?? "", /shelfy\.editMode/);
  assert.match(menuItem.when ?? "", /viewItem == group/);
  assert.match(menuItem.when ?? "", /viewItem == project/);
  assert.doesNotMatch(menuItem.when ?? "", /viewItem == script/);
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
  assert.match(menuItem.when ?? "", /viewItem == script/);
  assert.doesNotMatch(menuItem.when ?? "", /!shelfy\.editMode/);
});

test("manifest contributes filter actions in the view title", () => {
  const manifest = readManifest();
  const titleMenuItems = manifest.contributes.menus["view/title"];
  const setFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.setFilter");
  const clearFilterMenuItem = titleMenuItems.find((item) => item.command === "shelfy.clearFilter");

  assert.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.setFilter"));
  assert.ok(manifest.contributes.commands.some((command) => command.command === "shelfy.clearFilter"));
  assert.ok(setFilterMenuItem, "Expected to find menu contribution for shelfy.setFilter");
  assert.ok(clearFilterMenuItem, "Expected to find menu contribution for shelfy.clearFilter");
  assert.match(setFilterMenuItem.when ?? "", /view == shelfyView/);
  assert.match(clearFilterMenuItem.when ?? "", /shelfy\.hasFilter/);
});

test("manifest contributes shelfy settings and deprecates legacy aliases", () => {
  const properties = readManifest().contributes.configuration.properties;

  assert.ok(properties["shelfy.clickAction"]);
  assert.ok(properties["shelfy.showProjectPath"]);
  assert.match(properties["globalProjects.clickAction"]?.deprecationMessage ?? "", /shelfy\.clickAction/);
  assert.match(
    properties["globalProjects.showProjectPath"]?.deprecationMessage ?? "",
    /shelfy\.showProjectPath/
  );
});
