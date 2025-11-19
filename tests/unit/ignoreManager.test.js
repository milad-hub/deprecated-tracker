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
const path = __importStar(require("path"));
const ignoreManager_1 = require("../ignoreManager");
describe('IgnoreManager', () => {
    let mockContext;
    let ignoreManager;
    beforeEach(() => {
        const workspaceState = {};
        mockContext = {
            workspaceState: {
                get: jest.fn((key) => workspaceState[key]),
                update: jest.fn((key, value) => {
                    workspaceState[key] = value;
                    return Promise.resolve();
                }),
                keys: jest.fn(() => Object.keys(workspaceState)),
            },
        };
        ignoreManager = new ignoreManager_1.IgnoreManager(mockContext);
    });
    describe('isFileIgnored', () => {
        it('should return false for non-ignored file', () => {
            expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(false);
        });
        it('should return true for ignored file', () => {
            ignoreManager.ignoreFile('/path/to/file.ts');
            expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(true);
        });
    });
    describe('isMethodIgnored', () => {
        it('should return false for non-ignored method', () => {
            expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(false);
        });
        it('should return true for ignored method', () => {
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(true);
        });
    });
    describe('ignoreFile', () => {
        it('should add file to ignore list', () => {
            ignoreManager.ignoreFile('/path/to/file.ts');
            expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(true);
        });
        it('should not add duplicate files', () => {
            const testPath = path.normalize('/path/to/file.ts');
            ignoreManager.ignoreFile('/path/to/file.ts');
            ignoreManager.ignoreFile('/path/to/file.ts');
            const rules = ignoreManager.getAllRules();
            expect(rules.files.filter((f) => path.normalize(f) === testPath).length).toBe(1);
        });
    });
    describe('ignoreMethod', () => {
        it('should add method to ignore list', () => {
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(true);
        });
        it('should not add duplicate methods', () => {
            const testPath = path.normalize('/path/to/file.ts');
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            const rules = ignoreManager.getAllRules();
            const matchingKey = Object.keys(rules.methods).find((f) => path.normalize(f) === testPath);
            expect(rules.methods[matchingKey]?.filter((m) => m === 'methodName').length).toBe(1);
        });
    });
    describe('removeFileIgnore', () => {
        it('should remove file from ignore list', () => {
            ignoreManager.ignoreFile('/path/to/file.ts');
            ignoreManager.removeFileIgnore('/path/to/file.ts');
            expect(ignoreManager.isFileIgnored('/path/to/file.ts')).toBe(false);
        });
    });
    describe('removeMethodIgnore', () => {
        it('should remove method from ignore list', () => {
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            ignoreManager.removeMethodIgnore('/path/to/file.ts', 'methodName');
            expect(ignoreManager.isMethodIgnored('/path/to/file.ts', 'methodName')).toBe(false);
        });
        it('should clean up empty method arrays', () => {
            ignoreManager.ignoreMethod('/path/to/file.ts', 'methodName');
            ignoreManager.removeMethodIgnore('/path/to/file.ts', 'methodName');
            const rules = ignoreManager.getAllRules();
            expect(rules.methods['/path/to/file.ts']).toBeUndefined();
        });
    });
    describe('clearAll', () => {
        it('should clear all ignore rules', () => {
            ignoreManager.ignoreFile('/path/to/file.ts');
            ignoreManager.ignoreMethod('/path/to/file2.ts', 'methodName');
            ignoreManager.clearAll();
            const rules = ignoreManager.getAllRules();
            expect(rules.files.length).toBe(0);
            expect(Object.keys(rules.methods).length).toBe(0);
        });
    });
    describe('getAllRules', () => {
        it('should return copy of rules', () => {
            ignoreManager.ignoreFile('/path/to/file.ts');
            const rules1 = ignoreManager.getAllRules();
            const rules2 = ignoreManager.getAllRules();
            expect(rules1).toEqual(rules2);
            expect(rules1).not.toBe(rules2); // Should be different objects
        });
    });
});
//# sourceMappingURL=ignoreManager.test.js.map