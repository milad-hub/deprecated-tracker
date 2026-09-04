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

        it('should replace default trustedPackages with configured values', async () => {
            const config: Partial<DeprecatedTrackerConfig> = {
                trustedPackages: ['custom-lib'],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toEqual(['custom-lib']);
        });

        it('should support an empty trustedPackages allowlist', async () => {
            fs.writeFileSync(
                path.join(testDir, '.deprecatedtrackerrc'),
                JSON.stringify({ trustedPackages: [] })
            );

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toEqual([]);
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
                severity: 'info',
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await configReader.loadConfiguration(testDir);

            expect(result.trustedPackages).toContain('my-lib');
            expect(result.excludePatterns).toEqual(['**/*.spec.ts']);
            expect(result.includePatterns).toEqual(['src/**/*.ts']);
            expect(result.severity).toBe('info');
        });

        it('should warn about a key outside the schema and keep the valid ones', async () => {
            const warnings: string[] = [];
            const reader = new ConfigReader((message) => warnings.push(message));
            const config = {
                trustedPackage: ['my-lib'],
                excludePatterns: ['**/*.spec.ts'],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            const result = await reader.loadConfiguration(testDir);

            expect(warnings).toEqual([
                'Unknown configuration key "trustedPackage". Expected one of: trustedPackages, suppressPackages, excludePatterns, includePatterns, severity, customTags, ignoreMethods.',
            ]);
            expect(result.excludePatterns).toEqual(['**/*.spec.ts']);
            expect(result.trustedPackages).toContain('rxjs');
        });

        it('should stay silent on a config that uses every schema key', async () => {
            const warnings: string[] = [];
            const reader = new ConfigReader((message) => warnings.push(message));
            const config: DeprecatedTrackerConfig = {
                trustedPackages: ['my-lib'],
                excludePatterns: ['**/*.spec.ts'],
                includePatterns: ['src/**/*.ts'],
                severity: 'info',
                customTags: [{ tag: '@legacy' }],
                ignoreMethods: ['^old'],
            };

            fs.writeFileSync(path.join(testDir, '.deprecatedtrackerrc'), JSON.stringify(config));

            await reader.loadConfiguration(testDir);

            expect(warnings).toEqual([]);
        });
    });
});

describe("resolveConfiguration", () => {
    let reader: ConfigReader;
    let dir: string;

    beforeEach(() => {
        reader = new ConfigReader();
        dir = path.join(__dirname, `test-resolve-${Date.now()}`);
        fs.mkdirSync(dir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('names the rc file it read', async () => {
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({ excludePatterns: ['**/*.spec.ts'] })
        );

        const resolved = await reader.resolveConfiguration(dir);

        expect(resolved.source).toEqual({
            kind: 'rc',
            path: path.join(dir, '.deprecatedtrackerrc'),
        });
        expect(resolved.config.excludePatterns).toEqual(['**/*.spec.ts']);
    });

    it('names package.json when that is where the block lives', async () => {
        fs.writeFileSync(
            path.join(dir, 'package.json'),
            JSON.stringify({ deprecatedTracker: { severity: 'error' } })
        );

        const resolved = await reader.resolveConfiguration(dir);

        expect(resolved.source).toEqual({
            kind: 'package.json',
            path: path.join(dir, 'package.json'),
        });
        expect(resolved.config.severity).toBe('error');
    });

    it('says so when nothing on disk was read', async () => {
        const resolved = await reader.resolveConfiguration(dir);

        expect(resolved.source).toEqual({ kind: 'defaults', path: null });
    });

    it('makes the scanned tree inert with useProjectConfig false', async () => {
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({ excludePatterns: ['**/*'] })
        );

        const resolved = await reader.resolveConfiguration(dir, {
            useProjectConfig: false,
        });

        expect(resolved.source).toEqual({ kind: 'defaults', path: null });
        expect(resolved.config.excludePatterns).toEqual([]);
    });

    it('takes an explicit path over the tree, and says which', async () => {
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({ excludePatterns: ['**/*'] })
        );
        const pinned = path.join(dir, 'pinned.json');
        fs.writeFileSync(pinned, JSON.stringify({ severity: 'error' }));

        const resolved = await reader.resolveConfiguration(dir, {
            explicitPath: pinned,
        });

        expect(resolved.source).toEqual({ kind: 'explicit', path: pinned });
        expect(resolved.config.excludePatterns).toEqual([]);
        expect(resolved.config.severity).toBe('error');
    });

    it('throws rather than falling back when the named file is missing', async () => {
        const missing = path.join(dir, 'nope.json');

        await expect(
            reader.resolveConfiguration(dir, { explicitPath: missing })
        ).rejects.toThrow(`Could not read config file: ${missing}`);
    });

    it('throws on an explicit file that is not JSON', async () => {
        const broken = path.join(dir, 'broken.json');
        fs.writeFileSync(broken, '{ not json');

        await expect(
            reader.resolveConfiguration(dir, { explicitPath: broken })
        ).rejects.toThrow(`Invalid JSON in ${broken}`);
    });

    it('merges suppressPackages with trustedPackages rather than picking one', async () => {
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({
                trustedPackages: ['rxjs', 'lodash'],
                suppressPackages: ['lodash', 'moment'],
            })
        );

        const resolved = await reader.resolveConfiguration(dir);

        expect(resolved.config.trustedPackages).toEqual([
            'rxjs',
            'lodash',
            'moment',
        ]);
        expect(resolved.config.suppressPackages).toEqual([
            'rxjs',
            'lodash',
            'moment',
        ]);
    });

    it('accepts suppressPackages on its own', async () => {
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({ suppressPackages: ['only-this'] })
        );

        const resolved = await reader.resolveConfiguration(dir);

        expect(resolved.config.trustedPackages).toEqual(['only-this']);
    });

    it('warns about a suppressPackages that is not an array of strings', async () => {
        const warnings: string[] = [];
        fs.writeFileSync(
            path.join(dir, '.deprecatedtrackerrc'),
            JSON.stringify({ suppressPackages: 'lodash' })
        );

        const resolved = await new ConfigReader((message) =>
            warnings.push(message)
        ).resolveConfiguration(dir);

        expect(warnings).toContain(
            'Invalid suppressPackages configuration. Expected array of strings.'
        );
        expect(resolved.config.trustedPackages).toContain('rxjs');
    });
});
