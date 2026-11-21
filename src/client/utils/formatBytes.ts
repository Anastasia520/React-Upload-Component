const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const toUnit = (bytes: number, unit: number): number => Math.round((bytes / 1024 ** unit) * 10) / 10;

// A human-readable size with base 1024 and at most one decimal, e.g. "1.5 MB". The unit is picked after rounding,
// so 1048575 bytes is "1 MB", not "1024 KB".
export const formatBytes = (bytes: number): string => {
    let unit = 0;
    while (unit < UNITS.length - 1 && toUnit(bytes, unit) >= 1024) {
        unit++;
    }
    return `${toUnit(bytes, unit)} ${UNITS[unit]}`;
};
