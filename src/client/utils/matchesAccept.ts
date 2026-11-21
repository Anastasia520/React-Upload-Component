// Checks a file against an `accept` string the way the native file input does: comma-separated extensions (`.pdf`),
// MIME types (`image/png`) and MIME wildcards (`image/*`), case-insensitive. A missing or empty `accept` allows all.
export const matchesAccept = (file: File, accept = ''): boolean => {
    const tokens = accept
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean);
    if (tokens.length === 0) {
        return true;
    }

    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return tokens.some((token) => {
        if (token.startsWith('.')) {
            return name.endsWith(token);
        }
        if (token.endsWith('/*')) {
            return type.startsWith(token.slice(0, -1));
        }
        return type === token;
    });
};
