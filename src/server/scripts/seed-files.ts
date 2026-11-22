// Fills uploads/ with dummy files for stress testing the file list, or removes them again.
//   npm run seed -- <count>
//   npm run seed:clean
import { MAX_SEED_COUNT, parseCount, removeSeedFiles, seedFiles } from './dummyFiles';

const UPLOAD_DIR = 'uploads';

const run = async ([command, argument]: string[]): Promise<void> => {
    const count = parseCount(argument);
    const started = performance.now();
    const elapsed = (): string => `${((performance.now() - started) / 1000).toFixed(1)} s`;

    if (command === 'seed' && count !== undefined) {
        await seedFiles(UPLOAD_DIR, count);
        console.log(`Seeded ${count} files into ${UPLOAD_DIR}/ in ${elapsed()}.`);
    } else if (command === 'clean') {
        const removed = await removeSeedFiles(UPLOAD_DIR);
        console.log(`Removed ${removed} seed files from ${UPLOAD_DIR}/ in ${elapsed()}.`);
    } else {
        console.error(`Usage: npm run seed -- <count> (1 to ${MAX_SEED_COUNT}), or npm run seed:clean`);
        process.exitCode = 1;
    }
};

// Not top-level await: tsconfig.node.json sets no `target`, so TypeScript would reject it.
run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
});
