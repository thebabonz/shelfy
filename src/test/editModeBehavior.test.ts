import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { NodeData } from "../model";
import {
  getMoveDestinations,
  getGlobalProjectsTreeMimeTypes,
  getProjectRowCommandDefinition,
  GLOBAL_PROJECTS_TREE_MIME
} from "../treeBehavior";

function readManifest(): {
  contributes: {
    configuration: {
      properties: Record<string, { deprecationMessage?: string }>;
    };
    menus: {
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

test("drag and drop mime types are disabled outside edit mode", () => {
  assert.deepEqual(getGlobalProjectsTreeMimeTypes(false), []);
});

test("drag and drop mime types are enabled in edit mode", () => {
  assert.deepEqual(getGlobalProjectsTreeMimeTypes(true), [GLOBAL_PROJECTS_TREE_MIME]);
});

test("project rows do not expose an open command in edit mode", () => {
  assert.equal(getProjectRowCommandDefinition(true), undefined);
  assert.deepEqual(getProjectRowCommandDefinition(false), {
    command: "globalProjects.openProjectFromRow",
    title: "Open Project"
  });
});

test("manifest hides project open actions in edit mode", () => {
  const menuItems = readManifest().contributes.menus["view/item/context"];
  const commandsToCheck = [
    "globalProjects.openProject",
    "globalProjects.openProjectInNewWindow",
    "globalProjects.openInExplorer"
  ];

  for (const command of commandsToCheck) {
    const menuItem = menuItems.find((item) => item.command === command);
    assert.ok(menuItem, `Expected to find menu contribution for ${command}`);
    assert.match(menuItem.when ?? "", /!globalProjects\.editMode/);
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
  const menuItem = menuItems.find((item) => item.command === "globalProjects.moveItemToFolder");

  assert.ok(menuItem, "Expected to find menu contribution for globalProjects.moveItemToFolder");
  assert.match(menuItem.when ?? "", /globalProjects\.editMode/);
  assert.match(menuItem.when ?? "", /viewItem == group/);
  assert.match(menuItem.when ?? "", /viewItem == project/);
  assert.doesNotMatch(menuItem.when ?? "", /viewItem == script/);
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
