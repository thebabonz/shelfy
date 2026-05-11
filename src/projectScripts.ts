import * as fs from "fs/promises";
import * as path from "path";
import { parse } from "jsonc-parser";
import { ProjectScriptData } from "./model";

type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

type PackageJsonShape = {
  packageManager?: unknown;
  scripts?: Record<string, unknown>;
};

export type PackageScriptOption = {
  name: string;
  command: string;
};

export async function readPackageScripts(projectPath: string): Promise<PackageScriptOption[]> {
  const packageJson = await readProjectPackageJson(projectPath);
  const scripts = Object.entries(packageJson.scripts ?? {}).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string"
  );

  return scripts
    .map(([name, command]) => ({ name, command }))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export async function resolveProjectScriptCommand(
  projectPath: string,
  script: ProjectScriptData
): Promise<string> {
  if (script.kind === "custom") {
    return script.command;
  }

  const packageJson = await readProjectPackageJson(projectPath);
  const packageScript = packageJson.scripts?.[script.scriptName];
  if (typeof packageScript !== "string") {
    throw new Error(`Script "${script.scriptName}" was not found in package.json.`);
  }

  const packageManager = await detectPackageManager(projectPath, packageJson);
  return `${packageManager} run ${formatScriptName(script.scriptName)}`;
}

async function readProjectPackageJson(projectPath: string): Promise<PackageJsonShape> {
  const packageJsonPath = path.join(projectPath, "package.json");
  const raw = await fs.readFile(packageJsonPath, "utf8");
  return parse(raw) as PackageJsonShape;
}

async function detectPackageManager(
  projectPath: string,
  packageJson: PackageJsonShape
): Promise<PackageManager> {
  if (typeof packageJson.packageManager === "string") {
    const normalized = packageJson.packageManager.toLowerCase();
    if (normalized.startsWith("pnpm@")) {
      return "pnpm";
    }
    if (normalized.startsWith("yarn@")) {
      return "yarn";
    }
    if (normalized.startsWith("bun@")) {
      return "bun";
    }
  }

  if (await fileExists(path.join(projectPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (await fileExists(path.join(projectPath, "yarn.lock"))) {
    return "yarn";
  }

  if (
    (await fileExists(path.join(projectPath, "bun.lock"))) ||
    (await fileExists(path.join(projectPath, "bun.lockb")))
  ) {
    return "bun";
  }

  return "npm";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatScriptName(scriptName: string): string {
  return /\s/.test(scriptName) ? `"${scriptName.replace(/"/g, '\\"')}"` : scriptName;
}