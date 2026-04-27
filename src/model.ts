export type GroupNodeData = {
  kind: "group";
  id: string;
  name: string;
  children: NodeData[];
};

export type ProjectNodeData = {
  kind: "project";
  id: string;
  name: string;
  projectPath: string;
};

export type NodeData = GroupNodeData | ProjectNodeData;

export type RootData = {
  version: 2;
  children: NodeData[];
};