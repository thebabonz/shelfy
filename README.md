# Global Projects

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

---

## 📸 Preview

> Add a screenshot here later (optional)

---

## 🚀 Usage

### Add a project

1. Open the **Global Projects** view in the Activity Bar
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

- Click a project row → behavior is controlled by `globalProjects.clickAction`
- Use inline actions to open in current window or new window directly

### Configure click behavior

Set `globalProjects.clickAction` in VS Code settings:

- `noAction`: clicking a row does nothing
- `openSameInstance` (default): clicking a row opens in current window
- `openNewInstance`: clicking a row opens in a new window

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
