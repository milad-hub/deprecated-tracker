import * as fs from 'fs';
import * as path from 'path';
import { ConfigReader } from '../../../src/config/configReader';

describe('ConfigReader customTags and ignoreMethods', () => {
    let testDir: string;
    let warnings: string[];
    let configReader: ConfigReader;

    const writeConfig = (config: unknown): void => {
        fs.writeFileSync(
            path.join(testDir, '.deprecatedtrackerrc'),
            JSON.stringify(config),
            'utf8'
        );
    };

    beforeEach(() => {
        warnings = [];
        configReader = new ConfigReader((message) => warnings.push(message));
        testDir = path.join(__dirname, `test-cli-keys-${Date.now()}`);
        fs.mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    describe('customTags', () => {
        it('reads tag and description', async () => {
            writeConfig({
                customTags: [{ tag: '@legacy', description: 'Old code' }],
            });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([
                { tag: '@legacy', description: 'Old code' },
            ]);
        });

        it('defaults a missing description', async () => {
            writeConfig({ customTags: [{ tag: '@legacy' }] });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([
                { tag: '@legacy', description: '' },
            ]);
        });

        it('leaves the key absent when it is not configured', async () => {
            writeConfig({ severity: 'error' });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toBeUndefined();
        });

        // The gate this whole key exists for: a reserved tag must be refused
        // here exactly as the settings page refuses it.
        it('drops a reserved JSDoc tag and says why', async () => {
            writeConfig({
                customTags: [{ tag: '@param' }, { tag: '@legacy' }],
            });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([
                { tag: '@legacy', description: '' },
            ]);
            expect(warnings.join('\n')).toContain(
                'conflicts with reserved JSDoc tag'
            );
        });

        it('drops a tag with no @ prefix', async () => {
            writeConfig({ customTags: [{ tag: 'legacy' }] });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([]);
            expect(warnings.join('\n')).toContain('Tag must start with @');
        });

        it('drops a duplicate, keeping the first', async () => {
            writeConfig({
                customTags: [
                    { tag: '@legacy', description: 'first' },
                    { tag: '@Legacy', description: 'second' },
                ],
            });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([
                { tag: '@legacy', description: 'first' },
            ]);
            expect(warnings.join('\n')).toContain('duplicate custom tag');
        });

        it.each([[null], ['@legacy'], [42]])(
            'drops a non-object entry (%p)',
            async (entry) => {
                writeConfig({ customTags: [entry] });

                const config = await configReader.loadConfiguration(testDir);

                expect(config.customTags).toEqual([]);
                expect(warnings.join('\n')).toContain('Invalid customTags');
            }
        );

        it('drops an entry whose description is not a string', async () => {
            writeConfig({ customTags: [{ tag: '@legacy', description: 7 }] });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toEqual([]);
            expect(warnings.join('\n')).toContain('description must be a string');
        });

        it('rejects a non-array value outright', async () => {
            writeConfig({ customTags: { tag: '@legacy' } });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.customTags).toBeUndefined();
            expect(warnings.join('\n')).toContain('Expected an array');
        });
    });

    describe('ignoreMethods', () => {
        it('keeps compilable patterns', async () => {
            writeConfig({ ignoreMethods: ['^legacy[A-Z]', '^internal_'] });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.ignoreMethods).toEqual(['^legacy[A-Z]', '^internal_']);
        });

        it('drops a pattern that does not compile', async () => {
            writeConfig({ ignoreMethods: ['([unclosed', '^ok'] });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.ignoreMethods).toEqual(['^ok']);
            expect(warnings.join('\n')).toContain('invalid ignoreMethods pattern');
        });

        it('rejects a non-array value', async () => {
            writeConfig({ ignoreMethods: '^legacy' });

            const config = await configReader.loadConfiguration(testDir);

            expect(config.ignoreMethods).toBeUndefined();
            expect(warnings.join('\n')).toContain('Expected array of strings');
        });
    });

    describe('the warning channel', () => {
        // Inside a hook this is the only feedback a broken config produces.
        it('reports unreadable JSON through the injected channel', async () => {
            fs.writeFileSync(
                path.join(testDir, '.deprecatedtrackerrc'),
                '{ not json',
                'utf8'
            );

            await configReader.loadConfiguration(testDir);

            expect(warnings.join('\n')).toContain(
                'Failed to load configuration from .deprecatedtrackerrc'
            );
        });

        it('reports an unreadable package.json block', async () => {
            fs.writeFileSync(
                path.join(testDir, 'package.json'),
                '{ not json',
                'utf8'
            );

            await configReader.loadConfiguration(testDir);

            expect(warnings.join('\n')).toContain(
                'Failed to load configuration from package.json'
            );
        });

        it('warns about a bad severity', async () => {
            writeConfig({ severity: 'loud' });

            await configReader.loadConfiguration(testDir);

            expect(warnings.join('\n')).toContain('Invalid severity');
        });

        it('falls back to console.warn when no channel is given', async () => {
            const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            writeConfig({ severity: 'loud' });

            await new ConfigReader().loadConfiguration(testDir);

            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Invalid severity'));
            spy.mockRestore();
        });
    });
});
