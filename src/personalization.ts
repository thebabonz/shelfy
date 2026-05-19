import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import * as freeSolidIcons from "@fortawesome/free-solid-svg-icons";
import { NodePersonalization } from "./model";

type FontAwesomeQuickPickIcon = {
  label: string;
  description: string;
  detail: string;
  iconName: string;
};

const fontAwesomeIconMap = new Map<string, IconDefinition>();

for (const value of Object.values(freeSolidIcons)) {
  if (!isIconDefinition(value)) {
    continue;
  }

  if (!fontAwesomeIconMap.has(value.iconName)) {
    fontAwesomeIconMap.set(value.iconName, value);
  }
}

const fontAwesomeQuickPickIcons: FontAwesomeQuickPickIcon[] = [...fontAwesomeIconMap.values()]
  .sort((left, right) => left.iconName.localeCompare(right.iconName))
  .map((icon) => ({
    label: `fa-${icon.iconName}`,
    description: humanizeIconName(icon.iconName),
    detail: `Font Awesome Free Solid: fa-${icon.iconName}`,
    iconName: icon.iconName
  }));

export function getFontAwesomeIcon(iconName: string): IconDefinition | undefined {
  return fontAwesomeIconMap.get(iconName);
}

export function isKnownFontAwesomeIcon(iconName: string): boolean {
  return fontAwesomeIconMap.has(iconName);
}

export function getFontAwesomeQuickPickIcons(): readonly FontAwesomeQuickPickIcon[] {
  return fontAwesomeQuickPickIcons;
}

export function hasNodePersonalization(personalization: NodePersonalization | undefined): boolean {
  return Boolean(personalization?.color || personalization?.icon);
}

export function normalizeNodePersonalization(
  personalization: NodePersonalization | undefined
): NodePersonalization | undefined {
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

export function formatPersonalizationIcon(iconName: string | undefined): string | undefined {
  return iconName ? `fa-${iconName}` : undefined;
}

function humanizeIconName(iconName: string): string {
  return iconName
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function isIconDefinition(value: unknown): value is IconDefinition {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<IconDefinition>;
  return typeof candidate.iconName === "string" && Array.isArray(candidate.icon);
}