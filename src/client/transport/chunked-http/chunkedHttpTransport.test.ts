import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { createChunkedHttpTransport } from './chunkedHttpTransport';
import { type FormDataRequest, type RequestOptions } from './xhrRequest';

type RequestCall = {
    url: string;
    body: FormData;
    options: RequestOptions;
    resolve: () => void;
    reject: (error: unknown) => void;
};

// A request the test settles by hand. Like xhrRequest, it rejects with an AbortError when its signal aborts.
const createFakeRequest = () => {
    const calls: RequestCall[] = [];
    const request: FormDataRequest = (url, body, options) =>
        new Promise((resolve, reject) => {
            calls.push({ url, body, options, resolve: () => resolve(null), reject });
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        });
    const indexes = (): unknown[] => calls.map((call) => call.body.get('currentChunkIndex'));
    return { request, calls, indexes };
};

const fieldsOf = async (call: RequestCall) => {
    const file = call.body.get('file') as File;
    return {
        content: await file.text(),
        currentChunkIndex: call.body.get('currentChunkIndex'),
        totalChunks: call.body.get('totalChunks'),
    };
};

// A macrotask runs only after every pending microtask, so all promise chains have settled by then.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const uploadOptions = (signal = new AbortController().signal, onProgress = vi.fn()) => ({ signal, onProgress });

// 10 bytes, so a chunk size of 4 gives chunks 'abcd', 'efgh' and 'ij'.
const tenByteFile = () => new File(['abcdefghij'], 'report.pdf');

