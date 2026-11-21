import { describe, it, expect } from 'vitest';

import { matchesAccept } from './matchesAccept';

const file = (name: string, type = ''): File => new File(['x'], name, { type });

describe('matchesAccept', () => {
    it('should allow every file when accept is missing or empty', () => {
        expect(matchesAccept(file('notes.txt'))).toBe(true);
        expect(matchesAccept(file('notes.txt'), '')).toBe(true);
        expect(matchesAccept(file('notes.txt'), ' , ')).toBe(true);
    });

    it('should match file extensions case-insensitively', () => {
        expect(matchesAccept(file('report.PDF'), '.pdf')).toBe(true);
        expect(matchesAccept(file('report.pdf'), '.PDF')).toBe(true);
        expect(matchesAccept(file('archive.tar.gz'), '.tar.gz')).toBe(true);
        expect(matchesAccept(file('report.pdf.txt'), '.pdf')).toBe(false);
    });

    it('should match exact MIME types', () => {
        expect(matchesAccept(file('photo', 'image/png'), 'image/png')).toBe(true);
        expect(matchesAccept(file('photo', 'image/jpeg'), 'image/png')).toBe(false);
    });

    it('should match MIME type wildcards', () => {
        expect(matchesAccept(file('photo', 'image/png'), 'image/*')).toBe(true);
        expect(matchesAccept(file('clip', 'video/mp4'), 'image/*')).toBe(false);
    });

    it('should accept a file that matches any token of a comma-separated list', () => {
        const accept = ' .pdf , image/* ,text/plain';

        expect(matchesAccept(file('report.pdf'), accept)).toBe(true);
        expect(matchesAccept(file('photo', 'image/webp'), accept)).toBe(true);
        expect(matchesAccept(file('notes', 'text/plain'), accept)).toBe(true);
        expect(matchesAccept(file('data.csv', 'text/csv'), accept)).toBe(false);
    });

    it('should match a file without a MIME type only by its extension', () => {
        expect(matchesAccept(file('photo.png'), 'image/*')).toBe(false);
        expect(matchesAccept(file('photo.png'), 'image/png')).toBe(false);
        expect(matchesAccept(file('photo.png'), '.png')).toBe(true);
    });
});
