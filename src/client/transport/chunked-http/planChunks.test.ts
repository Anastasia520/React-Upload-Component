import { describe, it, expect } from 'vitest';

import { planChunks } from './planChunks';

describe('planChunks', () => {
    it('should split a size that is an exact multiple of the chunk size', () => {
        expect(planChunks(10, 5)).toEqual([
            { index: 0, start: 0, end: 5 },
            { index: 1, start: 5, end: 10 },
        ]);
    });

    it('should put the remainder in a shorter last chunk', () => {
        expect(planChunks(11, 5)).toEqual([
            { index: 0, start: 0, end: 5 },
            { index: 1, start: 5, end: 10 },
            { index: 2, start: 10, end: 11 },
        ]);
    });

    it('should return one chunk for a 1-byte file', () => {
        expect(planChunks(1, 5)).toEqual([{ index: 0, start: 0, end: 1 }]);
    });

    it('should return one empty chunk for a 0-byte file', () => {
        expect(planChunks(0, 5)).toEqual([{ index: 0, start: 0, end: 0 }]);
    });

    it('should return one chunk when the chunk size is larger than the file', () => {
        expect(planChunks(3, 10)).toEqual([{ index: 0, start: 0, end: 3 }]);
    });

    it.each([0, -1, 1.5, Number.NaN])('should throw a RangeError for chunk size %s', (chunkSize) => {
        expect(() => planChunks(10, chunkSize)).toThrow(RangeError);
    });
});
