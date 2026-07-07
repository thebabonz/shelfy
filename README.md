# Shelfy

Manage and organize project folders globally in Visual Studio Code — independent of your current workspace.

## ✨ Features

- 📁 Save project directories globally (not tied to any workspace)
- 🗂 Organize projects into virtual groups and nested folders
- ✏️ Toggle edit mode so day-to-day opening stays separate from list editing
- 🌐 **Choose storage location**: profile-specific or globally shared across VS Code profiles
- 🎨 Display project color based on:

.vscode/settings.json → workbench.colorCustomizations → titleBar.activeBackground

or Peacock workspace color:

.vscode/settings.json → peacock.color

- 🔄 Auto-refresh project color when settings change
- 🧩 Personalize folders and projects with custom colors and Font Awesome icons
- 🧲 Drag & drop to reorder and regroup projects
- ↕️ Move folders, projects, and scripts up or down from the context menu
- 🚫 Prevent duplicate project paths
- ⚠️ Show missing project folders and relink them with **Change Project Folder...**
- ⚡ Quick open projects directly from the sidebar
- 🗂 **Open in Explorer** button to reveal a project or group in the OS file manager (configurable)
- 📂 **Open Folder** button on groups to add all their projects to the VS Code workspace (configurable)
- ▶️ Add, edit, and run project scripts from the sidebar
- 💾 Import or export the full folders, projects, and scripts configuration as JSON
- 📥 Import projects from the **Project Manager** extension (tags as folders)

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

- Click **Enable Edit Mode** in the Shelfy view title before changing the tree
- Right-click folders or projects to add folders, add projects, rename, personalize, move, relink, or remove items
- Use **Move Up** and **Move Down** to reorder folders and projects within their current level
- Use **Move to Folder...** or drag and drop to move projects and folders between virtual folders
- Use drag and drop to reorder items and nest groups
- Sort mode button in the view title cycles: none -> ascending -> descending
- Sorting applies to groups and items within each group
- Filtering disables edit mode until the filter is cleared

### Open a project

- Click a project row -> behavior is controlled by `shelfy.clickAction`
- Use the **Open Project** inline action to get a prompt asking whether to open in the current window or a new window
- Use the **Open in New Window** inline action to skip the prompt and always open in a new window
- Use the **Open Folder** inline action (groups only) to get the same prompt — choosing **this window** adds all projects in the group to the current VS Code workspace; choosing **new window** opens the first reachable project in a new window
- Use the **Open in Explorer** inline button to reveal the project folder in the OS file manager (available on both projects and groups — on a group, reveals the first reachable project folder)
- Missing folders are shown with a warning icon; open actions are disabled until the path is fixed

### Fix a missing project folder

If a saved folder was moved, renamed, or deleted, Shelfy marks the project as missing.

1. Click **Enable Edit Mode**
2. Right-click the missing project
3. Choose **Change Project Folder...**
4. Select the new folder location

The project keeps its display name, scripts, personalization, and position.

### Run project scripts

- Right-click a project in edit mode and choose **Add Script**
- Add scripts from `package.json` or enter a custom terminal command
- Outside edit mode, click a script row or use **Run Script** to run it in a terminal
- Use **Move Up** and **Move Down** to reorder scripts within their project

### Personalize items

- In edit mode, use **Edit Personalization** on folders or projects
- Set a custom color, a Font Awesome Free Solid icon, or both
- Use **Revert Personalization** to return to the default icon/color behavior

### Import or export configuration

- Use the Command Palette commands `Export Configuration` and `Import Configuration` to save or restore the full folders, projects, and scripts setup as JSON
- Importing a JSON file replaces the current saved configuration

### Import from Project Manager

- Use the Command Palette command `Import from Project Manager` to import projects from the [Project Manager](https://marketplace.visualstudio.com/items?itemName=alefragnani.project-manager) extension
- Tags become Shelfy folders; projects within each tag are placed inside the corresponding folder
- Projects with no tags are added at the root level
- Importing replaces the current saved configuration

### Configure click behavior

Set `shelfy.clickAction` in VS Code settings:

- `noAction`: clicking a row does nothing
- `openSameInstance` (default): clicking a row opens in current window
- `openNewInstance`: clicking a row opens in a new window

Optional settings:

- `shelfy.confirmOnClick`: show a confirmation dialog before opening a project on click. The message reflects the configured action:
  - With `openSameInstance`: _"Open 'ProjectName' in this window?"_
  - With `openNewInstance`: _"Open 'ProjectName' in a new window?"_
- `shelfy.showProjectPath`: shows the folder path below the project name in the tree view
- `shelfy.showOpenInExplorer` (default: `true`): show or hide the **Open in Explorer** inline button that reveals the project folder in the OS file manager (Windows Explorer / macOS Finder). Appears on both project rows and group rows.
- `shelfy.showRevealInVSCodeExplorer` (default: `false`): show or hide the **Open Folder** inline button. Appears on group rows only — adds all projects in the group to the current VS Code workspace and opens the Explorer panel.
- `shelfy.storageMode`: choose where to store Shelfy data:
  - `profile` (default) — Store data per VS Code profile (isolated between profiles)
  - `global` — Store data globally, shared across all VS Code profiles

Legacy `globalProjects.*` settings are still supported for existing installs.

---

## 💾 Storage Modes

### Profile Mode (Default)

Data is stored per VS Code profile, meaning each profile has its own separate list of projects and settings. This is useful if you want different project lists for different workflows.

### Global Mode

Data is stored in VS Code's global storage directory, shared across all profiles. This is ideal if you want to maintain a single consistent project list across all your VS Code profiles and instances.

**To switch between modes:**

1. Open VS Code Settings (Cmd/Ctrl + ,)
2. Search for `shelfy.storageMode`
3. Select either `profile` or `global`
4. Extension will automatically migrate your data to the new storage location

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
