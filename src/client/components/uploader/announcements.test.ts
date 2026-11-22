import { describe, it, expect } from 'vitest';

import { type UploadItem, type UploadStatus } from '../../hooks/useUploadQueue';

import { describeNotAdded, describeQueueChanges } from './announcements';

const item = (id: string, status: UploadStatus, error?: string): UploadItem => ({
    id,
    file: new File(['hello'], `${id}.txt`),
    status,
    loadedBytes: 0,
    error,
});

// The same item in a new status, as the queue hook produces it.
const as = (previous: UploadItem, status: UploadStatus, error?: string): UploadItem => ({ ...previous, status, error });

// A queued file found at `relativePath` inside a dropped or picked folder.
const inFolder = (id: string, relativePath: string): UploadItem => ({ ...item(id, 'queued'), relativePath });

describe('describeQueueChanges', () => {
    it('should say nothing when nothing changed', () => {
        const items = [item('a', 'uploading')];
        expect(describeQueueChanges(items, items)).toBe('');
        expect(describeQueueChanges([], [])).toBe('');
    });

    it('should say nothing for progress-only changes', () => {
        const before = item('a', 'uploading');
        expect(describeQueueChanges([before], [{ ...before, loadedBytes: 3 }])).toBe('');
    });

    it('should name a single added file', () => {
        expect(describeQueueChanges([], [item('a', 'queued')])).toBe('Uploading "a.txt".');
    });

    it('should count several added files, including files already started', () => {
        const added = [item('a', 'uploading'), item('b', 'queued'), item('c', 'queued')];
        expect(describeQueueChanges([], added)).toBe('Uploading 3 files.');
    });

    it('should name the folder when every added file comes from the same dropped or picked folder', () => {
        expect(describeQueueChanges([], [inFolder('a', 'photos/a.txt')])).toBe('Uploading "a.txt" from "photos".');
        expect(describeQueueChanges([], [inFolder('a', 'photos/a.txt'), inFolder('b', 'photos/2024/b.txt')])).toBe(
            'Uploading 2 files from "photos".'
        );
    });

    it('should only count the files when they come from several folders or not from a folder', () => {
        expect(describeQueueChanges([], [inFolder('a', 'photos/a.txt'), inFolder('b', 'docs/b.txt')])).toBe(
            'Uploading 2 files.'
        );
        expect(describeQueueChanges([], [inFolder('a', 'photos/a.txt'), item('b', 'queued')])).toBe(
            'Uploading 2 files.'
        );
    });

    it('should only count the files added in this change', () => {
        const existing = item('a', 'uploading');
        expect(describeQueueChanges([existing], [existing, item('b', 'queued')])).toBe('Uploading "b.txt".');
    });

    it('should name a single rejected file with its reason', () => {
        expect(describeQueueChanges([], [item('a', 'rejected', 'File type not allowed')])).toBe(
            '"a.txt" not uploaded: File type not allowed.'
        );
    });

    it('should count several rejected files', () => {
        const rejected = [item('a', 'rejected', 'Too big'), item('b', 'rejected', 'File type not allowed')];
        expect(describeQueueChanges([], rejected)).toBe('2 files not uploaded.');
    });

    it('should report accepted and rejected files of the same add', () => {
        const added = [item('a', 'queued'), item('b', 'queued'), item('c', 'rejected', 'Too big')];
        expect(describeQueueChanges([], added)).toBe('Uploading 2 files. "c.txt" not uploaded: Too big.');
    });

    it('should name a single failed file with its error', () => {
        const before = [item('a', 'uploading'), item('b', 'uploading')];
        const after = [as(before[0], 'error', 'Network error'), before[1]];
        expect(describeQueueChanges(before, after)).toBe('"a.txt" failed: Network error.');
    });

    it('should count several files that failed in the same change', () => {
        const before = [item('a', 'uploading'), item('b', 'uploading'), item('c', 'queued')];
        const after = [as(before[0], 'error', 'Network error'), as(before[1], 'error', 'Network error'), before[2]];
        expect(describeQueueChanges(before, after)).toBe('2 uploads failed.');
    });

    it('should name a single cancelled file', () => {
        const before = [item('a', 'uploading'), item('b', 'queued')];
        const after = [as(before[0], 'cancelled'), before[1]];
        expect(describeQueueChanges(before, after)).toBe('Cancelled "a.txt".');
    });

    it('should count files cancelled together, as Cancel all does', () => {
        const before = [item('a', 'uploading'), item('b', 'queued'), item('c', 'done')];
        const after = [as(before[0], 'cancelled'), as(before[1], 'cancelled'), before[2]];
        expect(describeQueueChanges(before, after)).toBe('Cancelled 2 uploads. Uploads finished: 1 of 3 uploaded.');
    });

    it('should summarise the queue when the last active file finishes', () => {
        const before = [item('a', 'done'), item('b', 'uploading')];
        const after = [before[0], as(before[1], 'done')];
        expect(describeQueueChanges(before, after)).toBe('Uploads finished: 2 of 2 uploaded.');
    });

    it('should count failed and rejected files in the summary, like the visible summary', () => {
        const before = [
            item('a', 'done'),
            item('b', 'rejected', 'Too big'),
            item('c', 'cancelled'),
            item('d', 'uploading'),
        ];
        const after = [before[0], before[1], before[2], as(before[3], 'error', 'Network error')];
        expect(describeQueueChanges(before, after)).toBe(
            '"d.txt" failed: Network error. Uploads finished: 1 of 4 uploaded, 2 failed.'
        );
    });

    it('should not summarise while files are still queued or uploading', () => {
        const before = [item('a', 'uploading'), item('b', 'queued')];
        const after = [as(before[0], 'done'), before[1]];
        expect(describeQueueChanges(before, after)).toBe('');
    });

    it('should not summarise when only rejected files were added to an idle queue', () => {
        const done = item('a', 'done');
        expect(describeQueueChanges([done], [done, item('b', 'rejected', 'Too big')])).toBe(
            '"b.txt" not uploaded: Too big.'
        );
    });

    it('should not summarise when removing the last active file empties the queue', () => {
        expect(describeQueueChanges([item('a', 'uploading')], [])).toBe('');
    });

    it('should say nothing when a finished file is removed or retried into the queue', () => {
        const before = [item('a', 'error', 'Network error'), item('b', 'done')];
        expect(describeQueueChanges(before, [before[0]])).toBe('');
        expect(describeQueueChanges(before, [as(before[0], 'queued'), before[1]])).toBe('');
    });
});

