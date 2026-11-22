import { vi } from 'vitest';

import { type FileSource, type RemoteFile, type UploadOptions, type UploadTransport } from '../transport/types';

export type UploadCall = UploadOptions & {
    file: File;
    resolve: (stored?: RemoteFile) => void;
    reject: (error: unknown) => void;
};

export type ListCall = {
    signal: AbortSignal;
    resolve: (files: RemoteFile[]) => void;
    reject: (error: unknown) => void;
};

export type FakeTransport = {
    transport: UploadTransport & FileSource;
    calls: UploadCall[];
    callsFor: (name: string) => UploadCall[];
    listCalls: ListCall[];
};

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

// A transport whose uploads and file listings the test settles by hand. Like the real one, it rejects with an
// AbortError when the signal aborts, unless `honourAbort` is false (to simulate a result that arrives after a cancel).
export const createFakeTransport = ({ honourAbort = true } = {}): FakeTransport => {
    const calls: UploadCall[] = [];
    const listCalls: ListCall[] = [];
    const transport: UploadTransport & FileSource = {
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
                        signal.addEventListener('abort', () => reject(abortError()));
                    }
                })
        ),
        listFiles: vi.fn(
            (signal: AbortSignal) =>
                new Promise<RemoteFile[]>((resolve, reject) => {
                    listCalls.push({ signal, resolve, reject });
                    if (honourAbort) {
                        signal.addEventListener('abort', () => reject(abortError()));
                    }
                })
        ),
    };
    const callsFor = (name: string): UploadCall[] => calls.filter((call) => call.file.name === name);
    return { transport, calls, callsFor, listCalls };
};
