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
exports.GlobalProjectsSearchViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const treeFilter_1 = require("./treeFilter");
class GlobalProjectsSearchViewProvider {
    constructor(initialFilterText) {
        this.filterChangeEmitter = new vscode.EventEmitter();
        this.onDidChangeFilterText = this.filterChangeEmitter.event;
        this.filterText = (0, treeFilter_1.normalizeTreeFilterText)(initialFilterText);
    }
    resolveWebviewView(webviewView) {
        this.webviewView = webviewView;
        webviewView.webview.options = {
            enableScripts: true
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);
        const messageDisposable = webviewView.webview.onDidReceiveMessage((message) => {
            if (message.type === "ready") {
                this.postState();
                return;
            }
            this.filterText = (0, treeFilter_1.normalizeTreeFilterText)(message.value);
            this.filterChangeEmitter.fire(this.filterText);
        });
        const disposeDisposable = webviewView.onDidDispose(() => {
            if (this.webviewView === webviewView) {
                this.webviewView = undefined;
            }
            messageDisposable.dispose();
            disposeDisposable.dispose();
        });
    }
    setFilterText(filterText) {
        this.filterText = (0, treeFilter_1.normalizeTreeFilterText)(filterText);
        this.postState();
    }
    dispose() {
        this.filterChangeEmitter.dispose();
    }
    postState() {
        this.webviewView?.webview.postMessage({
            type: "setFilterText",
            value: this.filterText ?? ""
        });
    }
    getHtml(webview) {
        const nonce = getNonce();
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style nonce="${nonce}">
    body {
      margin: 0;
      padding: 8px;
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      background: var(--vscode-sideBar-background);
    }

    .search-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .search-input {
      flex: 1;
      min-width: 0;
      padding: 6px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      font: inherit;
    }

    .search-input:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    .clear-button {
      padding: 6px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      font: inherit;
      cursor: pointer;
    }

    .clear-button:hover:enabled {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .clear-button:disabled {
      opacity: 0.6;
      cursor: default;
    }

    .hint {
      margin-top: 6px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="search-row">
    <input id="filterInput" class="search-input" type="search" placeholder="Filter folders, projects, paths, and scripts" spellcheck="false" />
    <button id="clearButton" class="clear-button" type="button">Clear</button>
  </div>
  <div class="hint">Filters dynamically as you type.</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('filterInput');
    const clearButton = document.getElementById('clearButton');
    let applyingState = false;

    const updateClearState = () => {
      clearButton.disabled = input.value.length === 0;
    };

    input.addEventListener('input', () => {
      if (applyingState) {
        return;
      }

      vscode.postMessage({ type: 'filterChanged', value: input.value });
      updateClearState();
    });

    clearButton.addEventListener('click', () => {
      input.value = '';
      updateClearState();
      input.focus();
      vscode.postMessage({ type: 'filterChanged', value: '' });
    });

    window.addEventListener('message', (event) => {
      if (event.data?.type !== 'setFilterText') {
        return;
      }

      applyingState = true;
      input.value = event.data.value ?? '';
      updateClearState();
      applyingState = false;
    });

    updateClearState();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}
exports.GlobalProjectsSearchViewProvider = GlobalProjectsSearchViewProvider;
GlobalProjectsSearchViewProvider.viewId = "globalProjectsSearchView";
function getNonce() {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let index = 0; index < 32; index += 1) {
        nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }
    return nonce;
}
//# sourceMappingURL=searchView.js.map