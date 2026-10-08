import assert from "node:assert/strict";
import test from "node:test";
import type * as vscode from "vscode";
import type { RootData } from "../model";
import type { GroupItem, ProjectItem, ScriptItem } from "../tree";
import { SHELFY_TREE_MIME } from "../treeBehavior";
import { vscodeMock } from "./vscode-mock";

type Item = GroupItem | ProjectItem | ScriptItem;

class EventEmitter<T> {
  private readonly listeners = new Set<(event: T) => unknown>();
  readonly event = (listener: (event: T) => unknown) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

class DataTransferItem {
  constructor(readonly value: string) {}
  async asString(): Promise<string> {
    return this.value;
  }
}

async function createHost(legacyDisposal: boolean) {
  const commands = new Map<string, (...args: unknown[]) => unknown>();
  const contexts = new Map<string, unknown>();
  const data: RootData = {
    version: 2,
    children: [
      { kind: "group", id: "source", name: "Source", children: [
        { kind: "group", id: "nested", name: "Nested", children: [] }
      ] },
      { kind: "group", id: "target", name: "Target", children: [] }
    ]
  };
  const state = new Map<string, unknown>([["shelfy.data.v2", data]]);
  const liveViews = new Map<string, vscode.TreeViewOptions<Item>>();
  let registrations = 0;
  let filterInput: string | undefined;
  const disposable = () => ({ dispose() {} });

  Object.assign(vscodeMock, {
    EventEmitter,
    TreeItem: class { constructor(readonly label: string) {} },
    ThemeIcon: class { constructor(readonly id: string) {} },
    ThemeColor: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    StatusBarAlignment: { Left: 1 },
    Uri: { file: (fsPath: string) => ({ fsPath }) },
    RelativePattern: class {},
    DataTransferItem,
    window: {
      createTreeView: (id: string, options: vscode.TreeViewOptions<Item>) => {
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
      createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
      showInputBox: async () => filterInput,
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => assert.fail("Unexpected extension error")
    },
    commands: {
      registerCommand: (id: string, callback: (...args: unknown[]) => unknown) => {
        commands.set(id, callback);
        return disposable();
      },
      executeCommand: async (id: string, ...args: unknown[]) => {
        if (id === "setContext") {
          contexts.set(args[0] as string, args[1]);
        }
        return commands.get(id)?.(...args);
      }
    },
    workspace: {
      ...vscodeMock.workspace,
      fs: { createDirectory: async () => undefined },
      onDidChangeConfiguration: disposable,
      onDidChangeWorkspaceFolders: disposable,
      createFileSystemWatcher: () => ({
        onDidChange: disposable, onDidCreate: disposable, onDidDelete: disposable, dispose() {}
      })
    }
  });

  const context = {
    subscriptions: [],
    globalStorageUri: { fsPath: "/unused-shelfy-test-storage" },
    globalState: {
      get: (key: string) => state.get(key),
      update: async (key: string, value: unknown) => { state.set(key, value); }
    },
    workspaceState: {
      get: (_key: string, fallback: unknown) => fallback,
      update: async () => undefined
    }
  } as unknown as vscode.ExtensionContext;

  // Load after configuring the mock: the real activation registers real commands.
  const { activate } = await import("../extension.js");
  await activate(context);

  async function command(id: string): Promise<void> {
    const callback = commands.get(id);
    assert.ok(callback, `Expected command ${id}`);
    await callback();
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  function view(): vscode.TreeViewOptions<Item> {
    const registered = liveViews.get("shelfyView");
    assert.ok(registered, "Shelfy tree must remain registered after mode changes");
    return registered;
  }

  return {
    command, view, contexts, data, context,
    registrations: () => registrations,
    setFilterInput: (value: string) => { filterInput = value; }
  };
}

for (const legacyDisposal of [true, false]) {
  test(`edit/filter commands keep the tree registered (${legacyDisposal ? "Cursor" : "VS Code"} disposal)`, async () => {
    const host = await createHost(legacyDisposal);
    const initialView = host.view();
    for (let i = 0; i < 3; i += 1) {
      await host.command("shelfy.enableEditMode");
      assert.strictEqual(host.view(), initialView);
      assert.equal(host.contexts.get("shelfy.editMode"), true);
      await host.command("shelfy.disableEditMode");
      assert.strictEqual(host.view(), initialView);
    }
    await host.command("shelfy.enableEditMode");
    host.setFilterInput("Nested");
    await host.command("shelfy.setFilter");
    assert.strictEqual(host.view(), initialView);
    assert.equal(host.contexts.get("shelfy.editMode"), false);
    assert.equal(host.contexts.get("shelfy.hasFilter"), true);
    await host.command("shelfy.enableEditMode");
    assert.equal(host.contexts.get("shelfy.editMode"), false);
    await host.command("shelfy.clearFilter");
    await host.command("shelfy.enableEditMode");
    assert.strictEqual(host.view(), initialView);
    assert.equal(host.registrations(), 1);
    assert.equal((await initialView.treeDataProvider.getChildren())?.length, 2);

    for (const subscription of host.context.subscriptions) {
      subscription.dispose();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.throws(() => host.view(), /remain registered/);
  });
}

test("registered drag/drop works only in edit mode, including after filtering", async () => {
  const host = await createHost(true);
  const registered = host.view();
  const controller = registered.dragAndDropController;
  assert.ok(controller, "Drag/drop must be registered before edit mode is enabled");
  assert.deepEqual(controller.dragMimeTypes, [SHELFY_TREE_MIME]);
  assert.deepEqual(controller.dropMimeTypes, [SHELFY_TREE_MIME]);
  const roots = await registered.treeDataProvider.getChildren();
  assert.ok(roots);
  const source = roots[0] as GroupItem;
  const target = roots[1] as GroupItem;
  const children = await registered.treeDataProvider.getChildren(source);
  assert.ok(children);
  const nested = children[0];
  const transfer = new Map() as unknown as vscode.DataTransfer;
  const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose() {} }) };
  const incoming = new Map([[SHELFY_TREE_MIME, new DataTransferItem(JSON.stringify({ nodeId: "nested", nodeKind: "group" }))]]) as unknown as vscode.DataTransfer;

  await controller.handleDrag?.([nested], transfer, token);
  assert.equal(transfer.get(SHELFY_TREE_MIME), undefined);
  await controller.handleDrop?.(target, incoming, token);
  assert.equal(source.group.children.length, 1);
  await host.command("shelfy.enableEditMode");
  await controller.handleDrag?.([nested], transfer, token);
  assert.ok(transfer.get(SHELFY_TREE_MIME));
  await controller.handleDrop?.(target, transfer, token);
  assert.equal(source.group.children.length, 0);
  assert.equal(target.group.children[0]?.id, "nested");

  host.setFilterInput("Nested");
  await host.command("shelfy.setFilter");
  await controller.handleDrop?.(undefined, transfer, token);
  assert.equal(target.group.children.length, 1);
  await host.command("shelfy.clearFilter");
  await host.command("shelfy.enableEditMode");
  await controller.handleDrop?.(undefined, transfer, token);
  assert.equal(target.group.children.length, 0);
  assert.equal(host.data.children[2]?.id, "nested");
  await host.command("shelfy.disableEditMode");
  await controller.handleDrop?.(source, transfer, token);
  assert.equal(source.group.children.length, 0);
  assert.equal(host.data.children[2]?.id, "nested");
});