describe('createChunkedHttpTransport', () => {
    describe('upload', () => {
        // The server reads the name from the third argument of append. happy-dom's FormData drops that argument for a
        // Blob and stores the name "blob" (browsers and Node use it), so the tests check the append call itself.
        const fileNamesAppended = (): unknown[] =>
            vi
                .mocked(FormData.prototype.append)
                .mock.calls.filter(([field]) => field === 'file')
                .map((args) => args[2]);

        beforeEach(() => {
            vi.spyOn(FormData.prototype, 'append');
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('should send a small file as one chunk with its name and resolve with the stored file', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ request });

            const result = transport.upload(new File(['hello'], 'report.pdf'), uploadOptions());
            await flush();

            expect(calls).toHaveLength(1);
            expect(calls[0].url).toBe('/api/upload-chunk');
            expect(fileNamesAppended()).toEqual(['report.pdf']);
            expect(await fieldsOf(calls[0])).toEqual({
                content: 'hello',
                currentChunkIndex: '0',
                totalChunks: '1',
            });

            calls[0].resolve();
            await expect(result).resolves.toEqual({ name: 'report.pdf', size: 5 });
        });

        it('should post to the configured base url', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ baseUrl: 'https://example.com/v1', request });

            const result = transport.upload(new File(['hello'], 'report.pdf'), uploadOptions());
            await flush();

            expect(calls[0].url).toBe('https://example.com/v1/upload-chunk');

            calls[0].resolve();
            await result;
        });

        it('should send each byte range of a multi-chunk file with its index and the chunk count', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ chunkSize: 4, chunkConcurrency: 2, request });

            const result = transport.upload(tenByteFile(), uploadOptions());
            await flush();
            calls[0].resolve();
            calls[1].resolve();
            await flush();
            calls[2].resolve();

            await expect(result).resolves.toEqual({ name: 'report.pdf', size: 10 });
            expect(fileNamesAppended()).toEqual(['report.pdf', 'report.pdf', 'report.pdf']);
            expect(await Promise.all(calls.map(fieldsOf))).toEqual([
                { content: 'abcd', currentChunkIndex: '0', totalChunks: '3' },
                { content: 'efgh', currentChunkIndex: '1', totalChunks: '3' },
                { content: 'ij', currentChunkIndex: '2', totalChunks: '3' },
            ]);
        });

        it('should send a 0-byte file as one empty chunk', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ request });

            const result = transport.upload(new File([], 'empty.txt'), uploadOptions());
            await flush();

            expect(calls).toHaveLength(1);
            expect(fileNamesAppended()).toEqual(['empty.txt']);
            expect(await fieldsOf(calls[0])).toEqual({
                content: '',
                currentChunkIndex: '0',
                totalChunks: '1',
            });

            calls[0].resolve();
            await expect(result).resolves.toEqual({ name: 'empty.txt', size: 0 });
        });

        it('should keep at most chunkConcurrency chunks in flight', async () => {
            const { request, calls, indexes } = createFakeRequest();
            // 5 chunks of 2 bytes.
            const transport = createChunkedHttpTransport({ chunkSize: 2, chunkConcurrency: 2, request });

            const result = transport.upload(tenByteFile(), uploadOptions());
            await flush();
            expect(indexes()).toEqual(['0', '1']);

            calls[0].resolve();
            await flush();
            expect(indexes()).toEqual(['0', '1', '2']);

            calls[1].resolve();
            await flush();
            expect(indexes()).toEqual(['0', '1', '2', '3']);

            calls[2].resolve();
            calls[3].resolve();
            await flush();
            calls[4].resolve();
            await result;
        });

        it('should send the last chunk only after every other chunk has succeeded', async () => {
            const { request, calls, indexes } = createFakeRequest();
            const transport = createChunkedHttpTransport({ chunkSize: 4, chunkConcurrency: 2, request });

            const result = transport.upload(tenByteFile(), uploadOptions());
            await flush();

            calls[1].resolve();
            await flush();
            expect(indexes()).toEqual(['0', '1']);

            calls[0].resolve();
            await flush();
            expect(indexes()).toEqual(['0', '1', '2']);

            calls[2].resolve();
            await result;
        });

        it('should report completed bytes plus in-flight bytes, each chunk clamped to its own size', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ chunkSize: 4, chunkConcurrency: 2, request });
            const onProgress = vi.fn();

            const result = transport.upload(tenByteFile(), uploadOptions(undefined, onProgress));
            await flush();

            calls[0].options.onProgress(3);
            expect(onProgress).toHaveBeenLastCalledWith(3);

            // The multipart overhead makes the loaded bytes larger than the 4-byte chunk.
            calls[1].options.onProgress(10);
            expect(onProgress).toHaveBeenLastCalledWith(7);

            calls[0].resolve();
            await flush();
            expect(onProgress).toHaveBeenLastCalledWith(8);

            calls[1].resolve();
            await flush();
            expect(onProgress).toHaveBeenLastCalledWith(8);

            calls[2].options.onProgress(1);
            expect(onProgress).toHaveBeenLastCalledWith(9);

            calls[2].resolve();
            await result;
            expect(onProgress).toHaveBeenLastCalledWith(10);
        });

        it('should abort the chunks in flight and send no more when the signal aborts', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ chunkSize: 4, chunkConcurrency: 2, request });
            const controller = new AbortController();

            const result = transport.upload(tenByteFile(), uploadOptions(controller.signal));
            await flush();
            controller.abort();

            await expect(result).rejects.toMatchObject({ name: 'AbortError' });
            expect(calls.map((call) => call.options.signal.aborted)).toEqual([true, true]);
            await flush();
            expect(calls).toHaveLength(2);
        });

        it('should reject with an AbortError without sending anything when the signal is already aborted', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ request });
            const controller = new AbortController();
            controller.abort();

            await expect(transport.upload(tenByteFile(), uploadOptions(controller.signal))).rejects.toMatchObject({
                name: 'AbortError',
            });
            expect(calls).toHaveLength(0);
        });

        it('should abort the sibling chunks and reject with the error of a failing chunk', async () => {
            const { request, calls } = createFakeRequest();
            const transport = createChunkedHttpTransport({ chunkSize: 4, chunkConcurrency: 2, request });
            const error = new Error('Error saving chunk');

            const result = transport.upload(tenByteFile(), uploadOptions());
            await flush();
            calls[0].reject(error);

            await expect(result).rejects.toBe(error);
            expect(calls[1].options.signal.aborted).toBe(true);
            await flush();
            expect(calls).toHaveLength(2);
        });
    });

    describe('listFiles', () => {
        afterEach(() => {
            vi.unstubAllGlobals();
        });

        const stubFetch = (response: Response) => {
            const fetchMock = vi.fn(() => Promise.resolve(response));
            vi.stubGlobal('fetch', fetchMock);
            return fetchMock;
        };

        it('should fetch the files from the base url with the signal and return them', async () => {
            const files = [
                { name: 'a.txt', size: 1 },
                { name: 'b.png', size: 2048 },
            ];
            const fetchMock = stubFetch(new Response(JSON.stringify({ files }), { status: 200 }));
            const signal = new AbortController().signal;

            await expect(createChunkedHttpTransport().listFiles(signal)).resolves.toEqual(files);
            expect(fetchMock).toHaveBeenCalledWith('/api/files', { signal });
        });

        it('should reject with the message of a non-2xx body', async () => {
            stubFetch(new Response(JSON.stringify({ message: 'ENOENT: no such file or directory' }), { status: 500 }));

            await expect(createChunkedHttpTransport().listFiles(new AbortController().signal)).rejects.toThrow(
                'ENOENT: no such file or directory'
            );
        });

        it('should reject with the status text when a non-2xx body is not JSON', async () => {
            stubFetch(new Response('<h1>Bad gateway</h1>', { status: 502, statusText: 'Bad Gateway' }));

            await expect(createChunkedHttpTransport().listFiles(new AbortController().signal)).rejects.toThrow(
                'Bad Gateway'
            );
        });

        it('should reject when a 2xx body has no files array', async () => {
            stubFetch(new Response(JSON.stringify({}), { status: 200 }));

            await expect(createChunkedHttpTransport().listFiles(new AbortController().signal)).rejects.toThrow(
                'Unexpected response from GET /api/files'
            );
        });

        it('should reject with the AbortError when the signal aborts while the body is being read', async () => {
            const abortError = new DOMException('Aborted', 'AbortError');
            stubFetch({ ok: true, status: 200, text: () => Promise.reject(abortError) } as unknown as Response);

            await expect(createChunkedHttpTransport().listFiles(new AbortController().signal)).rejects.toBe(abortError);
        });
    });
});
