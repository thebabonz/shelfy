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
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const projectColor_1 = require("../../projectColor");
suite("readProjectColor", () => {
    async function makeTempProject(settings) {
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "global-projects-test-"));
        const vscodeDir = path.join(projectDir, ".vscode");
        await fs.mkdir(vscodeDir, { recursive: true });
        await fs.writeFile(path.join(vscodeDir, "settings.json"), JSON.stringify(settings, null, 2), "utf8");
        return projectDir;
    }
    test("reads flat workbench.colorCustomizations titleBar.activeBackground", async () => {
        const projectDir = await makeTempProject({
            "workbench.colorCustomizations": {
                "titleBar.activeBackground": "#112233"
            }
        });
        const color = await (0, projectColor_1.readProjectColor)(projectDir);
        assert.strictEqual(color, "#112233");
    });
    test("reads nested workbench.colorCustomizations titleBar.activeBackground", async () => {
        const projectDir = await makeTempProject({
            workbench: {
                colorCustomizations: {
                    "titleBar.activeBackground": "#aabbcc"
                }
            }
        });
        const color = await (0, projectColor_1.readProjectColor)(projectDir);
        assert.strictEqual(color, "#aabbcc");
    });
    test("returns undefined for missing color", async () => {
        const projectDir = await makeTempProject({
            "workbench.colorCustomizations": {}
        });
        const color = await (0, projectColor_1.readProjectColor)(projectDir);
        assert.strictEqual(color, undefined);
    });
    test("returns undefined for invalid color", async () => {
        const projectDir = await makeTempProject({
            "workbench.colorCustomizations": {
                "titleBar.activeBackground": "red"
            }
        });
        const color = await (0, projectColor_1.readProjectColor)(projectDir);
        assert.strictEqual(color, undefined);
    });
    test("returns undefined when settings.json does not exist", async () => {
        const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "global-projects-test-"));
        const color = await (0, projectColor_1.readProjectColor)(projectDir);
        assert.strictEqual(color, undefined);
    });
});
//# sourceMappingURL=projectColor.test.js.map