// @vitest-environment node
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isSeedFile, parseCount, removeSeedFiles, seedFileName, seedFiles } from '../scripts/dummyFiles';

describe('seedFileName', () => {
    it('pads the index to six digits', () => {
        expect(seedFileName(1)).toBe('seed-000001.txt');
        expect(seedFileName(100_000)).toBe('seed-100000.txt');
    });

    it('sorts by index in code-point order', () => {
        expect(seedFileName(9) < seedFileName(10)).toBe(true);
    });
});

describe('isSeedFile', () => {
    it('accepts generated names', () => {
        expect(isSeedFile(seedFileName(1))).toBe(true);
        expect(isSeedFile(seedFileName(999_999))).toBe(true);
    });

    it.each([
        '.gitkeep',
        'seed-1.txt',
        'seed-notes.txt',
        'my-seed-000001.txt',
        'seed-000001.txt.part_0',
        'seed-0000001.txt',
    ])('rejects %s', (name) => {
        expect(isSeedFile(name)).toBe(false);
    });
});

describe('parseCount', () => {
    it('accepts a positive integer', () => {
        expect(parseCount('10000')).toBe(10_000);
        expect(parseCount('999999')).toBe(999_999);
    });

    it.each([undefined, '', 'abc', '0', '-5', '1.5', '1e3', '1000000'])('rejects %s', (argument) => {
        expect(parseCount(argument)).toBeUndefined();
    });
});

describe('seeding and cleanup', () => {
    let dir: string;

    const list = async (): Promise<string[]> => {
        const names = await readdir(dir);
        return names.sort();
    };
    const listSeedFiles = async (): Promise<string[]> => {
        const names = await list();
        return names.filter(isSeedFile);
    };
    const sizeOf = async (name: string): Promise<number> => {
        const stats = await stat(join(dir, name));
        return stats.size;
    };

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'seed-test-'));
        await writeFile(join(dir, '.gitkeep'), '');
        await writeFile(join(dir, 'report.pdf'), 'real upload');
        await writeFile(join(dir, 'seed-notes.txt'), 'lookalike');
    });

    afterEach(async () => {
        await rm(dir, { recursive: true });
    });

    it('creates the files with mixed sizes and leaves other files untouched', async () => {
        await seedFiles(dir, 100);

        expect(await listSeedFiles()).toHaveLength(100);
        expect(await list()).toEqual(expect.arrayContaining(['.gitkeep', 'report.pdf', 'seed-notes.txt']));
        expect(await sizeOf(seedFileName(42))).toBe(42);
        expect(await sizeOf(seedFileName(100))).toBe(0);
        expect(await sizeOf('report.pdf')).toBe('real upload'.length);
    });

    it('replaces earlier seed files, so a smaller count leaves exactly that many', async () => {
        await seedFiles(dir, 30);
        await seedFiles(dir, 5);

        expect(await listSeedFiles()).toEqual([1, 2, 3, 4, 5].map(seedFileName));
    });

    it('removes only seed files and returns how many it removed', async () => {
        await seedFiles(dir, 12);

        expect(await removeSeedFiles(dir)).toBe(12);
        expect(await list()).toEqual(['.gitkeep', 'report.pdf', 'seed-notes.txt']);
    });
});
