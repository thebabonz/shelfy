import * as vscode from "vscode";
import type { NodePersonalization } from "./model";
import { getFontAwesomeIcon, getFontAwesomeQuickPickIcons } from "./personalization";
import { isColorValue } from "./projectColor";

export type PersonalizationEditorOptions = {
  label: string;
  kind: "group" | "project";
  personalization?: NodePersonalization;
  projectConfigColor?: string;
};

export type PersonalizationEditorResult = {
  color: string | null;
  icon: string | null;
};

type PersonalizationEditorSaveValue = {
  color?: unknown;
  icon?: unknown;
};

type PersonalizationEditorMessage =
  | {
      type: "cancel";
    }
  | {
      type: "ready";
    }
  | {
      type: "save";
      value?: PersonalizationEditorSaveValue;
    };

type WebviewIconOption = {
  iconName: string;
  label: string;
  description: string;
  searchText: string;
  svgMarkup: string;
};

const PREVIEW_FALLBACK_COLOR = "#888888";

const CLEAR_BUTTON_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
  '  <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  "</svg>"
].join("");

const COLOR_SWATCH_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true" focusable="false">',
  '  <rect x="2" y="2" width="12" height="12" rx="3" ry="3" fill="currentColor" stroke="#888888" stroke-width="1"/>',
  "</svg>"
].join("");

const DEFAULT_PROJECT_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
  '  <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l1.6 2H18.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" fill="currentColor" opacity="0.18"/>',
  '  <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H18.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  '  <path d="M3 8l2.5-3h4.8L12 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  "</svg>"
].join("");

const DEFAULT_GROUP_SVG = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
  '  <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10l1.6 2H18A2 2 0 0 1 20 8v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  '  <path d="M4 9.5A2.5 2.5 0 0 1 6.5 7H17.5A2.5 2.5 0 0 1 20 9.5v7A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  '  <path d="M8 11.5h8M8 14.5h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  "</svg>"
].join("");

const webviewIconOptions: readonly WebviewIconOption[] = getFontAwesomeQuickPickIcons()
  .map((option) => {
    const svgMarkup = buildFontAwesomeSvgMarkup(option.iconName);
    if (!svgMarkup) {
      return undefined;
    }

    return {
      iconName: option.iconName,
      label: option.label,
      description: option.description,
      searchText: `${option.label} ${option.description} ${option.detail}`.toLowerCase(),
      svgMarkup
    };
  })
  .filter((option): option is WebviewIconOption => option !== undefined);

export async function showPersonalizationEditor(
  options: PersonalizationEditorOptions
): Promise<PersonalizationEditorResult | undefined> {
  const panel = vscode.window.createWebviewPanel(
    "shelfyPersonalizationEditor",
    `Edit Personalization: ${options.label}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const nonce = createNonce();
  panel.webview.html = getEditorHtml(panel.webview, nonce, options);

  let sentIconCatalog = false;

  return await new Promise<PersonalizationEditorResult | undefined>((resolve) => {
    let settled = false;

    const settle = (value: PersonalizationEditorResult | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    panel.onDidDispose(() => {
      settle(undefined);
    });

    panel.webview.onDidReceiveMessage(async (message: PersonalizationEditorMessage) => {
      if (message.type === "cancel") {
        panel.dispose();
        return;
      }

      if (message.type === "ready") {
        if (!sentIconCatalog) {
          sentIconCatalog = true;
          void sendIconCatalog(panel.webview);
        }
        return;
      }

      if (message.type !== "save") {
        return;
      }

      const result = parseEditorResult(message.value);
      if (typeof result === "string") {
        await panel.webview.postMessage({
          type: "validationError",
          message: result
        });
        return;
      }

      settle(result);
      panel.dispose();
    });
  });
}

function buildFontAwesomeSvgMarkup(iconName: string): string | undefined {
  const icon = getFontAwesomeIcon(iconName);
  if (!icon) {
    return undefined;
  }

  const [width, height, , , svgPathData] = icon.icon;
  const paths = (Array.isArray(svgPathData) ? svgPathData : [svgPathData])
    .map((pathData) => `<path d="${pathData}" fill="currentColor"/>`)
    .join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">`,
    paths,
    "</svg>"
  ].join("");
}

