export type Chunk = {
    index: number;
    start: number;
    // Exclusive, as in Blob.slice(start, end).
    end: number;
};

export const planChunks = (size: number, chunkSize: number): Chunk[] => {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError(`chunkSize must be a positive integer, got ${chunkSize}`);
    }

    // The server needs at least one chunk, so an empty file is sent as one empty chunk.
    if (size === 0) {
        return [{ index: 0, start: 0, end: 0 }];
    }

    const chunks: Chunk[] = [];
    for (let start = 0; start < size; start += chunkSize) {
        chunks.push({ index: chunks.length, start, end: Math.min(start + chunkSize, size) });
    }
    return chunks;
};
