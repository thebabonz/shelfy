import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import {
  getGlobalProjectsTreeMimeTypes,
  getProjectRowCommandDefinition,
  GLOBAL_PROJECTS_TREE_MIME
} from "../treeBehavior";

function readManifest(): {
  contributes: {
    menus: {
      "view/item/context": Array<{ command: string; when?: string }>;
    };
  };
} {
  const manifestPath = path.resolve(__dirname, "..", "..", "package.json");
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
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