async function sendIconCatalog(webview: vscode.Webview): Promise<void> {
  const batchSize = 80;

  for (let index = 0; index < webviewIconOptions.length; index += batchSize) {
    const items = webviewIconOptions.slice(index, index + batchSize);
    await webview.postMessage({
      type: "iconBatch",
      items,
      loaded: Math.min(index + items.length, webviewIconOptions.length),
      total: webviewIconOptions.length,
      done: index + items.length >= webviewIconOptions.length
    });
  }
}

function parseEditorResult(
  value: PersonalizationEditorSaveValue | undefined
): PersonalizationEditorResult | string {
  const color = typeof value?.color === "string" ? value.color.trim() : "";
  if (color.length > 0 && !isColorValue(color)) {
    return "Enter a valid hex, rgb(), rgba(), hsl(), or hsla() color.";
  }

  const icon = typeof value?.icon === "string" ? value.icon.trim() : "";
  if (icon.length > 0 && !getFontAwesomeIcon(icon)) {
    return "Choose a valid Font Awesome icon.";
  }

  return {
    color: color.length > 0 ? color : null,
    icon: icon.length > 0 ? icon : null
  };
}

function getEditorHtml(
  webview: vscode.Webview,
  nonce: string,
  options: PersonalizationEditorOptions
): string {
  const initialState = {
    label: options.label,
    kind: options.kind,
    color: options.personalization?.color ?? "",
    icon: options.personalization?.icon ?? null,
    iconSvgMarkup:
      options.personalization?.icon !== undefined
        ? buildFontAwesomeSvgMarkup(options.personalization.icon)
        : null,
    projectConfigColor: options.projectConfigColor ?? null
  };

  const previewAssets = {
    defaultSvg: options.kind === "group" ? DEFAULT_GROUP_SVG : DEFAULT_PROJECT_SVG,
    swatchSvg: COLOR_SWATCH_SVG,
    fallbackColor: PREVIEW_FALLBACK_COLOR,
    totalIconCount: webviewIconOptions.length,
    defaultLabel: options.kind === "group" ? "Default folder icon" : "Default project icon",
    itemKindLabel: options.kind === "group" ? "Folder" : "Project"
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Edit Personalization</title>
  <style>
    :root {
      color-scheme: light dark;
      --effective-icon-color: ${PREVIEW_FALLBACK_COLOR};
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--vscode-font-family);
      color: var(--vscode-editor-foreground);
      background:
        radial-gradient(circle at top right, rgba(120, 120, 120, 0.12), transparent 32%),
        linear-gradient(165deg, var(--vscode-editor-background), var(--vscode-sideBar-background));
    }

    .shell {
      max-width: 980px;
      margin: 0 auto;
      padding: 18px;
    }

    .panel {
      display: grid;
      gap: 16px;
      padding: 18px;
      border-radius: 18px;
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      background: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-sideBar-background));
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .summary {
      display: flex;
      gap: 14px;
      align-items: center;
      min-width: 0;
    }

    .preview-frame {
      flex: 0 0 72px;
      width: 72px;
      height: 72px;
      border-radius: 18px;
      display: grid;
      place-items: center;
      background:
        linear-gradient(145deg, rgba(255, 255, 255, 0.06), rgba(0, 0, 0, 0.14)),
        var(--vscode-input-background);
      border: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 24%, transparent);
      color: var(--effective-icon-color);
    }

    .preview-glyph,
    .selected-icon,
    .icon-button__glyph {
      display: grid;
      place-items: center;
      color: var(--effective-icon-color);
    }

    .preview-glyph {
      width: 44px;
      height: 44px;
    }

    .preview-glyph svg,
    .selected-icon svg,
    .icon-button__glyph svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .summary-copy {
      min-width: 0;
      display: grid;
      gap: 8px;
    }

    .eyebrow {
      margin: 0;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }

    h1 {
      margin: 0;
      font-size: 22px;
      line-height: 1.18;
      word-break: break-word;
    }

    .chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      background: color-mix(in srgb, var(--vscode-input-background) 80%, transparent);
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .control-block {
      display: grid;
      gap: 8px;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      background: color-mix(in srgb, var(--vscode-sideBar-background) 72%, transparent);
    }

    .control-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .control-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .control-row {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .color-well {
      flex: 0 0 54px;
      width: 54px;
      height: 42px;
      padding: 4px;
      border-radius: 12px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
    }

    .color-well input[type="color"] {
      width: 100%;
      height: 100%;
      border: none;
      padding: 0;
      background: transparent;
      cursor: pointer;
    }

    .search-shell,
    input[type="text"] {
      flex: 1 1 auto;
      min-width: 0;
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 12px;
      background: var(--vscode-input-background);
    }

    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      color: var(--vscode-input-foreground);
      outline: none;
    }

    .search-shell {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px 4px 4px;
    }

    .search-shell input {
      flex: 1 1 auto;
      min-width: 0;
      border: none;
      background: transparent;
      color: var(--vscode-input-foreground);
      padding: 6px 6px 6px 0;
      outline: none;
    }

    input[type="text"]:focus,
    input[type="search"]:focus,
    button:focus-visible,
    input[type="color"]:focus-visible {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: 2px;
    }

    .selected-icon {
      width: 30px;
      height: 30px;
      flex: 0 0 30px;
      border-radius: 9px;
      background: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
    }

    .selected-icon svg {
      width: 18px;
      height: 18px;
    }

    .icon-action {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: 12px;
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      background: transparent;
      color: var(--vscode-descriptionForeground);
      cursor: pointer;
    }

    .icon-action:hover:not(:disabled) {
      color: var(--vscode-editor-foreground);
      background: color-mix(in srgb, var(--vscode-input-background) 78%, transparent);
    }

    .icon-action:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .icon-action svg {
      width: 16px;
      height: 16px;
      display: block;
    }

    .hint,
    .result-count,
    .message {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }

    .icon-grid {
      max-height: 360px;
      overflow: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(48px, 48px));
      justify-content: start;
      gap: 8px;
      padding: 2px;
    }

    .icon-button {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      padding: 0;
      border-radius: 12px;
      border: 1px solid var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      background: color-mix(in srgb, var(--vscode-input-background) 82%, transparent);
      color: inherit;
      cursor: pointer;
    }

    .icon-button:hover {
      border-color: color-mix(in srgb, var(--vscode-focusBorder) 42%, transparent);
      background: color-mix(in srgb, var(--vscode-input-background) 68%, transparent);
    }

    .icon-button.selected {
      border-color: var(--vscode-focusBorder);
      background: color-mix(in srgb, var(--vscode-focusBorder) 12%, var(--vscode-input-background));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder) 28%, transparent);
    }

    .icon-button__glyph {
      width: 22px;
      height: 22px;
      pointer-events: none;
    }

    .empty-state {
      padding: 12px;
      border-radius: 12px;
      border: 1px dashed var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
      color: var(--vscode-descriptionForeground);
      background: color-mix(in srgb, var(--vscode-input-background) 74%, transparent);
    }

    .footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .message[data-state="error"] {
      color: var(--vscode-errorForeground);
    }

    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }

    button.primary,
    button.ghost {
      min-height: 38px;
      padding: 9px 14px;
      border-radius: 12px;
      border: 1px solid transparent;
      font: inherit;
      cursor: pointer;
    }

    button.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    button.primary:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.ghost {
      background: transparent;
      color: var(--vscode-editor-foreground);
      border-color: var(--vscode-panel-border, rgba(127, 127, 127, 0.35));
    }

    @media (max-width: 780px) {
      .shell {
        padding: 12px;
      }

      .panel {
        padding: 14px;
      }

      .header,
      .summary,
      .control-row,
      .footer {
        align-items: stretch;
      }

      .summary {
        flex-direction: column;
      }

      .control-row {
        flex-wrap: wrap;
      }

      .color-well,
      .icon-action {
        flex-basis: 42px;
      }

      .search-shell,
      input[type="text"] {
        width: 100%;
      }

      .actions {
        width: 100%;
      }

      button.primary,
      button.ghost {
        flex: 1 1 auto;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="panel">
      <header class="header">
        <div class="summary">
          <div class="preview-frame">
            <span id="previewGlyph" class="preview-glyph"></span>
          </div>
          <div class="summary-copy">
            <p class="eyebrow">Shelfy Personalization</p>
            <h1>Edit ${escapeHtml(options.label)}</h1>
            <div class="chip-row">
              <span class="chip" id="previewMode"></span>
              <span class="chip" id="previewColor"></span>
              <span class="chip" id="previewIcon"></span>
            </div>
          </div>
        </div>
      </header>

      <section class="control-block">
        <label class="control-label" for="colorText">Color</label>
        <div class="control-row">
          <div class="color-well">
            <input id="colorPicker" type="color" aria-label="Pick a color override">
          </div>
          <input id="colorText" type="text" placeholder="#ff8800 or rgba(255, 136, 0, 0.8)">
          <button id="clearColor" class="icon-action" type="button" title="Clear color override" aria-label="Clear color override">${CLEAR_BUTTON_SVG}</button>
        </div>
        <div class="hint">Pick visually or type a CSS color value.${options.kind === "project" && options.projectConfigColor ? ` Clearing the override falls back to ${escapeHtml(options.projectConfigColor)} when available.` : ""}</div>
      </section>

      <section class="control-block">
        <div class="control-head">
          <label class="control-label" for="iconSearch">Icon</label>
          <span class="result-count" id="resultCount"></span>
        </div>
        <div class="control-row">
          <div class="search-shell">
            <span class="selected-icon" id="selectedIconGlyph"></span>
            <input id="iconSearch" type="search" placeholder="Search Font Awesome icons">
          </div>
          <button id="clearIcon" class="icon-action" type="button" title="Clear icon override" aria-label="Clear icon override">${CLEAR_BUTTON_SVG}</button>
        </div>
        <div class="icon-grid" id="iconGrid"></div>
        <div class="empty-state" id="emptyState" hidden>No icons match that search.</div>
      </section>

      <footer class="footer">
        <div class="message" id="message" role="status" aria-live="polite"></div>
        <div class="actions">
          <button id="cancel" class="ghost" type="button">Cancel</button>
          <button id="save" class="primary" type="button">Save Personalization</button>
        </div>
      </footer>
    </section>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialState = ${JSON.stringify(initialState)};
    const previewAssets = ${JSON.stringify(previewAssets)};

    const previewGlyph = document.getElementById('previewGlyph');
    const previewMode = document.getElementById('previewMode');
    const previewColor = document.getElementById('previewColor');
    const previewIcon = document.getElementById('previewIcon');
    const colorPicker = document.getElementById('colorPicker');
    const colorText = document.getElementById('colorText');
    const clearColor = document.getElementById('clearColor');
    const iconSearch = document.getElementById('iconSearch');
    const selectedIconGlyph = document.getElementById('selectedIconGlyph');
    const clearIcon = document.getElementById('clearIcon');
    const iconGrid = document.getElementById('iconGrid');
    const emptyState = document.getElementById('emptyState');
    const resultCount = document.getElementById('resultCount');
    const message = document.getElementById('message');
    const cancel = document.getElementById('cancel');
    const save = document.getElementById('save');
    const iconButtons = [];
    const iconMarkupByName = new Map();
    let loadedIconCount = 0;
    let iconCatalogReady = false;

    const state = {
      icon: initialState.icon,
      search: '',
      colorText: initialState.color
    };

    colorText.value = state.colorText;
    colorPicker.value = getPickerColor(state.colorText);

    colorPicker.addEventListener('input', () => {
      state.colorText = colorPicker.value;
      colorText.value = state.colorText;
      clearMessage();
      renderAll();
    });

    colorText.addEventListener('input', () => {
      state.colorText = colorText.value;
      syncColorPicker();
      clearMessage();
      renderAll();
    });

    clearColor.addEventListener('click', () => {
      state.colorText = '';
      colorText.value = '';
      syncColorPicker();
      clearMessage();
      renderAll();
    });

    iconSearch.addEventListener('input', () => {
      state.search = iconSearch.value.trim().toLowerCase();
      applyIconFilter();
    });

    clearIcon.addEventListener('click', () => {
      state.icon = null;
      clearMessage();
      renderAll();
    });

    cancel.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    save.addEventListener('click', () => {
      const trimmedColor = colorText.value.trim();
      if (trimmedColor.length > 0 && !isCssColor(trimmedColor)) {
        setMessage('Enter a valid CSS color value before saving.', true);
        colorText.focus();
        return;
      }

      vscode.postMessage({
        type: 'save',
        value: {
          color: trimmedColor,
          icon: state.icon
        }
      });
    });

    window.addEventListener('message', (event) => {
      if (!event.data) {
        return;
      }

      if (event.data.type === 'validationError') {
        setMessage(event.data.message, true);
        return;
      }

      if (event.data.type === 'iconBatch') {
        appendIconButtons(event.data.items || []);
        loadedIconCount = typeof event.data.loaded === 'number' ? event.data.loaded : loadedIconCount;
        iconCatalogReady = Boolean(event.data.done);
        updateIconSelection();
        applyIconFilter();
      }
    });

    window.addEventListener('error', (event) => {
      setMessage(event.message || 'Failed to render the personalization editor.', true);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason || 'Unknown error');
      setMessage(reason, true);
    });

    vscode.postMessage({ type: 'ready' });
    renderAll();

    function renderAll() {
      updateEffectiveColor();
      renderPreview();
      renderSelectedIconPreview();
      clearColor.disabled = colorText.value.trim().length === 0;
      updateIconSelection();
      applyIconFilter();
    }

    function appendIconButtons(items) {
      if (!Array.isArray(items) || items.length === 0) {
        return;
      }

      const fragment = document.createDocumentFragment();

      items.forEach((icon) => {
        if (!icon || typeof icon.iconName !== 'string' || typeof icon.svgMarkup !== 'string') {
          return;
        }

        iconMarkupByName.set(icon.iconName, icon.svgMarkup);
        const button = createIconButton(icon);
        iconButtons.push(button);
        fragment.appendChild(button);
      });

      iconGrid.appendChild(fragment);
    }

    function renderPreview() {
      const preview = getPreviewState();
      previewGlyph.innerHTML = preview.svgMarkup;
      previewMode.textContent = preview.mode;
      previewColor.textContent = preview.colorLabel;
      previewIcon.textContent = preview.iconLabel;
    }

    function renderSelectedIconPreview() {
      selectedIconGlyph.innerHTML = state.icon ? getIconMarkup(state.icon) : previewAssets.defaultSvg;
    }

    function updateEffectiveColor() {
      document.documentElement.style.setProperty('--effective-icon-color', getEffectiveColor());
    }

    function createIconButton(icon) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-button';
      button.title = icon.label;
      button.setAttribute('aria-label', icon.label + ': ' + icon.description);
      button.dataset.iconName = icon.iconName;
      button.dataset.searchText = icon.searchText;

      button.addEventListener('click', () => {
        state.icon = icon.iconName;
        clearMessage();
        renderAll();
      });

      const glyph = document.createElement('span');
      glyph.className = 'icon-button__glyph';
      glyph.innerHTML = icon.svgMarkup;

      button.append(glyph);
      return button;
    }

    function updateIconSelection() {
      const selectedIconName = state.icon ?? '';
      clearIcon.disabled = state.icon === null;

      iconButtons.forEach((button) => {
        const selected = button.dataset.iconName === selectedIconName;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function applyIconFilter() {
      const query = state.search;
      let matchCount = 0;

      iconButtons.forEach((button) => {
        const matches = !query || button.dataset.searchText.includes(query);
        button.hidden = !matches;
        if (matches) {
          matchCount += 1;
        }
      });

      emptyState.hidden = matchCount > 0;
      resultCount.textContent = describeResults(matchCount, iconButtons.length);
    }

    function getPreviewState() {
      const overrideColor = getValidColor(colorText.value);
      const projectConfigColor = initialState.kind === 'project'
        ? getValidColor(initialState.projectConfigColor)
        : null;
      const effectiveColor = overrideColor || projectConfigColor || previewAssets.fallbackColor;

      if (state.icon) {
        return {
          svgMarkup: getIconMarkup(state.icon),
          color: effectiveColor,
          mode: 'Custom icon preview',
          colorLabel: describeColorLabel(overrideColor, projectConfigColor),
          iconLabel: 'Icon: fa-' + state.icon
        };
      }

      if (overrideColor || projectConfigColor) {
        return {
          svgMarkup: previewAssets.swatchSvg,
          color: overrideColor || projectConfigColor,
          mode: 'Color-only preview',
          colorLabel: describeColorLabel(overrideColor, projectConfigColor),
          iconLabel: previewAssets.defaultLabel
        };
      }

      return {
        svgMarkup: previewAssets.defaultSvg,
        color: previewAssets.fallbackColor,
        mode: 'Default preview',
        colorLabel: 'Color: none',
        iconLabel: previewAssets.defaultLabel
      };
    }

    function describeColorLabel(overrideColor, projectConfigColor) {
      if (overrideColor) {
        return 'Color: ' + overrideColor;
      }

      if (projectConfigColor) {
        return 'Project color: ' + projectConfigColor;
      }

      return 'Color: none';
    }

    function getEffectiveColor() {
      const overrideColor = getValidColor(colorText.value);
      const projectConfigColor = initialState.kind === 'project'
        ? getValidColor(initialState.projectConfigColor)
        : null;
      return overrideColor || projectConfigColor || previewAssets.fallbackColor;
    }

    function getIconMarkup(iconName) {
      if (iconMarkupByName.has(iconName)) {
        return iconMarkupByName.get(iconName);
      }

      if (initialState.icon === iconName && initialState.iconSvgMarkup) {
        return initialState.iconSvgMarkup;
      }

      return previewAssets.defaultSvg;
    }

    function getPickerColor(value) {
      return normalizeCssColorToHex(value)
        || normalizeCssColorToHex(initialState.kind === 'project' ? initialState.projectConfigColor : null)
        || previewAssets.fallbackColor;
    }

    function syncColorPicker() {
      colorPicker.value = getPickerColor(colorText.value);
    }

    function getValidColor(value) {
      if (typeof value !== 'string') {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 && isCssColor(trimmed) ? trimmed : null;
    }

    function isCssColor(value) {
      const option = document.createElement('option');
      option.style.color = '';
      option.style.color = value;
      return option.style.color !== '';
    }

    function normalizeCssColorToHex(value) {
      const validColor = getValidColor(value);
      if (!validColor) {
        return null;
      }

      const probe = document.createElement('span');
      probe.style.color = validColor;
      probe.style.display = 'none';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).color;
      probe.remove();

      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) {
        return null;
      }

      return '#'
        + [match[1], match[2], match[3]]
          .map((component) => Number(component).toString(16).padStart(2, '0'))
          .join('');
    }

    function describeResults(matchCount, totalCount) {
      if (!iconCatalogReady) {
        return 'Loading ' + loadedIconCount + ' / ' + previewAssets.totalIconCount + ' icons';
      }

      return state.search
        ? matchCount + ' / ' + totalCount + ' icons'
        : totalCount + ' icons';
    }

    function clearMessage() {
      setMessage('', false);
    }

    function setMessage(text, isError) {
      message.textContent = text;
      message.dataset.state = text ? (isError ? 'error' : 'info') : '';
    }
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }

  return nonce;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}