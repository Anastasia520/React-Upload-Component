import { type RemoteFile } from '../transport/types';

// The browser's locale, with numbers ordered by value ("file2" before "file10"), like a file manager.
const collator = new Intl.Collator(undefined, { numeric: true });

// Orders file names for display. The collator calls some different names equal ("report-02" and "report-2", or an
// "é" written as one or two code points), so those fall back to code-point order: only identical names return 0.
export const compareFileNames = (a: string, b: string): number => {
    const order = collator.compare(a, b);
    if (order !== 0 || a === b) {
        return order;
    }
    return a < b ? -1 : 1;
};

// The index of the first file whose name doesn't sort before `name`.
const findInsertIndex = (sorted: RemoteFile[], name: string): number => {
    let low = 0;
    let high = sorted.length;
    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (compareFileNames(sorted[middle].name, name) < 0) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }
    return low;
};

// Returns a new list with the additions inserted by binary search, replacing files with the same name. The list
// must already be sorted with `compareFileNames`. It's copied once, so a batch costs one copy, not one per file.
export const upsertSorted = (sorted: RemoteFile[], additions: RemoteFile[]): RemoteFile[] => {
    const result = [...sorted];
    for (const file of additions) {
        const index = findInsertIndex(result, file.name);
        const replaces = index < result.length && result[index].name === file.name;
        result.splice(index, replaces ? 1 : 0, file);
    }
    return result;
};
