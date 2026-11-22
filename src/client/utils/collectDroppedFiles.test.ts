import { describe, it, expect } from 'vitest';

import { type Dropped, type FakeTransfer, filesTransfer, folder } from '../test-utils/dragEvents';

import { collectDroppedFiles, type DroppedFiles, isHiddenPath } from './collectDroppedFiles';

const file = (name: string): File => new File(['hello'], name);

const collect = (dropped: Dropped[], folders = true): Promise<DroppedFiles> =>
    collectDroppedFiles(filesTransfer(dropped) as unknown as DataTransfer, { folders });

// Each collected file as [name, relativePath], which is what the queue rows show.
const paths = ({ files }: DroppedFiles): [string, string | undefined][] =>
    files.map(({ file: { name }, relativePath }) => [name, relativePath]);

describe('collectDroppedFiles', () => {
    it('should return dropped files in order, without a relative path', async () => {
        const files = [file('a.txt'), file('b.txt')];

        const result = await collect(files);

        expect(result).toEqual({
            files: [{ file: files[0] }, { file: files[1] }],
            skippedFolders: [],
            emptyFolders: [],
            unreadable: [],
        });
        expect(result.files[0].file).toBe(files[0]);
    });

    it('should flatten nested folders and keep each file’s path inside the dropped folder', async () => {
        const result = await collect([
            folder('photos', [file('cover.jpg'), folder('2024', [file('a.jpg'), folder('may', [file('b.jpg')])])]),
        ]);

        expect(paths(result)).toEqual([
            ['cover.jpg', 'photos/cover.jpg'],
            ['a.jpg', 'photos/2024/a.jpg'],
            ['b.jpg', 'photos/2024/may/b.jpg'],
        ]);
    });

    it('should keep reading a folder until the browser returns an empty batch', async () => {
        const names = ['1.txt', '2.txt', '3.txt', '4.txt', '5.txt'];

        const result = await collect([folder('docs', names.map(file), { batchSize: 2 })]);

        expect(paths(result).map(([name]) => name)).toEqual(names);
    });

    it('should keep the drop order of mixed files and folders', async () => {
        const result = await collect([file('a.txt'), folder('docs', [file('b.txt')]), file('c.txt')]);

        expect(paths(result)).toEqual([
            ['a.txt', undefined],
            ['b.txt', 'docs/b.txt'],
            ['c.txt', undefined],
        ]);
    });

    it('should report dropped folders with nothing to upload, but not empty folders inside them', async () => {
        const result = await collect([
            folder('empty'),
            folder('only-hidden', [file('.DS_Store'), folder('.git', [file('HEAD')])]),
            folder('docs', [folder('drafts'), file('a.txt')]),
        ]);

        expect(result.emptyFolders).toEqual(['empty', 'only-hidden']);
        expect(paths(result)).toEqual([['a.txt', 'docs/a.txt']]);
    });

    it('should skip hidden and system files inside folders without reading hidden folders', async () => {
        const result = await collect([
            folder('project', [
                file('.DS_Store'),
                file('Thumbs.db'),
                file('desktop.ini'),
                file('.env'),
                folder('.git', [file('HEAD')], { unreadable: true }),
                file('readme.md'),
            ]),
        ]);

        expect(paths(result)).toEqual([['readme.md', 'project/readme.md']]);
        // Reading .git would have failed.
        expect(result.unreadable).toEqual([]);
    });

    it('should upload hidden files and folders that were dropped directly', async () => {
        const result = await collect([file('.env'), folder('.config', [file('settings.json')])]);

        expect(paths(result)).toEqual([
            ['.env', undefined],
            ['settings.json', '.config/settings.json'],
        ]);
    });

    it('should report what could not be read and keep everything else', async () => {
        const result = await collect([
            folder('photos', [
                file('a.jpg'),
                folder('private', [file('secret.jpg')], { unreadable: true }),
                { brokenFile: 'broken.jpg' },
            ]),
            folder('locked', [file('x.txt')], { unreadable: true }),
            file('b.txt'),
        ]);

        expect(paths(result)).toEqual([
            ['a.jpg', 'photos/a.jpg'],
            ['b.txt', undefined],
        ]);
        expect(result.unreadable).toEqual(['photos/private', 'photos/broken.jpg', 'locked']);
        expect(result.emptyFolders).toEqual([]);
    });

    it('should skip folders without reading them when folders are not allowed', async () => {
        const result = await collect([file('a.txt'), folder('photos', [file('b.jpg')], { unreadable: true })], false);

        expect(paths(result)).toEqual([['a.txt', undefined]]);
        expect(result.skippedFolders).toEqual(['photos']);
        expect(result.unreadable).toEqual([]);
    });

    it('should take the dropped items synchronously, because the browser empties them after the drop event', async () => {
        const transfer: FakeTransfer = filesTransfer([file('a.txt'), folder('docs', [file('b.txt')])]);

        const pending = collectDroppedFiles(transfer as unknown as DataTransfer, { folders: true });
        transfer.items = [];

        expect(paths(await pending)).toEqual([
            ['a.txt', undefined],
            ['b.txt', 'docs/b.txt'],
        ]);
    });

    it('should use the item’s file when the browser gives no entry, and ignore items that are not files', async () => {
        const plain = file('a.txt');
        const transfer = {
            types: ['Files'],
            items: [
                { kind: 'string', getAsFile: () => null, webkitGetAsEntry: () => null },
                { kind: 'file', getAsFile: () => plain, webkitGetAsEntry: () => null },
            ],
        };

        const result = await collectDroppedFiles(transfer as unknown as DataTransfer, { folders: true });

        expect(paths(result)).toEqual([['a.txt', undefined]]);
    });
});

describe('isHiddenPath', () => {
    it.each(['photos/.DS_Store', 'photos/Thumbs.db', 'photos/thumbs.db', 'photos/desktop.ini', 'photos/.env'])(
        'should hide system and hidden files inside a folder (%s)',
        (path) => {
            expect(isHiddenPath(path)).toBe(true);
        }
    );

    it('should hide everything inside a hidden folder', () => {
        expect(isHiddenPath('project/.git/HEAD')).toBe(true);
    });

    it.each(['photos/a.txt', 'photos/my.file.txt', 'photos/thumbs.db.txt', '.config/settings.json', '.env'])(
        'should not hide other files, or a hidden folder or file that was chosen itself (%s)',
        (path) => {
            expect(isHiddenPath(path)).toBe(false);
        }
    );
});
