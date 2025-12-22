import {
    EXTENSION_ID,
    COMMAND_SCAN,
    COMMAND_REFRESH,
    COMMAND_OPEN_RESULTS,
    WEBVIEW_PANEL_ID,
    WEBVIEW_IGNORE_PANEL_ID,
    STORAGE_KEY_IGNORE_RULES,
    SIDEBAR_VIEW_ID,
    MESSAGE_COMMANDS,
    TSCONFIG_FILE,
    ERROR_MESSAGES,
} from '../../src/constants';

describe('Constants', () => {
    describe('Extension Identifiers', () => {
        it('should have valid extension ID', () => {
            expect(EXTENSION_ID).toBe('deprecated-tracker');
            expect(typeof EXTENSION_ID).toBe('string');
            expect(EXTENSION_ID.length).toBeGreaterThan(0);
        });

        it('should have properly formatted command IDs', () => {
            expect(COMMAND_SCAN).toBe('deprecatedTracker.scan');
            expect(COMMAND_REFRESH).toBe('deprecatedTracker.refresh');
            expect(COMMAND_OPEN_RESULTS).toBe('deprecatedTracker.openResults');
        });

        it('should have consistent command naming pattern', () => {
            const commands = [COMMAND_SCAN, COMMAND_REFRESH, COMMAND_OPEN_RESULTS];
            commands.forEach((cmd) => {
                expect(cmd).toMatch(/^deprecatedTracker\./);
            });
        });

        it('should have unique command IDs', () => {
            const commands = [COMMAND_SCAN, COMMAND_REFRESH, COMMAND_OPEN_RESULTS];
            const uniqueCommands = new Set(commands);
            expect(uniqueCommands.size).toBe(commands.length);
        });
    });

    describe('View and Panel IDs', () => {
        it('should have valid webview panel ID', () => {
            expect(WEBVIEW_PANEL_ID).toBe('deprecatedTracker');
            expect(typeof WEBVIEW_PANEL_ID).toBe('string');
        });

        it('should have valid ignore panel ID', () => {
            expect(WEBVIEW_IGNORE_PANEL_ID).toBe('deprecatedTrackerIgnore');
            expect(typeof WEBVIEW_IGNORE_PANEL_ID).toBe('string');
        });

        it('should have valid sidebar view ID', () => {
            expect(SIDEBAR_VIEW_ID).toBe('deprecatedTrackerSidebar');
            expect(typeof SIDEBAR_VIEW_ID).toBe('string');
        });

        it('should have unique panel IDs', () => {
            const ids = [WEBVIEW_PANEL_ID, WEBVIEW_IGNORE_PANEL_ID, SIDEBAR_VIEW_ID];
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
        });
    });

    describe('Storage Keys', () => {
        it('should have valid storage key', () => {
            expect(STORAGE_KEY_IGNORE_RULES).toBe('deprecatedTracker.ignoreRules');
            expect(typeof STORAGE_KEY_IGNORE_RULES).toBe('string');
        });

        it('should have namespaced storage key', () => {
            expect(STORAGE_KEY_IGNORE_RULES).toMatch(/^deprecatedTracker\./);
        });
    });

    describe('MESSAGE_COMMANDS', () => {
        it('should have all required command properties', () => {
            expect(MESSAGE_COMMANDS.RESCAN).toBe('rescan');
            expect(MESSAGE_COMMANDS.OPEN_FILE).toBe('openFile');
            expect(MESSAGE_COMMANDS.OPEN_FILE_AT_LINE).toBe('openFileAtLine');
            expect(MESSAGE_COMMANDS.IGNORE_METHOD).toBe('ignoreMethod');
            expect(MESSAGE_COMMANDS.IGNORE_FILE).toBe('ignoreFile');
            expect(MESSAGE_COMMANDS.SHOW_IGNORE_MANAGER).toBe('showIgnoreManager');
            expect(MESSAGE_COMMANDS.SCANNING).toBe('scanning');
            expect(MESSAGE_COMMANDS.RESULTS).toBe('results');
            expect(MESSAGE_COMMANDS.UPDATE_IGNORE_LIST).toBe('updateIgnoreList');
            expect(MESSAGE_COMMANDS.REMOVE_FILE_IGNORE).toBe('removeFileIgnore');
            expect(MESSAGE_COMMANDS.REMOVE_METHOD_IGNORE).toBe('removeMethodIgnore');
            expect(MESSAGE_COMMANDS.CLEAR_ALL).toBe('clearAll');
        });

        it('should have all string values', () => {
            Object.values(MESSAGE_COMMANDS).forEach((value) => {
                expect(typeof value).toBe('string');
            });
        });

        it('should have unique command values', () => {
            const values = Object.values(MESSAGE_COMMANDS);
            const uniqueValues = new Set(values);
            expect(uniqueValues.size).toBe(values.length);
        });
    });

    describe('ERROR_MESSAGES', () => {
        it('should have all required error messages', () => {
            expect(ERROR_MESSAGES.NO_WORKSPACE).toBe('No workspace folder found');
            expect(ERROR_MESSAGES.NO_TSCONFIG).toBe('tsconfig.json or jsconfig.json not found in workspace root');
            expect(ERROR_MESSAGES.SCAN_FAILED).toBe('Scan failed');
            expect(ERROR_MESSAGES.UNKNOWN_ERROR).toBe('Unknown error occurred');
        });

        it('should have all string values', () => {
            Object.values(ERROR_MESSAGES).forEach((value) => {
                expect(typeof value).toBe('string');
                expect(value.length).toBeGreaterThan(0);
            });
        });

        it('should have descriptive error messages', () => {
            Object.values(ERROR_MESSAGES).forEach((value) => {
                expect(value.length).toBeGreaterThan(5);
            });
        });
    });

    describe('File Constants', () => {
        it('should have valid tsconfig filename', () => {
            expect(TSCONFIG_FILE).toBe('tsconfig.json');
            expect(typeof TSCONFIG_FILE).toBe('string');
        });
    });

    describe('Overall Validation', () => {
        it('should export all constants', () => {
            expect(EXTENSION_ID).toBeDefined();
            expect(COMMAND_SCAN).toBeDefined();
            expect(COMMAND_REFRESH).toBeDefined();
            expect(COMMAND_OPEN_RESULTS).toBeDefined();
            expect(WEBVIEW_PANEL_ID).toBeDefined();
            expect(WEBVIEW_IGNORE_PANEL_ID).toBeDefined();
            expect(STORAGE_KEY_IGNORE_RULES).toBeDefined();
            expect(SIDEBAR_VIEW_ID).toBeDefined();
            expect(MESSAGE_COMMANDS).toBeDefined();
            expect(TSCONFIG_FILE).toBeDefined();
            expect(ERROR_MESSAGES).toBeDefined();
        });

        it('should have consistent naming convention across extension', () => {
            const extensionPrefixed = [
                EXTENSION_ID,
                COMMAND_SCAN,
                COMMAND_REFRESH,
                COMMAND_OPEN_RESULTS,
                WEBVIEW_PANEL_ID,
                WEBVIEW_IGNORE_PANEL_ID,
                STORAGE_KEY_IGNORE_RULES,
                SIDEBAR_VIEW_ID,
            ];

            extensionPrefixed.forEach((constant) => {
                expect(constant.toLowerCase()).toContain('deprecated');
            });
        });
    });
});