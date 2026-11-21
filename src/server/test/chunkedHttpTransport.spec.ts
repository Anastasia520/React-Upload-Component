// @vitest-environment node
import { once } from 'node:events';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createChunkedHttpTransport } from '../../client/transport/chunked-http/chunkedHttpTransport';
import { type FormDataRequest, createHttpError } from '../../client/transport/chunked-http/xhrRequest';
import { app } from '../server';

const TESTING_UPLOADS_DIR = 'src/server/test/uploads';
const CHUNK_SIZE = 1024;

// Node has no XMLHttpRequest, so the tests send chunks with fetch. Progress isn't needed here.
const fetchRequest: FormDataRequest = async (url, body, { signal }) => {
    const response = await fetch(url, { method: 'POST', body, signal });
    const data: unknown = await response.json();
    if (!response.ok) {
        throw createHttpError(response.status, response.statusText, data);
    }
    return data;
};

// Every byte value from 0x00 to 0xFF, including CR and LF, so nothing depends on the body being text.
const createBytes = (length: number): Uint8Array => Uint8Array.from({ length }, (_, index) => index % 256);

describe('Chunked HTTP transport against the real API', () => {
    let server: Server;
    let transport: ReturnType<typeof createChunkedHttpTransport>;

    beforeAll(async () => {
        server = app.listen(0);
        await once(server, 'listening');
        const { port } = server.address() as AddressInfo;
        transport = createChunkedHttpTransport({
            baseUrl: `http://localhost:${port}/api`,
            chunkSize: CHUNK_SIZE,
            request: fetchRequest,
        });
    });

    afterAll(async () => {
        // fetch keeps connections alive, which would otherwise hold close() open.
        server.closeAllConnections();
        server.close();
        await once(server, 'close');
    });

    const uploadAndRead = async (name: string, bytes: Uint8Array): Promise<Uint8Array> => {
        const path = join(TESTING_UPLOADS_DIR, name);
        // A file left over from an earlier run must not make a broken upload pass.
        rmSync(path, { force: true });

        const stored = await transport.upload(new File([bytes], name), {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });
        expect(stored).toEqual({ name, size: bytes.length });

        // The server responds before the merged file is flushed (L3), so wait until it has its full size.
        await vi.waitFor(() => expect(statSync(path).size).toBe(bytes.length));
        return new Uint8Array(readFileSync(path));
    };

    it('uploads a multi-chunk binary file byte for byte', async () => {
        // Four full chunks in parallel, then a shorter last chunk.
        const bytes = createBytes(4 * CHUNK_SIZE + 100);

        expect(await uploadAndRead('transport-multi-chunk.bin', bytes)).toEqual(bytes);
    });

    it('uploads a 0-byte file', async () => {
        const bytes = new Uint8Array(0);

        expect(await uploadAndRead('transport-empty.bin', bytes)).toEqual(bytes);
    });

    it('uploads a file with a 200-character name', async () => {
        // With `.part_N` appended for the chunk files, this stays under the 255-byte file name limit (L4).
        const name = `transport-${'a'.repeat(186)}.bin`;
        const bytes = createBytes(2 * CHUNK_SIZE + 1);

        expect(name).toHaveLength(200);
        expect(await uploadAndRead(name, bytes)).toEqual(bytes);
    });

    it('lists an uploaded file', async () => {
        const name = 'transport-listed.bin';
        const bytes = createBytes(CHUNK_SIZE + 1);
        await uploadAndRead(name, bytes);

        const files = await transport.listFiles(new AbortController().signal);

        expect(files).toContainEqual({ name, size: bytes.length });
    });
});
