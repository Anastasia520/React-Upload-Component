import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { xhrRequest } from './xhrRequest';

// A stand-in for XMLHttpRequest that the test drives by hand. Only the members xhrRequest uses are implemented.
class FakeXhr {
    static instances: FakeXhr[] = [];

    method = '';
    url = '';
    sentBody: unknown;
    responseType = '';
    status = 0;
    statusText = '';
    response: unknown = null;
    upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;

    open = vi.fn((method: string, url: string) => {
        this.method = method;
        this.url = url;
    });

    send = vi.fn((body: unknown) => {
        this.sentBody = body;
    });

    abort = vi.fn(() => {
        this.onabort?.();
    });

    constructor() {
        FakeXhr.instances.push(this);
    }

    progress(loaded: number): void {
        this.upload.onprogress?.({ loaded });
    }

    respond(status: number, response: unknown = null, statusText = ''): void {
        this.status = status;
        this.statusText = statusText;
        this.response = response;
        this.onload?.();
    }

    failNetwork(): void {
        this.onerror?.();
    }
}

const lastXhr = (): FakeXhr => {
    const xhr = FakeXhr.instances.at(-1);
    if (!xhr) {
        throw new Error('No XHR was created');
    }
    return xhr;
};

const send = (signal = new AbortController().signal, onProgress = vi.fn()) =>
    xhrRequest('/api/upload-chunk', new FormData(), { signal, onProgress });

describe('xhrRequest', () => {
    beforeEach(() => {
        FakeXhr.instances = [];
        vi.stubGlobal('XMLHttpRequest', FakeXhr);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('should open a POST to the url and send the given form data', async () => {
        const body = new FormData();

        const result = xhrRequest('/api/upload-chunk', body, {
            signal: new AbortController().signal,
            onProgress: vi.fn(),
        });

        const xhr = lastXhr();
        expect(xhr.method).toBe('POST');
        expect(xhr.url).toBe('/api/upload-chunk');
        expect(xhr.sentBody).toBe(body);

        xhr.respond(200);
        await result;
    });

    it('should report the loaded bytes of each upload progress event', async () => {
        const onProgress = vi.fn();

        const result = send(undefined, onProgress);
        lastXhr().progress(10);
        lastXhr().progress(25);

        expect(onProgress.mock.calls).toEqual([[10], [25]]);

        lastXhr().respond(200);
        await result;
    });

    it('should resolve with the parsed JSON body for a 2xx response', async () => {
        const result = send();
        lastXhr().respond(200, { message: 'Chunked file uploaded successfully' });

        await expect(result).resolves.toEqual({ message: 'Chunked file uploaded successfully' });
    });

    it('should resolve with null for a 2xx response without a body', async () => {
        const result = send();
        lastXhr().respond(204);

        await expect(result).resolves.toBeNull();
    });

    it('should reject with the error field of a non-2xx body', async () => {
        const result = send();
        lastXhr().respond(400, { error: 'Missing required parameters' }, 'Bad Request');

        await expect(result).rejects.toThrow('Missing required parameters');
    });

    it('should reject with the message field of a non-2xx body', async () => {
        const result = send();
        lastXhr().respond(500, { message: 'ENOENT: no such file or directory' }, 'Internal Server Error');

        await expect(result).rejects.toThrow('ENOENT: no such file or directory');
    });

    it('should fall back to the status text when the body has no message', async () => {
        const result = send();
        lastXhr().respond(500, null, 'Internal Server Error');

        await expect(result).rejects.toThrow('Internal Server Error');
    });

    it('should fall back to the status code when there is no status text', async () => {
        const result = send();
        lastXhr().respond(502);

        await expect(result).rejects.toThrow('Request failed with status 502');
    });

    it('should reject with "Network error" when the request fails', async () => {
        const result = send();
        lastXhr().failNetwork();

        await expect(result).rejects.toThrow('Network error');
    });

    it('should abort the request and reject with an AbortError when the signal aborts', async () => {
        const controller = new AbortController();

        const result = send(controller.signal);
        controller.abort();

        await expect(result).rejects.toMatchObject({ name: 'AbortError' });
        await expect(result).rejects.toBeInstanceOf(DOMException);
        expect(lastXhr().abort).toHaveBeenCalledOnce();
    });

    it('should reject with an AbortError without sending when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(send(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        expect(FakeXhr.instances.every((xhr) => xhr.send.mock.calls.length === 0)).toBe(true);
    });

    it('should stop listening to the signal once the request has settled', async () => {
        const controller = new AbortController();

        const result = send(controller.signal);
        lastXhr().respond(200);
        await result;
        controller.abort();

        expect(lastXhr().abort).not.toHaveBeenCalled();
    });
});
