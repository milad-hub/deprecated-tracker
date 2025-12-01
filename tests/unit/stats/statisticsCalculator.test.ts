import { StatisticsCalculator } from '../../../src/stats/statisticsCalculator';
import { DeprecatedItem } from '../../../src/interfaces';

describe('StatisticsCalculator', () => {
    let calculator: StatisticsCalculator;
    let sampleResults: DeprecatedItem[];

    beforeEach(() => {
        calculator = new StatisticsCalculator();
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
                name: 'oldFunction',
                fileName: 'utils.ts',
                filePath: '/project/src/utils.ts',
                line: 30,
                character: 0,
                kind: 'function',
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
                    line: 10,
                },
            },
            {
                name: 'oldMethod',
                fileName: 'component.ts',
                filePath: '/project/src/component.ts',
                line: 60,
                character: 15,
                kind: 'usage',
                deprecatedDeclaration: {
                    name: 'oldMethod',
                    fileName: 'service.ts',
                    filePath: '/project/src/service.ts',
                    line: 10,
                },
            },
            {
                name: 'deprecatedProp',
                fileName: 'service.ts',
                filePath: '/project/src/service.ts',
                line: 50,
                character: 8,
                kind: 'usage',
                deprecatedDeclaration: {
                    name: 'deprecatedProp',
                    fileName: 'model.ts',
                    filePath: '/project/src/model.ts',
                    line: 25,
                },
            },
        ];
    });

    describe('calculateStatistics', () => {
        it('should calculate total items correctly', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            expect(stats.totalItems).toBe(6);
        });

        it('should calculate declarations and usages correctly', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            expect(stats.totalDeclarations).toBe(3);
            expect(stats.totalUsages).toBe(3);
        });

        it('should handle empty results', () => {
            const stats = calculator.calculateStatistics([]);
            expect(stats.totalItems).toBe(0);
            expect(stats.totalDeclarations).toBe(0);
            expect(stats.totalUsages).toBe(0);
            expect(stats.topMostUsed).toEqual([]);
            expect(stats.hotspotFiles).toEqual([]);
        });

        it('should calculate breakdown by kind', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            expect(stats.byKind.method).toBe(1);
            expect(stats.byKind.property).toBe(1);
            expect(stats.byKind.function).toBe(1);
            expect(stats.byKind.usage).toBe(3);
            expect(stats.byKind.class).toBe(0);
            expect(stats.byKind.interface).toBe(0);
        });

        it('should calculate top most used items correctly', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            expect(stats.topMostUsed).toHaveLength(2);
            expect(stats.topMostUsed[0].name).toBe('oldMethod');
            expect(stats.topMostUsed[0].usageCount).toBe(2);
            expect(stats.topMostUsed[1].name).toBe('deprecatedProp');
            expect(stats.topMostUsed[1].usageCount).toBe(1);
        });

        it('should limit top most used to 10 items', () => {
            const manyUsages: DeprecatedItem[] = [];
            for (let i = 0; i < 15; i++) {
                manyUsages.push({
                    name: `method${i}`,
                    fileName: `file${i}.ts`,
                    filePath: `/project/file${i}.ts`,
                    line: 10,
                    character: 0,
                    kind: 'usage',
                    deprecatedDeclaration: {
                        name: `method${i}`,
                        fileName: `decl${i}.ts`,
                        filePath: `/project/decl${i}.ts`,
                        line: 5,
                    },
                });
            }
            const stats = calculator.calculateStatistics(manyUsages);
            expect(stats.topMostUsed.length).toBeLessThanOrEqual(10);
        });

        it('should calculate hotspot files correctly', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            expect(stats.hotspotFiles.length).toBeGreaterThan(0);
            expect(stats.hotspotFiles[0].count).toBeGreaterThanOrEqual(1);
        });

        it('should sort hotspot files by count descending', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            for (let i = 1; i < stats.hotspotFiles.length; i++) {
                expect(stats.hotspotFiles[i - 1].count).toBeGreaterThanOrEqual(stats.hotspotFiles[i].count);
            }
        });

        it('should limit hotspot files to 10', () => {
            const manyFiles: DeprecatedItem[] = [];
            for (let i = 0; i < 15; i++) {
                manyFiles.push({
                    name: `method${i}`,
                    fileName: `file${i}.ts`,
                    filePath: `/project/file${i}.ts`,
                    line: 10,
                    character: 0,
                    kind: 'method',
                });
            }
            const stats = calculator.calculateStatistics(manyFiles);
            expect(stats.hotspotFiles.length).toBeLessThanOrEqual(10);
        });

        it('should handle items without usages', () => {
            const declarationsOnly: DeprecatedItem[] = [
                {
                    name: 'oldMethod',
                    fileName: 'service.ts',
                    filePath: '/project/src/service.ts',
                    line: 10,
                    character: 5,
                    kind: 'method',
                },
                {
                    name: 'oldProp',
                    fileName: 'model.ts',
                    filePath: '/project/src/model.ts',
                    line: 20,
                    character: 0,
                    kind: 'property',
                },
            ];
            const stats = calculator.calculateStatistics(declarationsOnly);
            expect(stats.totalItems).toBe(2);
            expect(stats.totalDeclarations).toBe(2);
            expect(stats.totalUsages).toBe(0);
            expect(stats.topMostUsed).toEqual([]);
        });

        it('should handle duplicate files in hotspots correctly', () => {
            const duplicateFiles: DeprecatedItem[] = [
                {
                    name: 'method1',
                    fileName: 'file.ts',
                    filePath: '/project/file.ts',
                    line: 10,
                    character: 0,
                    kind: 'method',
                },
                {
                    name: 'method2',
                    fileName: 'file.ts',
                    filePath: '/project/file.ts',
                    line: 20,
                    character: 0,
                    kind: 'property',
                },
                {
                    name: 'method3',
                    fileName: 'file.ts',
                    filePath: '/project/file.ts',
                    line: 30,
                    character: 0,
                    kind: 'function',
                },
            ];
            const stats = calculator.calculateStatistics(duplicateFiles);
            expect(stats.hotspotFiles).toHaveLength(1);
            expect(stats.hotspotFiles[0].count).toBe(3);
            expect(stats.hotspotFiles[0].fileName).toBe('file.ts');
        });

        it('should include file names in hotspot data', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            stats.hotspotFiles.forEach((hotspot) => {
                expect(hotspot.fileName).toBeDefined();
                expect(hotspot.filePath).toBeDefined();
                expect(typeof hotspot.fileName).toBe('string');
                expect(typeof hotspot.filePath).toBe('string');
            });
        });

        it('should include file names in top most used data', () => {
            const stats = calculator.calculateStatistics(sampleResults);
            stats.topMostUsed.forEach((item) => {
                expect(item.name).toBeDefined();
                expect(item.fileName).toBeDefined();
                expect(item.filePath).toBeDefined();
                expect(typeof item.name).toBe('string');
                expect(typeof item.fileName).toBe('string');
                expect(typeof item.filePath).toBe('string');
            });
        });
    });
});
