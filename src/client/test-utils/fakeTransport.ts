import { vi } from 'vitest';

import { type RemoteFile, type UploadOptions, type UploadTransport } from '../transport/types';

export type UploadCall = UploadOptions & {
    file: File;
    resolve: (stored?: RemoteFile) => void;
    reject: (error: unknown) => void;
};

export type FakeTransport = {
    transport: UploadTransport;
    calls: UploadCall[];
    callsFor: (name: string) => UploadCall[];
};

// A transport whose uploads the test settles by hand. Like the real one, it rejects with an AbortError when the
// signal aborts, unless `honourAbort` is false (to simulate a result that arrives after a cancel).
export const createFakeTransport = ({ honourAbort = true } = {}): FakeTransport => {
    const calls: UploadCall[] = [];
    const transport: UploadTransport = {
        upload: vi.fn(
            (file: File, { signal, onProgress }: UploadOptions) =>
                new Promise<RemoteFile>((resolve, reject) => {
                    calls.push({
                        file,
                        signal,
                        onProgress,
                        resolve: (stored = { name: file.name, size: file.size }) => resolve(stored),
                        reject,
                    });
                    if (honourAbort) {
                        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                    }
                })
        ),
    };
    const callsFor = (name: string): UploadCall[] => calls.filter((call) => call.file.name === name);
    return { transport, calls, callsFor };
};
