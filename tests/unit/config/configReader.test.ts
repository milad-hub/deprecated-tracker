import * as fs from 'fs';
import * as path from 'path';
import { ConfigReader } from '../../../src/config/configReader';
import { DeprecatedTrackerConfig } from '../../../src/interfaces';

describe('ConfigReader', () => {
    let configReader: ConfigReader;
    let testDir: string;

    beforeEach(() => {
        configReader = new ConfigReader();
        testDir = path.join(__dirname, `test-config-${Date.now()}`);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
    });

    describe('loadConfiguration', () => {
        it('should load configuration from .deprecatedtrackerrc', async () => {
            const config: Partial<DeprecatedTrackerConfig> = {
                trustedPackages: ['custom-lib'],
                excludePatterns: ['**/*.test.ts'],
                severity: 'error',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('custom-lib');
            expect(result.excludePatterns).toEqual(['**/*.test.ts']);
            expect(result.severity).toBe('error');
        });

        it('should load configuration from package.json', async () => {
            const packageJson = {
                name: 'test-package',
                deprecatedTracker: {
                    trustedPackages: ['package-lib'],
                    includePatterns: ['src/**/*.ts'],
                },
            };

            fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('package-lib');
            expect(result.includePatterns).toEqual(['src/**/*.ts']);
        });

        it('should prioritize .deprecatedtrackerrc over package.json', async () => {
            const rcConfig: Partial<DeprecatedTrackerConfig> = {
                trustedPackages: ['rc-lib'],
            };

            const packageJson = {
                name: 'test-package',
                deprecatedTracker: {
                    trustedPackages: ['pkg-lib'],
                },
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(rcConfig));
            fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rc-lib');
            expect(result.trustedPackages).not.toContain('pkg-lib');
        });

        it('should return default configuration when no config files exist', async () => {
            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
            expect(result.trustedPackages).toContain('lodash');
            expect(result.excludePatterns).toEqual([]);
            expect(result.includePatterns).toEqual([]);
            expect(result.severity).toBe('warning');
        });

        it('should handle malformed JSON gracefully', async () => {
            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), '{invalid json}');

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
        });

        it('should handle empty configuration file', async () => {
            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), '{}');

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
            expect(result.excludePatterns).toEqual([]);
        });

        it('should merge custom trustedPackages with defaults', async () => {
            const config: Partial<DeprecatedTrackerConfig> = {
                trustedPackages: ['custom-lib'],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
            expect(result.trustedPackages).toContain('lodash');
            expect(result.trustedPackages).toContain('custom-lib');
        });

        it('should validate trustedPackages as string array', async () => {
            const config = {
                trustedPackages: ['valid', 123, null],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
        });

        it('should validate excludePatterns as string array', async () => {
            const config = {
                excludePatterns: '**/*.test.ts',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.excludePatterns).toEqual([]);
        });

        it('should validate includePatterns as string array', async () => {
            const config = {
                includePatterns: ['src/**/*.ts', 123],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.includePatterns).toEqual([]);
        });

        it('should validate ignoreDeprecatedInComments as boolean', async () => {
            const config = {
                ignoreDeprecatedInComments: 'true',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.ignoreDeprecatedInComments).toBe(false);
        });

        it('should validate severity enum values', async () => {
            const config = {
                severity: 'invalid',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.severity).toBe('warning');
        });

        it('should accept valid severity values', async () => {
            const severities: Array<'info' | 'warning' | 'error'> = ['info', 'warning', 'error'];

            for (const severity of severities) {
                const config = { severity };
                fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

                const result = await configReader.loadConfiguration(testDir);

                expect(result.severity).toBe(severity);
            }
        });

        it('should handle package.json without deprecatedTracker key', async () => {
            const packageJson = {
                name: 'test-package',
                version: '1.0.0',
            };

            fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
        });

        it('should handle package.json with non-object deprecatedTracker', async () => {
            const packageJson = {
                name: 'test-package',
                deprecatedTracker: 'invalid',
            };

            fs.writeFileSync(path.join(testDir, 'package.json'), JSON.stringify(packageJson));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('rxjs');
        });

        it('should apply all valid configuration options together', async () => {
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['my-lib'],
                excludePatterns: ['**/*.spec.ts'],
                includePatterns: ['src/**/*.ts'],
                ignoreDeprecatedInComments: true,
                severity: 'info',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('my-lib');
            expect(result.excludePatterns).toEqual(['**/*.spec.ts']);
            expect(result.includePatterns).toEqual(['src/**/*.ts']);
            expect(result.ignoreDeprecatedInComments).toBe(true);
            expect(result.severity).toBe('info');
        });
    });
});
