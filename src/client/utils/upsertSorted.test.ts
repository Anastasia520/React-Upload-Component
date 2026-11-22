import { describe, it, expect } from 'vitest';

import { type RemoteFile } from '../transport/types';

import { compareFileNames, upsertSorted } from './upsertSorted';

const files = (...names: string[]): RemoteFile[] => names.map((name) => ({ name, size: 1 }));

const names = (list: RemoteFile[]): string[] => list.map((file) => file.name);

describe('compareFileNames', () => {
    it('should order numbers by value, like a file manager', () => {
        expect(compareFileNames('file2', 'file10')).toBeLessThan(0);
        expect(compareFileNames('file10', 'file2')).toBeGreaterThan(0);
    });

    it('should not put capitals before lower case', () => {
        expect(compareFileNames('apple', 'Banana')).toBeLessThan(0);
    });

    it('should return 0 only for identical names', () => {
        expect(compareFileNames('a.txt', 'a.txt')).toBe(0);
        expect(compareFileNames('a.txt', 'A.txt')).not.toBe(0);
    });

    it('should tell apart names the collator considers equal', () => {
        // The numeric collator treats 02 and 2 as the same number, and NFC and NFD as the same text.
        const pairs = [
            ['report-02.pdf', 'report-2.pdf'],
            // "é" as one code point (NFC, most systems) and as "e" plus a combining accent (NFD, macOS).
            ['\u00E9.txt', 'e\u0301.txt'],
        ];
        for (const [a, b] of pairs) {
            expect(compareFileNames(a, b)).not.toBe(0);
            expect(Math.sign(compareFileNames(a, b))).toBe(-Math.sign(compareFileNames(b, a)));
        }
    });
});

describe('upsertSorted', () => {
    it('should insert into an empty list', () => {
        expect(upsertSorted([], files('a'))).toEqual(files('a'));
    });

    it('should insert at the start, in the middle and at the end, keeping the order', () => {
        expect(names(upsertSorted(files('b', 'd'), files('a')))).toEqual(['a', 'b', 'd']);
        expect(names(upsertSorted(files('b', 'd'), files('c')))).toEqual(['b', 'c', 'd']);
        expect(names(upsertSorted(files('b', 'd'), files('e')))).toEqual(['b', 'd', 'e']);
    });

    it('should replace a file with the same name instead of adding a duplicate', () => {
        const result = upsertSorted(files('a', 'b', 'c'), [{ name: 'b', size: 99 }]);

        expect(result).toEqual([
            { name: 'a', size: 1 },
            { name: 'b', size: 99 },
            { name: 'c', size: 1 },
        ]);
    });

    it('should keep names that differ only in a way the collator ignores as separate files', () => {
        expect(names(upsertSorted(files('report-2.pdf'), files('report-02.pdf')))).toHaveLength(2);
    });

    it('should apply several additions at once, the last one winning for a repeated name', () => {
        const result = upsertSorted(files('b', 'file10'), [
            { name: 'file2', size: 1 },
            { name: 'a', size: 1 },
            { name: 'a', size: 7 },
        ]);

        expect(result).toEqual([
            { name: 'a', size: 7 },
            { name: 'b', size: 1 },
            { name: 'file2', size: 1 },
            { name: 'file10', size: 1 },
        ]);
    });

    it('should not change the given list', () => {
        const sorted = files('a', 'c');

        upsertSorted(sorted, files('b'));

        expect(names(sorted)).toEqual(['a', 'c']);
    });
});
