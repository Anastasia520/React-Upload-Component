import { type FileSource, type RemoteFile, type UploadTransport } from '../types';

import { type Chunk, planChunks } from './planChunks';
import { runWithLimit } from './runWithLimit';
import { type FormDataRequest, createAbortError, createHttpError, xhrRequest } from './xhrRequest';

const MiB = 1024 * 1024;

export type ChunkedHttpTransportOptions = {
    baseUrl?: string;
    chunkSize?: number;
    // Chunks of one file in flight at once. With 3 files at a time this stays within the browser's 6 connections.
    chunkConcurrency?: number;
    request?: FormDataRequest;
};

const sum = (numbers: number[]): number => {
    let total = 0;
    for (const value of numbers) {
        total += value;
    }
    return total;
};

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

// The adapter for the demo API: uploads files as multipart chunks to /upload-chunk and lists them from /files.
export const createChunkedHttpTransport = ({
    baseUrl = '/api',
    chunkSize = 5 * MiB,
    chunkConcurrency = 2,
    request = xhrRequest,
}: ChunkedHttpTransportOptions = {}): UploadTransport & FileSource => ({
    upload: async (file, { signal, onProgress }) => {
        if (signal.aborted) {
            throw createAbortError();
        }

        const chunks = planChunks(file.size, chunkSize);
        const loadedPerChunk = chunks.map(() => 0);
        // Linked to the caller's signal, so both a cancel and a failing chunk abort every chunk in flight.
        const controller = new AbortController();
        const abort = (): void => controller.abort();
        signal.addEventListener('abort', abort);

        const setLoaded = (chunk: Chunk, bytes: number): void => {
            // The loaded bytes include the multipart overhead, so they are capped at the chunk's own size.
            loadedPerChunk[chunk.index] = Math.min(bytes, chunk.end - chunk.start);
            onProgress(sum(loadedPerChunk));
        };

        const sendChunk = async (chunk: Chunk): Promise<void> => {
            const body = new FormData();
            // The server takes the file name from the third argument, not from a separate field.
            body.append('file', file.slice(chunk.start, chunk.end), file.name);
            body.append('currentChunkIndex', String(chunk.index));
            body.append('totalChunks', String(chunks.length));

            await request(`${baseUrl}/upload-chunk`, body, {
                signal: controller.signal,
                onProgress: (bytes) => setLoaded(chunk, bytes),
            });
            setLoaded(chunk, chunk.end - chunk.start);
        };

        const otherChunks = chunks.slice(0, -1);
        const lastChunk = chunks[otherChunks.length];
        try {
            await runWithLimit(
                otherChunks.map((chunk) => () => sendChunk(chunk)),
                chunkConcurrency
            );
            // The server merges the file as soon as the last index arrives, so that chunk always goes last.
            await sendChunk(lastChunk);
        } catch (error) {
            controller.abort();
            throw error;
        } finally {
            signal.removeEventListener('abort', abort);
        }

        return { name: file.name, size: file.size };
    },

    listFiles: async (signal) => {
        const url = `${baseUrl}/files`;
        const response = await fetch(url, { signal });
        // Read as text first: an abort while reading must reject with the AbortError, not look like a bad body.
        const body = parseJson(await response.text());
        if (!response.ok) {
            throw createHttpError(response.status, response.statusText, body);
        }

        const files = (body as { files?: unknown } | null)?.files;
        if (!Array.isArray(files)) {
            throw new TypeError(`Unexpected response from GET ${url}`);
        }
        return files as RemoteFile[];
    },
});
