"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectStore = void 0;
exports.normalizeProjectPath = normalizeProjectPath;
exports.findGroup = findGroup;
exports.findProjectByPath = findProjectByPath;
exports.findCommonBasePath = findCommonBasePath;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const personalization_1 = require("./personalization");
const projectColor_1 = require("./projectColor");
const projectScriptState_1 = require("./projectScriptState");
const STORAGE_KEY = "shelfy.data.v2";
const LEGACY_STORAGE_KEY = "globalProjects.data.v2";
class ProjectStore {
    constructor(context) {
        this.context = context;
    }
    read() {
        const stored = this.context.globalState.get(STORAGE_KEY);
        const legacy = this.context.globalState.get(LEGACY_STORAGE_KEY);
        if (isEmptyRootData(stored) && hasRootChildren(legacy)) {
            return legacy;
        }
        return (stored ??
            legacy ?? {
            version: 2,
            children: []
        });
    }
    exportData() {
        return structuredClone(this.read());
    }
    async importData(data) {
        const normalized = normalizeRootData(data);
        await this.write(normalized);
        return normalized;
    }
    async write(data) {
        await this.context.globalState.update(STORAGE_KEY, data);
        await this.context.globalState.update(LEGACY_STORAGE_KEY, undefined);
    }
    getParentGroupId(nodeId) {
        const result = findParentGroupIdForNode(this.read().children, nodeId);
        return result.found ? result.parentId : undefined;
    }
    async addGroup(name, parentGroupId) {
        const data = this.read();
        const group = {
            kind: "group",
            id: crypto.randomUUID(),
            name,
            children: []
        };
        if (!parentGroupId) {
            data.children.push(group);
        }
        else {
            const parent = findGroup(data.children, parentGroupId);
            if (!parent) {
                throw new Error("Parent group not found.");
            }
            parent.children.push(group);
        }
        await this.write(data);
        return group;
    }
    async renameGroup(groupId, newName) {
        const data = this.read();
        const group = findGroup(data.children, groupId);
        if (!group) {
            throw new Error("Group not found.");
        }
        group.name = newName;
        await this.write(data);
    }
    async renameProject(projectId, newName) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        project.name = newName;
        await this.write(data);
    }
    async updateProjectPath(projectId, projectPath) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const normalized = normalizeProjectPath(projectPath);
        const existing = findProjectByPath(data.children, normalized);
        if (existing && existing.id !== projectId) {
            throw new Error(`That project is already saved as "${existing.name}".`);
        }
        project.projectPath = normalized;
        await this.write(data);
    }
    async setNodePersonalization(nodeId, personalization) {
        const data = this.read();
        const node = findNodeById(data.children, nodeId);
        if (!node) {
            throw new Error("Item not found.");
        }
        node.personalization = cloneNodePersonalization(personalization);
        await this.write(data);
    }
    async addProject(input) {
        const data = this.read();
        const normalized = normalizeProjectPath(input.projectPath);
        const existing = findProjectByPath(data.children, normalized);
        if (existing) {
            throw new Error(`That project is already saved as "${existing.name}".`);
        }
        const project = {
            kind: "project",
            id: crypto.randomUUID(),
            name: input.name,
            projectPath: normalized,
            scripts: []
        };
        if (!input.parentGroupId) {
            data.children.push(project);
        }
        else {
            const parent = findGroup(data.children, input.parentGroupId);
            if (!parent) {
                throw new Error("Parent group not found.");
            }
            parent.children.push(project);
        }
        await this.write(data);
        return project;
    }
    async addProjectScripts(projectId, scripts) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const added = (0, projectScriptState_1.addProjectScriptsToProject)(project, scripts);
        await this.write(data);
        return added;
    }
    async updateProjectScript(projectId, scriptId, nextScript) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const updated = (0, projectScriptState_1.updateProjectScriptInProject)(project, scriptId, nextScript);
        await this.write(data);
        return updated;
    }
    async removeProjectScript(projectId, scriptId) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const scripts = project.scripts ?? [];
        const index = scripts.findIndex((script) => script.id === scriptId);
        if (index < 0) {
            throw new Error("Script not found.");
        }
        scripts.splice(index, 1);
        await this.write(data);
    }
    async moveProjectScript(projectId, scriptId, targetIndex) {
        const data = this.read();
        const project = findProjectById(data.children, projectId);
        if (!project) {
            throw new Error("Project not found.");
        }
        const scripts = project.scripts ?? [];
        const index = scripts.findIndex((script) => script.id === scriptId);
        if (index < 0) {
            throw new Error("Script not found.");
        }
        const [script] = scripts.splice(index, 1);
        const clampedIndex = Math.max(0, Math.min(targetIndex, scripts.length));
        scripts.splice(clampedIndex, 0, script);
        await this.write(data);
    }
    async removeNode(nodeId) {
        const data = this.read();
        const removed = removeNodeRecursive(data.children, nodeId);
        if (!removed) {
            throw new Error("Item not found.");
        }
        await this.write(data);
    }
    async cloneGroupWithNewBase(groupId, newName, newBasePath) {
        const data = this.read();
        const group = findGroup(data.children, groupId);
        if (!group) {
            throw new Error("Group not found.");
        }
        const projectPaths = collectProjectPathsFromGroup(group);
        if (projectPaths.length === 0) {
            throw new Error("Group has no projects to repath.");
        }
        const commonBase = findCommonBasePath(projectPaths);
        const normalizedNew = path.normalize(newBasePath);
        const cloned = deepCloneGroupWithRebase(group, commonBase, normalizedNew, newName);
        const parentResult = findParentGroupIdForNode(data.children, groupId);
        if (!parentResult.found) {
            throw new Error("Group not found in tree.");
        }
        if (parentResult.parentId === undefined) {
            data.children.push(cloned);
        }
        else {
            const parent = findGroup(data.children, parentResult.parentId);
            if (!parent) {
                throw new Error("Parent group not found.");
            }
            parent.children.push(cloned);
        }
        await this.write(data);
        return { group: cloned, commonBase };
    }
    async moveNode(nodeId, targetGroupId, targetIndex) {
        const data = this.read();
        const extracted = extractNode(data.children, nodeId);
        if (!extracted) {
            throw new Error("Dragged item not found.");
        }
        if (extracted.node.kind === "group" && targetGroupId) {
            const dropTarget = findGroup(data.children, targetGroupId);
            if (!dropTarget) {
                throw new Error("Drop target group not found.");
            }
            if (containsGroup(extracted.node, targetGroupId)) {
                throw new Error("Cannot move a group into itself or one of its children.");
            }
        }
        const targetArray = targetGroupId
            ? findGroup(data.children, targetGroupId)?.children
            : data.children;
        if (!targetArray) {
            throw new Error("Target container not found.");
        }
        const clampedIndex = Math.max(0, Math.min(targetIndex, targetArray.length));
        targetArray.splice(clampedIndex, 0, extracted.node);
        await this.write(data);
    }
}
exports.ProjectStore = ProjectStore;
function normalizeProjectPath(input) {
    return path.normalize(input);
}
function hasRootChildren(data) {
    return data !== undefined && data.children.length > 0;
}
function isEmptyRootData(data) {
    return data !== undefined && data.children.length === 0;
}
function findGroup(nodes, groupId) {
    for (const node of nodes) {
        if (node.kind === "group") {
            if (node.id === groupId) {
                return node;
            }
            const nested = findGroup(node.children, groupId);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
function findProjectByPath(nodes, projectPath) {
    for (const node of nodes) {
        if (node.kind === "project") {
            if (normalizeProjectPath(node.projectPath) === projectPath) {
                return node;
            }
        }
        else {
            const nested = findProjectByPath(node.children, projectPath);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
function findProjectById(nodes, projectId) {
    for (const node of nodes) {
        if (node.kind === "project") {
            if (node.id === projectId) {
                return node;
            }
        }
        else {
            const nested = findProjectById(node.children, projectId);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
function removeNodeRecursive(nodes, nodeId) {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) {
        nodes.splice(index, 1);
        return true;
    }
    for (const node of nodes) {
        if (node.kind === "group" && removeNodeRecursive(node.children, nodeId)) {
            return true;
        }
    }
    return false;
}
function extractNode(nodes, nodeId) {
    const index = nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) {
        const [node] = nodes.splice(index, 1);
        return { node };
    }
    for (const node of nodes) {
        if (node.kind === "group") {
            const extracted = extractNode(node.children, nodeId);
            if (extracted) {
                return extracted;
            }
        }
    }
    return undefined;
}
function containsGroup(group, groupId) {
    if (group.id === groupId) {
        return true;
    }
    for (const child of group.children) {
        if (child.kind === "group" && containsGroup(child, groupId)) {
            return true;
        }
    }
    return false;
}
function collectProjectPathsFromGroup(group) {
    const result = [];
    for (const child of group.children) {
        if (child.kind === "project") {
            result.push(child.projectPath);
        }
        else {
            result.push(...collectProjectPathsFromGroup(child));
        }
    }
    return result;
}
function findCommonBasePath(paths) {
    if (paths.length === 0) {
        return "";
    }
    const normalized = paths.map((p) => path.normalize(p));
    const segments = normalized.map((p) => p.split(path.sep));
    const first = segments[0];
    // Start at most at the parent of the first path (exclude the leaf segment)
    let commonLength = first.length - 1;
    for (const segs of segments.slice(1)) {
        let i = 0;
        while (i < commonLength && i < segs.length && first[i] === segs[i]) {
            i++;
        }
        commonLength = i;
    }
    return first.slice(0, commonLength).join(path.sep);
}
function rebasePath(projectPath, oldBase, newBase) {
    const normalized = path.normalize(projectPath);
    const normalizedOld = path.normalize(oldBase);
    const prefix = normalizedOld + path.sep;
    if (normalized.startsWith(prefix)) {
        return path.join(newBase, normalized.slice(prefix.length));
    }
    if (normalized === normalizedOld) {
        return newBase;
    }
    return normalized;
}
function deepCloneGroupWithRebase(group, oldBase, newBase, newName) {
    return {
        kind: "group",
        id: crypto.randomUUID(),
        name: newName,
        personalization: cloneNodePersonalization(group.personalization),
        children: group.children.map((child) => {
            if (child.kind === "group") {
                return deepCloneGroupWithRebase(child, oldBase, newBase, child.name);
            }
            else {
                return {
                    kind: "project",
                    id: crypto.randomUUID(),
                    name: child.name,
                    projectPath: rebasePath(child.projectPath, oldBase, newBase),
                    scripts: child.scripts?.map(cloneProjectScript),
                    personalization: cloneNodePersonalization(child.personalization)
                };
            }
        })
    };
}
function cloneProjectScript(script) {
    return script.kind === "package"
        ? {
            kind: "package",
            id: crypto.randomUUID(),
            scriptName: script.scriptName
        }
        : {
            kind: "custom",
            id: crypto.randomUUID(),
            name: script.name,
            command: script.command
        };
}
function findParentGroupIdForNode(nodes, targetId, currentParentId = undefined) {
    for (const node of nodes) {
        if (node.id === targetId) {
            return { found: true, parentId: currentParentId };
        }
        if (node.kind === "group") {
            const result = findParentGroupIdForNode(node.children, targetId, node.id);
            if (result.found) {
                return result;
            }
        }
    }
    return { found: false };
}
function normalizeRootData(value) {
    const record = asRecord(value, "The selected file does not contain a valid Shelfy configuration.");
    if (record.version !== 2) {
        throw new Error(`Unsupported configuration version "${String(record.version)}".`);
    }
    if (!Array.isArray(record.children)) {
        throw new Error("The selected configuration is missing its project tree.");
    }
    const usedIds = new Set();
    const projectPaths = new Set();
    return {
        version: 2,
        children: normalizeNodes(record.children, usedIds, projectPaths, "root")
    };
}
function normalizeNodes(value, usedIds, projectPaths, location) {
    if (!Array.isArray(value)) {
        throw new Error(`Expected an array of items at ${location}.`);
    }
    return value.map((node, index) => normalizeNode(node, usedIds, projectPaths, `${location}[${index}]`));
}
function normalizeNode(value, usedIds, projectPaths, location) {
    const record = asRecord(value, `Invalid item at ${location}.`);
    if (record.kind === "group") {
        return {
            kind: "group",
            id: getUniqueId(record.id, usedIds),
            name: readNonEmptyString(record.name, `Group name at ${location}`),
            children: normalizeNodes(record.children ?? [], usedIds, projectPaths, `${location}.children`),
            personalization: normalizeOptionalNodePersonalization(record.personalization, `${location}.personalization`)
        };
    }
    if (record.kind === "project") {
        const projectPath = normalizeProjectPath(readNonEmptyString(record.projectPath, `Project path at ${location}`));
        if (projectPaths.has(projectPath)) {
            throw new Error(`Duplicate project path in import file: "${projectPath}".`);
        }
        projectPaths.add(projectPath);
        return {
            kind: "project",
            id: getUniqueId(record.id, usedIds),
            name: readNonEmptyString(record.name, `Project name at ${location}`),
            projectPath,
            scripts: normalizeProjectScripts(record.scripts ?? [], usedIds, `${location}.scripts`),
            personalization: normalizeOptionalNodePersonalization(record.personalization, `${location}.personalization`)
        };
    }
    throw new Error(`Unsupported item kind at ${location}.`);
}
function normalizeProjectScripts(value, usedIds, location) {
    if (!Array.isArray(value)) {
        throw new Error(`Expected an array of scripts at ${location}.`);
    }
    const seenScripts = new Set();
    const scripts = [];
    for (let index = 0; index < value.length; index += 1) {
        const script = normalizeProjectScript(value[index], usedIds, `${location}[${index}]`);
        const scriptKey = script.kind === "package" ? `package:${script.scriptName}` : `custom:${script.command}`;
        if (seenScripts.has(scriptKey)) {
            throw new Error(`Duplicate script entry at ${location}: "${scriptKey}".`);
        }
        seenScripts.add(scriptKey);
        scripts.push(script);
    }
    return scripts;
}
function normalizeProjectScript(value, usedIds, location) {
    const record = asRecord(value, `Invalid script at ${location}.`);
    if (record.kind === "package") {
        return {
            kind: "package",
            id: getUniqueId(record.id, usedIds),
            scriptName: readNonEmptyString(record.scriptName, `Package script name at ${location}`)
        };
    }
    if (record.kind === "custom") {
        return {
            kind: "custom",
            id: getUniqueId(record.id, usedIds),
            name: readNonEmptyString(record.name, `Custom script name at ${location}`),
            command: readNonEmptyString(record.command, `Custom script command at ${location}`)
        };
    }
    throw new Error(`Unsupported script kind at ${location}.`);
}
function normalizeOptionalNodePersonalization(value, location) {
    if (value === undefined) {
        return undefined;
    }
    const record = asRecord(value, `Invalid personalization at ${location}.`);
    const color = readOptionalColor(record.color, `${location}.color`);
    const icon = readOptionalFontAwesomeIcon(record.icon, `${location}.icon`);
    return (0, personalization_1.normalizeNodePersonalization)({ color, icon });
}
function readOptionalColor(value, label) {
    if (value === undefined) {
        return undefined;
    }
    const color = readNonEmptyString(value, label);
    if (!(0, projectColor_1.isColorValue)(color)) {
        throw new Error(`${label} must be a valid color value.`);
    }
    return color;
}
function readOptionalFontAwesomeIcon(value, label) {
    if (value === undefined) {
        return undefined;
    }
    const iconName = readNonEmptyString(value, label);
    if (!(0, personalization_1.isKnownFontAwesomeIcon)(iconName)) {
        throw new Error(`${label} must be a valid Font Awesome Free Solid icon name.`);
    }
    return iconName;
}
function asRecord(value, message) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(message);
    }
    return value;
}
function readNonEmptyString(value, label) {
    if (typeof value !== "string") {
        throw new Error(`${label} must be a non-empty string.`);
    }
    const normalized = value.trim();
    if (normalized.length === 0) {
        throw new Error(`${label} must be a non-empty string.`);
    }
    return normalized;
}
function getUniqueId(value, usedIds) {
    const preferred = typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
    if (preferred && !usedIds.has(preferred)) {
        usedIds.add(preferred);
        return preferred;
    }
    let generated = crypto.randomUUID();
    while (usedIds.has(generated)) {
        generated = crypto.randomUUID();
    }
    usedIds.add(generated);
    return generated;
}
function findNodeById(nodes, nodeId) {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }
        if (node.kind === "group") {
            const nested = findNodeById(node.children, nodeId);
            if (nested) {
                return nested;
            }
        }
    }
    return undefined;
}
function cloneNodePersonalization(personalization) {
    return (0, personalization_1.normalizeNodePersonalization)(personalization);
}
//# sourceMappingURL=store.js.map