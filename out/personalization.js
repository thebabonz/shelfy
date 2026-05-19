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
exports.getFontAwesomeIcon = getFontAwesomeIcon;
exports.isKnownFontAwesomeIcon = isKnownFontAwesomeIcon;
exports.getFontAwesomeQuickPickIcons = getFontAwesomeQuickPickIcons;
exports.hasNodePersonalization = hasNodePersonalization;
exports.normalizeNodePersonalization = normalizeNodePersonalization;
exports.formatPersonalizationIcon = formatPersonalizationIcon;
const freeSolidIcons = __importStar(require("@fortawesome/free-solid-svg-icons"));
const fontAwesomeIconMap = new Map();
for (const value of Object.values(freeSolidIcons)) {
    if (!isIconDefinition(value)) {
        continue;
    }
    if (!fontAwesomeIconMap.has(value.iconName)) {
        fontAwesomeIconMap.set(value.iconName, value);
    }
}
const fontAwesomeQuickPickIcons = [...fontAwesomeIconMap.values()]
    .sort((left, right) => left.iconName.localeCompare(right.iconName))
    .map((icon) => ({
    label: `fa-${icon.iconName}`,
    description: humanizeIconName(icon.iconName),
    detail: `Font Awesome Free Solid: fa-${icon.iconName}`,
    iconName: icon.iconName
}));
function getFontAwesomeIcon(iconName) {
    return fontAwesomeIconMap.get(iconName);
}
function isKnownFontAwesomeIcon(iconName) {
    return fontAwesomeIconMap.has(iconName);
}
function getFontAwesomeQuickPickIcons() {
    return fontAwesomeQuickPickIcons;
}
function hasNodePersonalization(personalization) {
    return Boolean(personalization?.color || personalization?.icon);
}
function normalizeNodePersonalization(personalization) {
    const color = typeof personalization?.color === "string" ? personalization.color.trim() : "";
    const icon = typeof personalization?.icon === "string" ? personalization.icon.trim() : "";
    if (!color && !icon) {
        return undefined;
    }
    return {
        ...(color ? { color } : {}),
        ...(icon ? { icon } : {})
    };
}
function formatPersonalizationIcon(iconName) {
    return iconName ? `fa-${iconName}` : undefined;
}
function humanizeIconName(iconName) {
    return iconName
        .split("-")
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}
function isIconDefinition(value) {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const candidate = value;
    return typeof candidate.iconName === "string" && Array.isArray(candidate.icon);
}
//# sourceMappingURL=personalization.js.map