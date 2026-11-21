import { describe, it, expect } from 'vitest';

import { type UploadItem, type UploadStatus } from '../hooks/useUploadQueue';

import { getProgress } from './getProgress';

const item = (size: number, loadedBytes: number, status: UploadStatus = 'uploading'): UploadItem => ({
    id: 'upload-1',
    file: new File(['x'.repeat(size)], 'a.bin'),
    status,
    loadedBytes,
});

describe('getProgress', () => {
    it('should return the loaded share as an integer percentage', () => {
        expect(getProgress(item(200, 0))).toBe(0);
        expect(getProgress(item(200, 50))).toBe(25);
        expect(getProgress(item(200, 200, 'done'))).toBe(100);
    });

    it('should round down, so a file shows 100 only when fully loaded', () => {
        expect(getProgress(item(3, 1))).toBe(33);
        expect(getProgress(item(200, 199))).toBe(99);
    });

    it('should not be thrown off by floating point', () => {
        // 29 / 100 * 100 is 28.999999999999996 in floating point.
        expect(getProgress(item(100, 29))).toBe(29);
    });

    it('should show a 0-byte file as 0 until it is done, then 100', () => {
        expect(getProgress(item(0, 0, 'queued'))).toBe(0);
        expect(getProgress(item(0, 0, 'uploading'))).toBe(0);
        expect(getProgress(item(0, 0, 'done'))).toBe(100);
    });
});
