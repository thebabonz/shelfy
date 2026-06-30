# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Shelfy** is a VS Code extension that allows users to save and organize project directories globally across workspaces. It provides a sidebar view for managing projects, groups (folders), and associated scripts.

## Commands

- **`npm run compile`** — Compile TypeScript to JavaScript (output in `out/` directory)
- **`npm run watch`** — Watch TypeScript files and auto-compile on changes
- **`npm run test`** — Run tests (requires compile first, runs tests in `out/test/`)
- **`npm run package`** — Package the extension as a .vsix file using vsce

## Architecture

### Entry Point & Command Registration
- **[extension.ts](src/extension.ts)** — Main entry point. Registers all ~30 commands, initializes the tree view provider, and orchestrates the UI state (edit mode, sorting, filtering).

### Data Model
- **[model.ts](src/model.ts)** — Defines immutable data structures:
  - `RootData` — top-level container with version and children array
  - `NodeData` = `GroupNodeData | ProjectNodeData` — represents folders or projects
  - `GroupNodeData` — virtual folder that can contain other groups or projects
  - `ProjectNodeData` — saved project with path, optional scripts, and personalization
  - `ProjectScriptData` — either a package.json script or custom command
  - `NodePersonalization` — optional color and FontAwesome icon

### Storage & State Management
- **[store.ts](src/store.ts)** — `ProjectStore` class encapsulates all data persistence:
  - Reads/writes from VS Code's global state (key: `shelfy.data.v2`, legacy key: `globalProjects.data.v2`)
  - Provides methods for CRUD operations (add, rename, remove groups/projects/scripts)
  - Handles import/export as JSON
  - Validates uniqueness of project paths
  - Contains utility functions for tree traversal (find by ID, parent lookup, etc.)

### Tree View Provider
- **[tree.ts](src/tree.ts)** — `ShelfyProvider` implements VS Code's `TreeDataProvider` and `TreeDragAndDropController`:
  - Converts model data into tree item hierarchy (`GroupItem`, `ProjectItem`, `ScriptItem`)
  - Manages UI state: expanded groups, sort mode, filter text, edit mode
  - Handles drag-and-drop operations
  - Tracks group expansion in extension context (persisted in global state)

### Configuration & Filtering
- **[config.ts](src/config.ts)** — Settings helpers (e.g., `clickAction`, `showProjectPath`)
- **[treeFilter.ts](src/treeFilter.ts)** — Tree filtering logic; searches across group names, project names, paths, and script commands

### Personalization
- **[personalization.ts](src/personalization.ts)** — Handles icon and color normalization; integrates with FontAwesome icons
- **[personalizationEditor.ts](src/personalizationEditor.ts)** — Webview UI for editing colors and icons (color picker + icon selector)
- **[projectColor.ts](src/projectColor.ts)** — Detects project colors from `.vscode/settings.json` (Peacock or titleBar.activeBackground)

### Project Scripts
- **[projectScripts.ts](src/projectScripts.ts)** — Reads package.json scripts and resolves script commands (npm/yarn/pnpm detection)
- **[projectScriptState.ts](src/projectScriptState.ts)** — Manages adding/updating/removing scripts in a project's data

### UI Behavior
- **[treeBehavior.ts](src/treeBehavior.ts)** — Centralizes drag-and-drop MIME types, move validation, and edit mode constraints (e.g., can't edit while filtering)

## Key Behavioral Patterns

1. **Edit Mode** — Tree is only editable when `editMode=true` AND there is no active filter. This prevents accidental edits while filtered.
2. **Tree Refresh** — Whenever data changes (add/rename/remove), call `provider.refresh()` to trigger a full tree re-render.
3. **Drag & Drop** — Controlled via `TreeDragAndDropController`. Projects/groups can be reordered within their parent, or moved to different groups.
4. **Sorting** — Cycles through none → ascending → descending. Applies within each group's children independently.
5. **Context Values** — Used in package.json menus to show/hide commands based on node type (`group`, `project`, `script`) and state (editMode, hasFilter, hasPersonalization).

## Extension Context Flags

The extension uses VS Code context flags for command visibility:
- `shelfy.editMode` — true when editing is enabled
- `shelfy.sortMode` — current sort mode ("none" | "asc" | "desc")
- `shelfy.clickAction` — project row click behavior
- `shelfy.hasFilter` — true if filter is active

## Testing

Tests are minimal. The only test file is:
- **[test/editModeBehavior.test.ts](src/test/editModeBehavior.test.ts)** — Unit tests for edit mode constraints

Run with `npm test` (requires prior `npm run compile`).

## Common Development Tasks

### Adding a New Command
1. Add command definition to `contributes.commands` in `package.json`
2. Register handler in `extension.ts` using `registerShelfyCommand` (handles both new and legacy command names)
3. If it requires tree editable state, wrap with `requireTreeEditable()` helper
4. Call `provider.refresh()` if data changed

### Adding a Project Script Type
1. Add new type variant to `ProjectScriptData` union in `model.ts`
2. Update `store.ts` normalization/validation if needed
3. Update `projectScriptState.ts` if script handling differs
4. Update `extension.ts` script picker logic

### Handling Personalization Changes
1. Update `NodePersonalization` type in `model.ts` if adding new properties
2. Modify `personalization.ts` normalization logic
3. Update `personalizationEditor.ts` UI to expose new fields
4. Ensure tree item rendering in `tree.ts` reflects changes
