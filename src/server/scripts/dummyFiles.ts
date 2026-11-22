import { readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIGITS = 6;
const SEED_FILE = /^seed-\d{6}\.txt$/;
// Writes in parallel batches: one at a time is slow over Docker's bind mount, all at once exhausts file handles.
const BATCH_SIZE = 200;

export const MAX_SEED_COUNT = 10 ** DIGITS - 1;

// Fixed width, so code-point order and numeric order agree.
export const seedFileName = (index: number): string => `seed-${String(index).padStart(DIGITS, '0')}.txt`;

// Strict, so real uploads and lookalikes such as "seed-notes.txt" are never removed.
export const isSeedFile = (name: string): boolean => SEED_FILE.test(name);

// The CLI's count argument: a whole number from 1 to MAX_SEED_COUNT, otherwise undefined.
export const parseCount = (argument: string | undefined): number | undefined => {
    if (argument === undefined || !/^\d+$/.test(argument)) {
        return undefined;
    }
    const count = Number(argument);
    return count >= 1 && count <= MAX_SEED_COUNT ? count : undefined;
};

const inBatches = async <T>(items: T[], action: (item: T) => Promise<void>): Promise<void> => {
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
        await Promise.all(items.slice(start, start + BATCH_SIZE).map(action));
    }
};

// Deletes every seed file in `dir` and returns how many there were.
export const removeSeedFiles = async (dir: string): Promise<number> => {
    const entries = await readdir(dir);
    const names = entries.filter(isSeedFile);
    await inBatches(names, (name) => rm(join(dir, name)));
    return names.length;
};

// Replaces the seed files in `dir` with exactly `count` new ones. File i holds i % 100 bytes, so sizes are mixed.
export const seedFiles = async (dir: string, count: number): Promise<void> => {
    await removeSeedFiles(dir);
    const indexes = Array.from({ length: count }, (_, i) => i + 1);
    await inBatches(indexes, (index) => writeFile(join(dir, seedFileName(index)), 'x'.repeat(index % 100)));
};