describe('describeNotAdded', () => {
    const NOTHING = { skippedFolders: [], emptyFolders: [], unreadable: [] };

    it('should say nothing when everything was added', () => {
        expect(describeNotAdded(NOTHING)).toBe('');
    });

    it('should name a single skipped folder and count several', () => {
        expect(describeNotAdded({ ...NOTHING, skippedFolders: ['photos'] })).toBe(
            'Folders can\'t be uploaded here, so "photos" was skipped.'
        );
        expect(describeNotAdded({ ...NOTHING, skippedFolders: ['photos', 'docs', 'music'] })).toBe(
            "Folders can't be uploaded here, so 3 folders were skipped."
        );
    });

    it('should name a single empty folder and count several', () => {
        expect(describeNotAdded({ ...NOTHING, emptyFolders: ['photos'] })).toBe('"photos" has no files to upload.');
        expect(describeNotAdded({ ...NOTHING, emptyFolders: ['photos', 'docs'] })).toBe(
            '2 folders have no files to upload.'
        );
    });

    it('should name a single unreadable item and count several', () => {
        expect(describeNotAdded({ ...NOTHING, unreadable: ['photos/private'] })).toBe(
            '"photos/private" couldn\'t be read.'
        );
        expect(describeNotAdded({ ...NOTHING, unreadable: ['photos/private', 'photos/a.jpg'] })).toBe(
            "2 items couldn't be read."
        );
    });

    it('should combine the messages in a fixed order', () => {
        expect(describeNotAdded({ skippedFolders: ['a'], emptyFolders: ['b'], unreadable: ['c/d'] })).toBe(
            'Folders can\'t be uploaded here, so "a" was skipped. "b" has no files to upload. "c/d" couldn\'t be read.'
        );
    });
});
