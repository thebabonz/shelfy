# Shelfy

Manage and organize project folders globally in Visual Studio Code — independent of your current workspace.

## ✨ Features

- 📁 Save project directories globally (not tied to any workspace)
- 🗂 Organize projects into virtual groups and nested folders
- 🎨 Display project color based on:

.vscode/settings.json → workbench.colorCustomizations → titleBar.activeBackground

or Peacock workspace color:

.vscode/settings.json → peacock.color

- 🔄 Auto-refresh project color when settings change
- 🧲 Drag & drop to reorder and regroup projects
- 🚫 Prevent duplicate project paths
- ⚡ Quick open projects directly from the sidebar
- 💾 Import or export the full folders, projects, and scripts configuration as JSON

---

## 📸 Preview

> I will add a screenshot here later (maybe)

---

## 🚀 Usage

### Add a project

1. Open the **Shelfy** view in the Activity Bar
2. Click **Add Project**
3. Select a folder

### Organize projects

- Right-click to:
- Add groups
- Rename folders
- Rename projects
- Remove items
- Drag & drop:
- Move projects between groups
- Reorder items
- Nest groups
- Sort mode button in the view title cycles: none -> ascending -> descending
- Sorting applies to groups and items within each group

### Open a project

- Click a project row → behavior is controlled by `shelfy.clickAction`
- Use inline actions to open in current window or new window directly

### Import or export configuration

- Use the Command Palette commands `Export Configuration` and `Import Configuration` to save or restore the full folders, projects, and scripts setup as JSON
- Importing a JSON file replaces the current saved configuration

### Configure click behavior

Set `shelfy.clickAction` in VS Code settings:

- `noAction`: clicking a row does nothing
- `openSameInstance` (default): clicking a row opens in current window
- `openNewInstance`: clicking a row opens in a new window

Optional setting:

- `shelfy.showProjectPath`: shows the folder path below the project name in the tree view

Legacy `globalProjects.*` settings are still supported for existing installs.

---

## 🎨 Project Colors

If your project contains:

```json
{
  "workbench.colorCustomizations": {
    "titleBar.activeBackground": "#ff0000"
  }
}
```
