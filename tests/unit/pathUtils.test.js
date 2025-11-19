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
const pathUtils_1 = require("../pathUtils");
describe('PathUtils', () => {
    describe('getFileName', () => {
        it('should return file name from full path', () => {
            expect(pathUtils_1.PathUtils.getFileName('/path/to/file.ts')).toBe('file.ts');
            expect(pathUtils_1.PathUtils.getFileName('file.ts')).toBe('file.ts');
        });
    });
    describe('getRelativePath', () => {
        it('should return relative path', () => {
            const basePath = path.join('base', 'path');
            const filePath = path.join('base', 'path', 'sub', 'file.ts');
            const result = pathUtils_1.PathUtils.getRelativePath(filePath, basePath);
            expect(result).toBe(path.join('sub', 'file.ts'));
        });
    });
    describe('normalizePath', () => {
        it('should normalize path', () => {
            const input = path.join('path', 'to', '..', 'file.ts');
            const expected = path.normalize(path.join('path', 'file.ts'));
            expect(pathUtils_1.PathUtils.normalizePath(input)).toBe(expected);
        });
    });
    describe('join', () => {
        it('should join paths', () => {
            expect(pathUtils_1.PathUtils.join('path', 'to', 'file.ts')).toBe(path.join('path', 'to', 'file.ts'));
        });
    });
});
//# sourceMappingURL=pathUtils.test.js.map