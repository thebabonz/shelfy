# Change Log

All notable changes to the "Shelfy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

- **Open in Explorer button** (`shelfy.showOpenInExplorer` setting, default: `true`): inline button on project and group rows that reveals the folder in the OS file manager (Windows Explorer / macOS Finder). On a group row, opens the first reachable project folder. Can be hidden by setting `shelfy.showOpenInExplorer` to `false`.

- **Open Folder button** (`shelfy.showRevealInVSCodeExplorer` setting, default: `false`): inline button on group rows only. Adds all projects in the group to the current VS Code workspace and switches to the Explorer panel. Enable by setting `shelfy.showRevealInVSCodeExplorer` to `true`.

- **Confirm on Click** (`shelfy.confirmOnClick` setting): optionally show a confirmation dialog before opening a project on row click. The message reflects the configured `shelfy.clickAction` (e.g. _"Open in this window?"_ or _"Open in a new window?"_).

- **Storage Mode Configuration** (`shelfy.storageMode` setting):
  - `profile` (default) — Store data per VS Code profile (isolated between profiles)
  - `global` — Store data globally in VS Code's global storage (shared across all profiles)
  - Automatic data migration between modes
  - Useful for maintaining consistent project lists across multiple VS Code profiles

### Initial Features

- Save and organize project directories globally
- Group projects into virtual folders with drag-and-drop support
- Custom colors and icons for projects/groups
- Package.json scripts integration
- Custom project scripts
- Project color detection from workspace settings (Peacock support)
- Import/export configuration as JSON
- Full-text filtering of projects, groups, and scripts
