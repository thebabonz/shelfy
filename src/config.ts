import * as vscode from "vscode";

export const SHELFY_CONFIGURATION_SECTION = "shelfy";
export const LEGACY_CONFIGURATION_SECTION = "globalProjects";

type ConfigurationInspection<T> = {
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
};

function hasExplicitValue<T>(inspection: ConfigurationInspection<T> | undefined): boolean {
  return (
    inspection?.globalValue !== undefined ||
    inspection?.workspaceValue !== undefined ||
    inspection?.workspaceFolderValue !== undefined
  );
}

export function getShelfySetting<T>(key: string, defaultValue: T): T {
  const shelfyConfig = vscode.workspace.getConfiguration(SHELFY_CONFIGURATION_SECTION);
  const shelfyInspection = shelfyConfig.inspect<T>(key);

  if (hasExplicitValue(shelfyInspection)) {
    return shelfyConfig.get<T>(key, defaultValue);
  }

  const legacyConfig = vscode.workspace.getConfiguration(LEGACY_CONFIGURATION_SECTION);
  const legacyInspection = legacyConfig.inspect<T>(key);

  if (hasExplicitValue(legacyInspection)) {
    return legacyConfig.get<T>(key, defaultValue);
  }

  return shelfyConfig.get<T>(key, defaultValue);
}

export function affectsShelfySetting(event: vscode.ConfigurationChangeEvent, key: string): boolean {
  return (
    event.affectsConfiguration(`${SHELFY_CONFIGURATION_SECTION}.${key}`) ||
    event.affectsConfiguration(`${LEGACY_CONFIGURATION_SECTION}.${key}`)
  );
}