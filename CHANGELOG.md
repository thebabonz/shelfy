# Change Log

All notable changes to the "Shelfy" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

### Added

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
