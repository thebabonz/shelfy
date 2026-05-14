import * as crypto from "crypto";
import { NewProjectScriptData, ProjectNodeData, ProjectScriptData } from "./model";

export function addProjectScriptsToProject(
  project: ProjectNodeData,
  scripts: NewProjectScriptData[]
): ProjectScriptData[] {
  const projectScripts = project.scripts ?? (project.scripts = []);
  const added: ProjectScriptData[] = [];

  for (const script of scripts) {
    if (hasMatchingProjectScript(projectScripts, script)) {
      continue;
    }

    const nextScript = createProjectScript(script);
    projectScripts.push(nextScript);
    added.push(nextScript);
  }

  return added;
}

export function updateProjectScriptInProject(
  project: ProjectNodeData,
  scriptId: string,
  nextScript: NewProjectScriptData
): ProjectScriptData {
  const projectScripts = project.scripts ?? [];
  const index = projectScripts.findIndex((script) => script.id === scriptId);
  if (index < 0) {
    throw new Error("Script not found.");
  }

  if (hasMatchingProjectScript(projectScripts, nextScript, scriptId)) {
    throw new Error("That script is already configured for this project.");
  }

  const updated = createProjectScript(nextScript, scriptId);
  projectScripts[index] = updated;
  return updated;
}

function createProjectScript(
  script: NewProjectScriptData,
  id: string = crypto.randomUUID()
): ProjectScriptData {
  return script.kind === "package"
    ? {
        kind: "package",
        id,
        scriptName: script.scriptName
      }
    : {
        kind: "custom",
        id,
        name: script.name,
        command: script.command
      };
}

function hasMatchingProjectScript(
  existingScripts: ProjectScriptData[],
  nextScript: NewProjectScriptData,
  excludedScriptId?: string
): boolean {
  if (nextScript.kind === "package") {
    return existingScripts.some(
      (script) =>
        script.id !== excludedScriptId &&
        script.kind === "package" &&
        script.scriptName === nextScript.scriptName
    );
  }

  return existingScripts.some(
    (script) =>
      script.id !== excludedScriptId &&
      script.kind === "custom" &&
      script.command === nextScript.command
  );
}