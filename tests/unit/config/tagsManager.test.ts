import * as vscode from 'vscode';
import { TagsManager } from '../../../src/config/tagsManager';
import { DEFAULT_CUSTOM_TAGS } from '../../../src/constants';

describe('TagsManager', () => {
  let mockContext: vscode.ExtensionContext;
  let tagsManager: TagsManager;
  let workspaceStateStore: Record<string, unknown>;

  beforeEach(() => {
    workspaceStateStore = {};
    mockContext = {
      subscriptions: [],
      workspaceState: {
        get: jest.fn((key: string) => workspaceStateStore[key]),
        update: jest.fn((key: string, value: unknown) => {
          workspaceStateStore[key] = value;
          return Promise.resolve();
        }),
        keys: jest.fn(() => Object.keys(workspaceStateStore)),
      },
    } as unknown as vscode.ExtensionContext;
    tagsManager = new TagsManager(mockContext);
  });

  it('should seed default tags on first load', () => {
    const tags = tagsManager.getAllTags();
    expect(tags).toHaveLength(DEFAULT_CUSTOM_TAGS.length);
    DEFAULT_CUSTOM_TAGS.forEach((seedTag) => {
      expect(tags.some((tag) => tag.id === seedTag.id)).toBe(true);
    });
  });

  it('should add a new custom tag', () => {
    const newTag = tagsManager.addTag({
      tag: '@unstable',
      label: 'Unstable',
      description: 'Subject to change',
      enabled: true,
      color: '#ff00ff',
    });
    const allTags = tagsManager.getAllTags();
    expect(newTag.tag).toBe('@unstable');
    expect(allTags.some((tag) => tag.id === newTag.id)).toBe(true);
  });

  it('should prevent duplicate tags', () => {
    expect(() =>
      tagsManager.addTag({
        tag: DEFAULT_CUSTOM_TAGS[0].tag,
        label: 'Duplicate',
        description: '',
        enabled: true,
        color: '#000000',
      })
    ).toThrow(/already exists/i);
  });

  it('should require tags to start with @', () => {
    expect(() =>
      tagsManager.addTag({
        tag: 'legacy',
        label: 'Legacy',
        description: '',
        enabled: true,
        color: '#000000',
      })
    ).toThrow(/must start with @/i);
  });

  it('should update an existing tag', () => {
    const target = tagsManager.getAllTags()[0];
    const updated = tagsManager.updateTag(target.id, {
      label: 'Updated Label',
      description: 'Updated description',
      color: '#123456',
    });
    expect(updated.label).toBe('Updated Label');
    expect(updated.description).toBe('Updated description');
    expect(updated.color).toBe('#123456');
  });

  it('should delete a tag by id', () => {
    const target = tagsManager.getAllTags()[0];
    tagsManager.deleteTag(target.id);
    expect(tagsManager.getAllTags().some((tag) => tag.id === target.id)).toBe(false);
  });

  it('should toggle tag enabled state', () => {
    const target = tagsManager.getAllTags()[0];
    const toggled = tagsManager.toggleTag(target.id);
    expect(toggled.enabled).toBe(!target.enabled);
  });

  it('should only return enabled tags via getEnabledTags', () => {
    const allTags = tagsManager.getAllTags();
    if (allTags.length > 0) {
      tagsManager.updateTag(allTags[0].id, { enabled: false });
    }
    const enabled = tagsManager.getEnabledTags();
    expect(enabled.every((tag) => tag.enabled)).toBe(true);
  });

  it('should handle updating tag with only enabled field', () => {
    const target = tagsManager.getAllTags()[0];
    const originalEnabled = target.enabled;
    const updated = tagsManager.updateTag(target.id, { enabled: !originalEnabled });
    expect(updated.enabled).toBe(!originalEnabled);
  });

  it('should handle updating tag with only color field', () => {
    const target = tagsManager.getAllTags()[0];
    const updated = tagsManager.updateTag(target.id, { color: '#abcdef' });
    expect(updated.color).toBe('#abcdef');
  });

  it('should handle updating tag with only description field', () => {
    const target = tagsManager.getAllTags()[0];
    const updated = tagsManager.updateTag(target.id, { description: 'New description' });
    expect(updated.description).toBe('New description');
  });

  it('should throw error when updating non-existent tag', () => {
    expect(() =>
      tagsManager.updateTag('non-existent-id', { label: 'New Label' })
    ).toThrow(/not found/i);
  });

  it('should throw error when deleting non-existent tag', () => {
    expect(() => tagsManager.deleteTag('non-existent-id')).toThrow(/not found/i);
  });

  it('should throw error when toggling non-existent tag', () => {
    expect(() => tagsManager.toggleTag('non-existent-id')).toThrow(/not found/i);
  });

  describe('ISSUE-005: Reserved Tag Validation', () => {
    it('should reject reserved JSDoc tag @param', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@param',
          label: 'Parameter',
          description: 'Test',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });

    it('should reject reserved JSDoc tag @returns', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@returns',
          label: 'Returns',
          description: 'Test',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });

    it('should reject reserved JSDoc tag @internal', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@internal',
          label: 'Internal',
          description: 'Test',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });

    it('should reject reserved tag with different casing', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@PARAM',
          label: 'Parameter',
          description: 'Test',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });

    it('should reject reserved tag when updating', () => {
      const target = tagsManager.getAllTags()[0];
      expect(() =>
        tagsManager.updateTag(target.id, {
          tag: '@param',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });

    it('should allow non-reserved custom tags', () => {
      const tag = tagsManager.addTag({
        tag: '@customtag',
        label: 'Custom',
        description: 'This is not reserved',
        enabled: true,
        color: '#000000',
      });
      expect(tag.tag).toBe('@customtag');
    });

    it('should validate reserved tags case-insensitively in updates', () => {
      const target = tagsManager.getAllTags()[0];
      expect(() =>
        tagsManager.updateTag(target.id, {
          tag: '@RETURNS',
        })
      ).toThrow(/conflicts with reserved JSDoc tag/i);
    });
  });

  describe('Validation Edge Cases', () => {
    it('should reject empty tag name', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '',
          label: 'Empty',
          description: '',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/tag name is required/i);
    });

    it('should reject non-string tag', () => {
      expect(() =>
        tagsManager.addTag({
          tag: null as any,
          label: 'Null',
          description: '',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/tag name is required/i);
    });

    it('should reject empty label', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@test',
          label: '',
          description: '',
          enabled: true,
          color: '#000000',
        })
      ).toThrow(/label is required/i);
    });

    it('should reject invalid hex color', () => {
      expect(() =>
        tagsManager.addTag({
          tag: '@test',
          label: 'Test',
          description: '',
          enabled: true,
          color: 'not-a-hex',
        })
      ).toThrow(/color must be a valid hex value/i);
    });

    it('should accept valid 3-digit hex color', () => {
      const tag = tagsManager.addTag({
        tag: '@shortcolor',
        label: 'Short Color',
        description: '',
        enabled: true,
        color: '#abc',
      });
      expect(tag.color).toBe('#abc');
    });

    it('should allow tag update to duplicate its own name', () => {
      const target = tagsManager.getAllTags()[0];
      const updated = tagsManager.updateTag(target.id, {
        tag: target.tag,
        label: 'Updated',
      });
      expect(updated.tag).toBe(target.tag);
      expect(updated.label).toBe('Updated');
    });

    it('should reject duplicate tag name in update', () => {
      const tag1 = tagsManager.addTag({
        tag: '@duplicatetest1',
        label: 'Test 1',
        description: '',
        enabled: true,
        color: '#000001',
      });
      const tag2 = tagsManager.addTag({
        tag: '@duplicatetest2',
        label: 'Test 2',
        description: '',
        enabled: true,
        color: '#000002',
      });
      expect(() =>
        tagsManager.updateTag(tag1.id, {
          tag: tag2.tag,
        })
      ).toThrow(/already exists/i);
    });
  });

  describe('ISSUE-004: ID Uniqueness', () => {
    it('should generate unique IDs for tags with same base name', () => {
      const tag1 = tagsManager.addTag({
        tag: '@test1',
        label: 'Test 1',
        description: '',
        enabled: true,
        color: '#000001',
      });
      const tag2 = tagsManager.addTag({
        tag: '@test2',
        label: 'Test 2',
        description: '',
        enabled: true,
        color: '#000002',
      });
      expect(tag1.id).not.toBe(tag2.id);
      expect(tag1.id).toBeTruthy();
      expect(tag2.id).toBeTruthy();
    });

    it('should generate UUID-based IDs with proper format', () => {
      const tag = tagsManager.addTag({
        tag: '@testid',
        label: 'Test ID',
        description: '',
        enabled: true,
        color: '#000000',
      });
      expect(tag.id).toMatch(/^testid-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should prevent collisions even with rapid tag creation', () => {
      const ids = new Set<string>();
      const tags = [];
      for (let i = 0; i < 10; i++) {
        const tag = tagsManager.addTag({
          tag: `@rapid${i}`,
          label: `Rapid ${i}`,
          description: '',
          enabled: true,
          color: '#000000',
        });
        tags.push(tag);
        ids.add(tag.id);
      }
      expect(ids.size).toBe(10);
      expect(tags.length).toBe(10);
    });

    it('should preserve custom ID if provided', () => {
      const customId = 'my-custom-id-12345';
      const tag = tagsManager.addTag({
        id: customId,
        tag: '@customid',
        label: 'Custom ID',
        description: '',
        enabled: true,
        color: '#000000',
      });
      expect(tag.id).toBe(customId);
    });
  });
});