import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { createFakeTransport } from '../test-utils/fakeTransport';
import { type RemoteFile } from '../transport/types';

import { useRemoteFiles } from './useRemoteFiles';

// Renders the hook with a fake source and counts its renders, so the tests can check that upserts are batched.
const renderRemoteFiles = ({ honourAbort = true } = {}) => {
    const fake = createFakeTransport({ honourAbort });
    let renders = 0;
    const hook = renderHook(() => {
        renders++;
        return useRemoteFiles(fake.transport);
    });
    return { ...hook, ...fake, renderCount: () => renders };
};

// Lets the promise chains settle inside act. advanceTimersByTimeAsync yields to a real macrotask.
const settle = async (action: () => void = () => {}): Promise<void> => {
    await act(async () => {
        action();
        await vi.advanceTimersByTimeAsync(0);
    });
};

const file = (name: string, size = 1): RemoteFile => ({ name, size });

const names = (files: RemoteFile[]): string[] => files.map((remote) => remote.name);

describe('useRemoteFiles', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('loading', () => {
        it('should fetch once on mount and show the files sorted by name', async () => {
            const { result, transport, listCalls } = renderRemoteFiles();

            expect(result.current.status).toBe('loading');
            expect(result.current.files).toEqual([]);
            expect(transport.listFiles).toHaveBeenCalledTimes(1);
            expect(listCalls[0].signal).toBeInstanceOf(AbortSignal);

            await settle(() => listCalls[0].resolve([file('file10'), file('b'), file('file2')]));

            expect(result.current.status).toBe('ready');
            expect(names(result.current.files)).toEqual(['b', 'file2', 'file10']);
            expect(result.current.error).toBeUndefined();
        });

        it('should report an error and recover with refresh', async () => {
            const { result, listCalls } = renderRemoteFiles();

            await settle(() => listCalls[0].reject(new Error('Server exploded')));

            expect(result.current.status).toBe('error');
            expect(result.current.error).toBe('Server exploded');

            act(() => {
                result.current.refresh();
            });
            expect(result.current.status).toBe('loading');

            await settle(() => listCalls[1].resolve([file('a')]));

            expect(result.current.status).toBe('ready');
            expect(result.current.error).toBeUndefined();
            expect(names(result.current.files)).toEqual(['a']);
        });

        it('should keep the current files while refreshing', async () => {
            const { result, listCalls } = renderRemoteFiles();
            await settle(() => listCalls[0].resolve([file('a')]));

            act(() => {
                result.current.refresh();
            });

            expect(result.current.status).toBe('loading');
            expect(names(result.current.files)).toEqual(['a']);
        });
    });

    describe('aborting', () => {
        it('should abort the previous request on refresh and ignore its late result', async () => {
            // The source ignores the abort, so the first request still resolves after the second one.
            const { result, listCalls } = renderRemoteFiles({ honourAbort: false });

            act(() => {
                result.current.refresh();
            });
            expect(listCalls[0].signal.aborted).toBe(true);

            await settle(() => listCalls[1].resolve([file('new')]));
            await settle(() => listCalls[0].resolve([file('old')]));

            expect(names(result.current.files)).toEqual(['new']);
        });

        it('should never show an AbortError as an error', async () => {
            const { result, listCalls } = renderRemoteFiles();

            // The fake rejects the first request with an AbortError as soon as refresh aborts it.
            await settle(() => {
                result.current.refresh();
            });

            expect(result.current.status).toBe('loading');
            expect(result.current.error).toBeUndefined();

            await settle(() => listCalls[1].resolve([]));
            expect(result.current.status).toBe('ready');
        });

        it('should abort the request on unmount', () => {
            const { listCalls, unmount } = renderRemoteFiles();

            unmount();

            expect(listCalls[0].signal.aborted).toBe(true);
        });
    });

    describe('upserting', () => {
        it('should batch upserts into one update after 250 ms', async () => {
            const { result, listCalls, renderCount } = renderRemoteFiles();
            await settle(() => listCalls[0].resolve([file('b')]));
            const rendersBefore = renderCount();

            act(() => {
                result.current.upsert(file('c'));
                vi.advanceTimersByTime(100);
                result.current.upsert(file('a'));
                vi.advanceTimersByTime(100);
                result.current.upsert(file('d'));
            });
            expect(names(result.current.files)).toEqual(['b']);

            act(() => {
                vi.advanceTimersByTime(50);
            });

            expect(names(result.current.files)).toEqual(['a', 'b', 'c', 'd']);
            expect(renderCount()).toBe(rendersBefore + 1);
        });

        it('should replace a file with the same name', async () => {
            const { result, listCalls } = renderRemoteFiles();
            await settle(() => listCalls[0].resolve([file('a', 1), file('b', 1)]));

            act(() => {
                result.current.upsert(file('a', 42));
                vi.advanceTimersByTime(250);
            });

            expect(result.current.files).toEqual([file('a', 42), file('b', 1)]);
        });

        it('should let a refresh replace the optimistic entries', async () => {
            const { result, listCalls } = renderRemoteFiles();
            await settle(() => listCalls[0].resolve([]));
            act(() => {
                result.current.upsert(file('gone', 1));
                result.current.upsert(file('kept', 1));
                vi.advanceTimersByTime(250);
            });

            act(() => {
                result.current.refresh();
            });
            await settle(() => listCalls[1].resolve([file('kept', 5)]));

            expect(result.current.files).toEqual([file('kept', 5)]);
        });

        it('should clear the pending flush on unmount', () => {
            const { result, unmount } = renderRemoteFiles();
            act(() => {
                result.current.upsert(file('a'));
            });
            expect(vi.getTimerCount()).toBe(1);

            unmount();

            expect(vi.getTimerCount()).toBe(0);
        });
    });
});
