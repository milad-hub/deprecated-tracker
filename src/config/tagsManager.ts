import { randomUUID } from "crypto";
import * as vscode from "vscode";
import { DEFAULT_CUSTOM_TAGS, STORAGE_KEY_CUSTOM_TAGS } from "../constants";
import { CustomTag, CustomTagsConfig } from "../interfaces";

type NewTagInput = Omit<CustomTag, "id" | "createdAt"> & { id?: string };

const RESERVED_JSDOC_TAGS = [
  "@param",
  "@returns",
  "@return",
  "@type",
  "@typedef",
  "@template",
  "@see",
  "@link",
  "@example",
  "@throws",
  "@private",
  "@public",
  "@protected",
  "@readonly",
  "@override",
  "@package",
  "@internal",
  "@alpha",
  "@beta",
  "@module",
  "@namespace",
  "@enum",
  "@class",
  "@interface",
  "@function",
  "@method",
  "@property",
  "@const",
  "@var",
  "@constructor",
  "@extends",
  "@implements",
  "@augments",
  "@memberof",
  "@description",
  "@summary",
  "@since",
  "@version",
  "@author",
  "@license",
  "@todo",
  "@callback",
  "@typedef",
];

export class TagsManager {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public getAllTags(): CustomTag[] {
    const config = this.ensureConfig();
    return config.tags.map((tag) => ({ ...tag }));
  }

  public getEnabledTags(): CustomTag[] {
    return this.getAllTags().filter((tag) => tag.enabled);
  }

  public addTag(tag: NewTagInput): CustomTag {
    const config = this.ensureConfig();
    this.validateTagInput(tag.tag, tag.label, tag.color);
    const normalizedTag = this.normalizeTag(tag.tag);

    const hasDuplicate = config.tags.some(
      (existing) => this.normalizeTag(existing.tag) === normalizedTag,
    );
    if (hasDuplicate) {
      throw new Error(`Tag ${tag.tag} already exists`);
    }

    const newTag: CustomTag = {
      id: tag.id || this.generateId(normalizedTag),
      tag: tag.tag.startsWith("@") ? tag.tag : `@${tag.tag}`,
      label: tag.label.trim(),
      description: tag.description?.trim() || "",
      enabled: typeof tag.enabled === "boolean" ? tag.enabled : true,
      color: tag.color || "#4ecdc4",
      createdAt: Date.now(),
    };

    config.tags.push(newTag);
    this.saveConfig(config);
    return newTag;
  }

  public updateTag(
    id: string,
    updates: Partial<Omit<CustomTag, "id" | "createdAt">>,
  ): CustomTag {
    const config = this.ensureConfig();
    const index = config.tags.findIndex((tag) => tag.id === id);
    if (index === -1) {
      throw new Error("Tag not found");
    }

    if (updates.tag) {
      this.validateTagInput(
        updates.tag,
        updates.label ?? config.tags[index].label,
      );
      const normalizedTag = this.normalizeTag(updates.tag);
      const duplicate = config.tags.some(
        (tag, idx) =>
          idx !== index && this.normalizeTag(tag.tag) === normalizedTag,
      );
      if (duplicate) {
        throw new Error(`Tag ${updates.tag} already exists`);
      }
      config.tags[index].tag = updates.tag.startsWith("@")
        ? updates.tag
        : `@${updates.tag}`;
    }

    if (typeof updates.label === "string") {
      config.tags[index].label = updates.label.trim();
    }

    if (typeof updates.description === "string") {
      config.tags[index].description = updates.description.trim();
    }

    if (typeof updates.enabled === "boolean") {
      config.tags[index].enabled = updates.enabled;
    }

    if (typeof updates.color === "string") {
      config.tags[index].color = updates.color;
    }

    this.saveConfig(config);
    return { ...config.tags[index] };
  }

  public deleteTag(id: string): void {
    const config = this.ensureConfig();
    const filtered = config.tags.filter((tag) => tag.id !== id);
    if (filtered.length === config.tags.length) {
      throw new Error("Tag not found");
    }
    config.tags = filtered;
    this.saveConfig(config);
  }

  public toggleTag(id: string): CustomTag {
    const config = this.ensureConfig();
    const tag = config.tags.find((t) => t.id === id);
    if (!tag) {
      throw new Error("Tag not found");
    }
    tag.enabled = !tag.enabled;
    this.saveConfig(config);
    return { ...tag };
  }

  private ensureConfig(): CustomTagsConfig {
    const stored = this.context.workspaceState.get<CustomTagsConfig>(
      STORAGE_KEY_CUSTOM_TAGS,
    );
    if (stored && Array.isArray(stored.tags)) {
      return {
        ...stored,
        tags: stored.tags.map((tag) => ({ ...tag })),
      };
    }

    const defaultConfig: CustomTagsConfig = {
      version: "1.0.0",
      tags: DEFAULT_CUSTOM_TAGS.map((tag, index) => ({
        ...tag,
        createdAt: Date.now() + index,
      })),
    };
    this.saveConfig(defaultConfig);
    return defaultConfig;
  }

  private saveConfig(config: CustomTagsConfig): void {
    void this.context.workspaceState.update(STORAGE_KEY_CUSTOM_TAGS, {
      ...config,
      tags: config.tags.map((tag) => ({ ...tag })),
    });
  }

  private normalizeTag(tag: string): string {
    const normalized = tag.startsWith("@") ? tag.slice(1) : tag;
    return normalized.trim().toLowerCase();
  }

  private generateId(base: string): string {
    return `${base}-${randomUUID()}`;
  }

  private validateTagInput(tag: string, label?: string, color?: string): void {
    if (typeof tag !== "string") {
      throw new Error("Tag name is required");
    }

    if (!tag || !tag.trim()) {
      throw new Error("Tag name is required");
    }

    if (!tag.trim().startsWith("@")) {
      throw new Error("Tag must start with @");
    }

    const normalizedTag = this.normalizeTag(tag);
    const reservedMatch = RESERVED_JSDOC_TAGS.find(
      (reserved) => this.normalizeTag(reserved) === normalizedTag,
    );
    if (reservedMatch) {
      throw new Error(
        `Tag "${tag}" conflicts with reserved JSDoc tag "${reservedMatch}". Please choose a different name.`,
      );
    }

    if (!label || !label.trim()) {
      throw new Error("Label is required");
    }
    if (color && !/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(color.trim())) {
      throw new Error("Color must be a valid hex value");
    }
  }
}
