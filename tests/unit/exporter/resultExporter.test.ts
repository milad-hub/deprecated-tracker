import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ResultExporter } from '../../../src/exporter';
import { DeprecatedItem } from '../../../src/interfaces';

describe('ResultExporter', () => {
    let exporter: ResultExporter;
    let sampleResults: DeprecatedItem[];

    beforeEach(() => {
        exporter = new ResultExporter();
        sampleResults = [
            {
                name: 'oldMethod',
                fileName: 'service.ts',
                filePath: '/project/src/service.ts',
                line: 10,
                character: 5,
                kind: 'method',
            },
            {
                name: 'deprecatedProp',
                fileName: 'model.ts',
                filePath: '/project/src/model.ts',
                line: 25,
                character: 2,
                kind: 'property',
            },
            {
                name: 'oldMethod',
                fileName: 'app.ts',
                filePath: '/project/src/app.ts',
                line: 45,
                character: 10,
                kind: 'usage',
                deprecatedDeclaration: {
                    name: 'oldMethod',
                    fileName: 'service.ts',
                    filePath: '/project/src/service.ts',
                },
            },
        ];
    });

    describe('exportToCSV', () => {
        it('should export results to CSV format', () => {
            const csv = exporter.exportToCSV(sampleResults);
            expect(csv).toContain('Name,File,Line,Column,Kind,Declaration File,Declaration Line,Deprecation Reason');
            expect(csv).toContain('oldMethod,service.ts,10,5,method');
            expect(csv).toContain('deprecatedProp,model.ts,25,2,property');
            expect(csv).toContain('oldMethod,app.ts,45,10,usage,service.ts');
        });

        it('should handle empty results', () => {
            const csv = exporter.exportToCSV([]);
            expect(csv).toBe('Name,File,Line,Column,Kind,Declaration File,Declaration Line,Deprecation Reason');
        });

        it('should escape CSV values with commas', () => {
            const itemWithComma: DeprecatedItem = {
                name: 'method,with,commas',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
            };
            const csv = exporter.exportToCSV([itemWithComma]);
            expect(csv).toContain('"method,with,commas"');
        });

        it('should escape CSV values with quotes', () => {
            const itemWithQuotes: DeprecatedItem = {
                name: 'method"with"quotes',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
            };
            const csv = exporter.exportToCSV([itemWithQuotes]);
            expect(csv).toContain('"method""with""quotes"');
        });

        it('should handle items without declarations', () => {
            const itemWithoutDecl: DeprecatedItem = {
                name: 'standalone',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
            };
            const csv = exporter.exportToCSV([itemWithoutDecl]);
            expect(csv).toContain('standalone,file.ts,1,0,method,,,');
        });

        it('should include deprecation reason in CSV', () => {
            const itemWithReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
                deprecationReason: 'Use newMethod() instead',
            };
            const csv = exporter.exportToCSV([itemWithReason]);
            expect(csv).toContain('Use newMethod() instead');
        });

        it('should escape commas in deprecation reason', () => {
            const itemWithCommaReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
                deprecationReason: 'Use newMethod(), avoid oldMethod()',
            };
            const csv = exporter.exportToCSV([itemWithCommaReason]);
            expect(csv).toContain('"Use newMethod(), avoid oldMethod()"');
        });

        it('should handle empty deprecation reason', () => {
            const itemNoReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
            };
            const csv = exporter.exportToCSV([itemNoReason]);
            const lines = csv.split('\n');
            expect(lines[1]).toMatch(/oldMethod,file\.ts,1,0,method,,,$/);
        });
    });

    describe('exportToJSON', () => {
        it('should export results to JSON format', () => {
            const json = exporter.exportToJSON(sampleResults);
            const parsed = JSON.parse(json);
            expect(Array.isArray(parsed)).toBe(true);
            expect(parsed).toHaveLength(3);
            expect(parsed[0].name).toBe('oldMethod');
            expect(parsed[0].kind).toBe('method');
        });

        it('should pretty print JSON', () => {
            const json = exporter.exportToJSON(sampleResults);
            expect(json).toContain('\n');
            expect(json).toContain('  ');
        });

        it('should handle empty results', () => {
            const json = exporter.exportToJSON([]);
            expect(json).toBe('[]');
        });

        it('should preserve all item properties', () => {
            const json = exporter.exportToJSON(sampleResults);
            const parsed = JSON.parse(json);
            expect(parsed[0]).toHaveProperty('name');
            expect(parsed[0]).toHaveProperty('fileName');
            expect(parsed[0]).toHaveProperty('filePath');
            expect(parsed[0]).toHaveProperty('line');
            expect(parsed[0]).toHaveProperty('character');
            expect(parsed[0]).toHaveProperty('kind');
        });

        it('should include deprecationReason field in JSON when present', () => {
            const itemWithReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
                deprecationReason: 'Use newMethod() instead',
            };
            const json = exporter.exportToJSON([itemWithReason]);
            const parsed = JSON.parse(json);
            expect(parsed[0]).toHaveProperty('deprecationReason');
            expect(parsed[0].deprecationReason).toBe('Use newMethod() instead');
        });
    });

    describe('exportToMarkdown', () => {
        it('should export results to Markdown format', () => {
            const markdown = exporter.exportToMarkdown(sampleResults);
            expect(markdown).toContain('# Deprecated Items Report');
            expect(markdown).toContain('**Total Items**: 3');
            expect(markdown).toContain('**Declarations**: 2');
            expect(markdown).toContain('**Usages**: 1');
            expect(markdown).toContain('| Name | File | Line | Kind | Declaration | Reason |');
            expect(markdown).toContain('| oldMethod | service.ts | 10 | method | - |');
        });

        it('should handle empty results', () => {
            const markdown = exporter.exportToMarkdown([]);
            expect(markdown).toContain('# Deprecated Items Report');
            expect(markdown).toContain('**Total Items**: 0');
            expect(markdown).toContain('*No deprecated items found.*');
        });

        it('should include generation timestamp', () => {
            const markdown = exporter.exportToMarkdown(sampleResults);
            expect(markdown).toContain('**Generated**:');
        });

        it('should count declarations and usages correctly', () => {
            const markdown = exporter.exportToMarkdown(sampleResults);
            expect(markdown).toContain('**Declarations**: 2');
            expect(markdown).toContain('**Usages**: 1');
        });

        it('should show declaration file for usages', () => {
            const markdown = exporter.exportToMarkdown([sampleResults[2]]);
            expect(markdown).toContain('| oldMethod | app.ts | 45 | usage | service.ts |');
        });

        it('should include deprecation reason in markdown', () => {
            const itemWithReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
                deprecationReason: 'Use newMethod() instead',
            };
            const markdown = exporter.exportToMarkdown([itemWithReason]);
            expect(markdown).toContain('Use newMethod() instead');
        });

        it('should truncate long deprecation reasons in markdown', () => {
            const longReason = 'This is a very long deprecation reason that should be truncated to fit in the table nicely';
            const itemWithLongReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
                deprecationReason: longReason,
            };
            const markdown = exporter.exportToMarkdown([itemWithLongReason]);
            expect(markdown).toContain('...');
            expect(markdown).not.toContain(longReason);
        });

        it('should show dash for empty deprecation reason', () => {
            const itemNoReason: DeprecatedItem = {
                name: 'oldMethod',
                fileName: 'file.ts',
                filePath: '/project/file.ts',
                line: 1,
                character: 0,
                kind: 'method',
            };
            const markdown = exporter.exportToMarkdown([itemNoReason]);
            const lines = markdown.split('\n');
            const dataLine = lines.find(l => l.includes('oldMethod'));
            expect(dataLine).toContain('| - |');
        });
    });

    describe('saveToFile', () => {
        let tempFilePath: string;

        beforeEach(() => {
            tempFilePath = path.join(os.tmpdir(), `test-export-${Date.now()}.txt`);
        });

        afterEach(() => {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        });

        it('should save content to file', async () => {
            const content = 'test content';
            await exporter.saveToFile(content, tempFilePath);
            expect(fs.existsSync(tempFilePath)).toBe(true);
            const savedContent = fs.readFileSync(tempFilePath, 'utf8');
            expect(savedContent).toBe(content);
        });

        it('should handle file write errors', async () => {
            const invalidPath = '/invalid/path/file.txt';
            await expect(exporter.saveToFile('content', invalidPath)).rejects.toThrow();
        });

        it('should overwrite existing file', async () => {
            fs.writeFileSync(tempFilePath, 'old content', 'utf8');
            await exporter.saveToFile('new content', tempFilePath);
            const savedContent = fs.readFileSync(tempFilePath, 'utf8');
            expect(savedContent).toBe('new content');
        });
    });
});