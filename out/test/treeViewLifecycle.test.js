"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const treeBehavior_1 = require("../treeBehavior");
const vscode_mock_1 = require("./vscode-mock");
class EventEmitter {
    constructor() {
        this.listeners = new Set();
        this.event = (listener) => {
            this.listeners.add(listener);
            return { dispose: () => this.listeners.delete(listener) };
        };
    }
    fire(event) {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
class DataTransferItem {
    constructor(value) {
        this.value = value;
    }
    async asString() {
        return this.value;
    }
}
async function createHost(legacyDisposal) {
    const commands = new Map();
    const contexts = new Map();
    const data = {
        version: 2,
        children: [
            { kind: "group", id: "source", name: "Source", children: [
                    { kind: "group", id: "nested", name: "Nested", children: [] }
                ] },
            { kind: "group", id: "target", name: "Target", children: [] }
        ]
    };
    const state = new Map([["shelfy.data.v2", data]]);
    const liveViews = new Map();
    let registrations = 0;
    let filterInput;
    const disposable = () => ({ dispose() { } });
    Object.assign(vscode_mock_1.vscodeMock, {
        EventEmitter,
        TreeItem: class {
            constructor(label) {
                this.label = label;
            }
        },
        ThemeIcon: class {
            constructor(id) {
                this.id = id;
            }
        },
        ThemeColor: class {
        },
        TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
        StatusBarAlignment: { Left: 1 },
        Uri: { file: (fsPath) => ({ fsPath }) },
        RelativePattern: class {
        },
        DataTransferItem,
        window: {
            createTreeView: (id, options) => {
                // The host snapshots MIME types at registration, not on each gesture.
                const registered = {
                    ...options,
                    dragAndDropController: options.dragAndDropController && {
                        dragMimeTypes: [...options.dragAndDropController.dragMimeTypes],
                        dropMimeTypes: [...options.dragAndDropController.dropMimeTypes],
                        handleDrag: options.dragAndDropController.handleDrag?.bind(options.dragAndDropController),
                        handleDrop: options.dragAndDropController.handleDrop?.bind(options.dragAndDropController)
                    }
                };
                liveViews.set(id, registered);
                registrations += 1;
                return {
                    message: undefined,
                    onDidExpandElement: disposable,
                    onDidCollapseElement: disposable,
                    async dispose() {
                        // Cursor's old callback resumes after a replacement has registered.
                        await Promise.resolve();
                        if (legacyDisposal || liveViews.get(id) === registered) {
                            liveViews.delete(id);
                        }
                    }
                };
            },
            createStatusBarItem: () => ({ show() { }, hide() { }, dispose() { } }),
            showInputBox: async () => filterInput,
            showInformationMessage: async () => undefined,
            showErrorMessage: async () => strict_1.default.fail("Unexpected extension error")
        },
        commands: {
            registerCommand: (id, callback) => {
                commands.set(id, callback);
                return disposable();
            },
            executeCommand: async (id, ...args) => {
                if (id === "setContext") {
                    contexts.set(args[0], args[1]);
                }
                return commands.get(id)?.(...args);
            }
        },
        workspace: {
            ...vscode_mock_1.vscodeMock.workspace,
            fs: { createDirectory: async () => undefined },
            onDidChangeConfiguration: disposable,
            onDidChangeWorkspaceFolders: disposable,
            createFileSystemWatcher: () => ({
                onDidChange: disposable, onDidCreate: disposable, onDidDelete: disposable, dispose() { }
            })
        }
    });
    const context = {
        subscriptions: [],
        globalStorageUri: { fsPath: "/unused-shelfy-test-storage" },
        globalState: {
            get: (key) => state.get(key),
            update: async (key, value) => { state.set(key, value); }
        },
        workspaceState: {
            get: (_key, fallback) => fallback,
            update: async () => undefined
        }
    };
    // Load after configuring the mock: the real activation registers real commands.
    const { activate } = await import("../extension.js");
    await activate(context);
    async function command(id) {
        const callback = commands.get(id);
        strict_1.default.ok(callback, `Expected command ${id}`);
        await callback();
        await new Promise((resolve) => setImmediate(resolve));
    }
    function view() {
        const registered = liveViews.get("shelfyView");
        strict_1.default.ok(registered, "Shelfy tree must remain registered after mode changes");
        return registered;
    }
    return {
        command, view, contexts, data, context,
        registrations: () => registrations,
        setFilterInput: (value) => { filterInput = value; }
    };
}
for (const legacyDisposal of [true, false]) {
    (0, node_test_1.default)(`edit/filter commands keep the tree registered (${legacyDisposal ? "Cursor" : "VS Code"} disposal)`, async () => {
        const host = await createHost(legacyDisposal);
        const initialView = host.view();
        for (let i = 0; i < 3; i += 1) {
            await host.command("shelfy.enableEditMode");
            strict_1.default.strictEqual(host.view(), initialView);
            strict_1.default.equal(host.contexts.get("shelfy.editMode"), true);
            await host.command("shelfy.disableEditMode");
            strict_1.default.strictEqual(host.view(), initialView);
        }
        await host.command("shelfy.enableEditMode");
        host.setFilterInput("Nested");
        await host.command("shelfy.setFilter");
        strict_1.default.strictEqual(host.view(), initialView);
        strict_1.default.equal(host.contexts.get("shelfy.editMode"), false);
        strict_1.default.equal(host.contexts.get("shelfy.hasFilter"), true);
        await host.command("shelfy.enableEditMode");
        strict_1.default.equal(host.contexts.get("shelfy.editMode"), false);
        await host.command("shelfy.clearFilter");
        await host.command("shelfy.enableEditMode");
        strict_1.default.strictEqual(host.view(), initialView);
        strict_1.default.equal(host.registrations(), 1);
        strict_1.default.equal((await initialView.treeDataProvider.getChildren())?.length, 2);
        for (const subscription of host.context.subscriptions) {
            subscription.dispose();
        }
        await new Promise((resolve) => setImmediate(resolve));
        strict_1.default.throws(() => host.view(), /remain registered/);
    });
}
(0, node_test_1.default)("registered drag/drop works only in edit mode, including after filtering", async () => {
    const host = await createHost(true);
    const registered = host.view();
    const controller = registered.dragAndDropController;
    strict_1.default.ok(controller, "Drag/drop must be registered before edit mode is enabled");
    strict_1.default.deepEqual(controller.dragMimeTypes, [treeBehavior_1.SHELFY_TREE_MIME]);
    strict_1.default.deepEqual(controller.dropMimeTypes, [treeBehavior_1.SHELFY_TREE_MIME]);
    const roots = await registered.treeDataProvider.getChildren();
    strict_1.default.ok(roots);
    const source = roots[0];
    const target = roots[1];
    const children = await registered.treeDataProvider.getChildren(source);
    strict_1.default.ok(children);
    const nested = children[0];
    const transfer = new Map();
    const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() { } }) };
    const incoming = new Map([[treeBehavior_1.SHELFY_TREE_MIME, new DataTransferItem(JSON.stringify({ nodeId: "nested", nodeKind: "group" }))]]);
    await controller.handleDrag?.([nested], transfer, token);
    strict_1.default.equal(transfer.get(treeBehavior_1.SHELFY_TREE_MIME), undefined);
    await controller.handleDrop?.(target, incoming, token);
    strict_1.default.equal(source.group.children.length, 1);
    await host.command("shelfy.enableEditMode");
    await controller.handleDrag?.([nested], transfer, token);
    strict_1.default.ok(transfer.get(treeBehavior_1.SHELFY_TREE_MIME));
    await controller.handleDrop?.(target, transfer, token);
    strict_1.default.equal(source.group.children.length, 0);
    strict_1.default.equal(target.group.children[0]?.id, "nested");
    host.setFilterInput("Nested");
    await host.command("shelfy.setFilter");
    await controller.handleDrop?.(undefined, transfer, token);
    strict_1.default.equal(target.group.children.length, 1);
    await host.command("shelfy.clearFilter");
    await host.command("shelfy.enableEditMode");
    await controller.handleDrop?.(undefined, transfer, token);
    strict_1.default.equal(target.group.children.length, 0);
    strict_1.default.equal(host.data.children[2]?.id, "nested");
    await host.command("shelfy.disableEditMode");
    await controller.handleDrop?.(source, transfer, token);
    strict_1.default.equal(source.group.children.length, 0);
    strict_1.default.equal(host.data.children[2]?.id, "nested");
});
//# sourceMappingURL=treeViewLifecycle.test.js.map