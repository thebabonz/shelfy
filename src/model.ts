export type NodePersonalization = {
  color?: string;
  icon?: string;
};

export type GroupNodeData = {
  kind: "group";
  id: string;
  name: string;
  children: NodeData[];
  personalization?: NodePersonalization;
};

export type PackageProjectScriptData = {
  kind: "package";
  id: string;
  scriptName: string;
};

export type CustomProjectScriptData = {
  kind: "custom";
  id: string;
  name: string;
  command: string;
};

export type ProjectScriptData = PackageProjectScriptData | CustomProjectScriptData;

export type NewProjectScriptData = Omit<PackageProjectScriptData, "id"> | Omit<CustomProjectScriptData, "id">;

export type ProjectNodeData = {
  kind: "project";
  id: string;
  name: string;
  projectPath: string;
  scripts?: ProjectScriptData[];
  personalization?: NodePersonalization;
};

export type NodeData = GroupNodeData | ProjectNodeData;

export type RootData = {
  version: 2;
  children: NodeData[];
};