import { describe, it, expect } from 'vitest';

import { formatBytes } from './formatBytes';

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;

describe('formatBytes', () => {
    it('should show whole bytes below 1 KB', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(1)).toBe('1 B');
        expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should use base 1024 with one decimal', () => {
        expect(formatBytes(KB)).toBe('1 KB');
        expect(formatBytes(1.5 * KB)).toBe('1.5 KB');
        expect(formatBytes(1126)).toBe('1.1 KB');
        expect(formatBytes(5 * MB)).toBe('5 MB');
        expect(formatBytes(2.25 * GB)).toBe('2.3 GB');
        expect(formatBytes(1.5 * TB)).toBe('1.5 TB');
    });

    it('should drop a trailing ".0"', () => {
        expect(formatBytes(1075)).toBe('1 KB');
        expect(formatBytes(10 * MB + 1)).toBe('10 MB');
    });

    it('should pick the unit after rounding', () => {
        expect(formatBytes(MB - 1)).toBe('1 MB');
        expect(formatBytes(GB - 1)).toBe('1 GB');
    });

    it('should not go beyond TB', () => {
        expect(formatBytes(1024 * TB)).toBe('1024 TB');
    });
});
