import * as fs from "fs/promises";
import * as path from "path";
import { parse } from "jsonc-parser";

type SettingsShape = {
  peacock?: {
    color?: unknown;
  };
  workbench?: {
    colorCustomizations?: Record<string, unknown>;
  };
  "peacock.color"?: unknown;
  "workbench.colorCustomizations"?: Record<string, unknown>;
};

export async function readProjectColor(projectPath: string): Promise<string | undefined> {
  try {
    const settingsPath = path.join(projectPath, ".vscode", "settings.json");
    const raw = await fs.readFile(settingsPath, "utf8");
    const json = parse(raw) as SettingsShape;

    const peacockColor = json["peacock.color"];
    if (typeof peacockColor === "string" && isColorValue(peacockColor)) {
      return peacockColor;
    }

    const nestedPeacockColor = json.peacock?.color;
    if (typeof nestedPeacockColor === "string" && isColorValue(nestedPeacockColor)) {
      return nestedPeacockColor;
    }

    const direct = json["workbench.colorCustomizations"]?.["titleBar.activeBackground"];
    if (typeof direct === "string" && isColorValue(direct)) {
      return direct;
    }

    const nested = json.workbench?.colorCustomizations?.["titleBar.activeBackground"];
    if (typeof nested === "string" && isColorValue(nested)) {
      return nested;
    }

    return undefined;
  } catch (error) {
    console.error("Shelfy: failed to read project color", projectPath, error);
    return undefined;
  }
}

function isColorValue(value: string): boolean {
  return (
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^rgb(a)?\(/i.test(value) ||
    /^hsl(a)?\(/i.test(value)
  );
}