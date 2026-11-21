import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

import { createFakeTransport } from '../test-utils/fakeTransport';
import { type UploadTransport } from '../transport/types';

import { type UploadItem, type UploadQueueOptions, useUploadQueue } from './useUploadQueue';

// Renders the hook and counts its renders, so the tests can check how often progress reaches state.
const renderQueue = (transport: UploadTransport, options: UploadQueueOptions = {}) => {
    let renders = 0;
    const hook = renderHook(
        (props: UploadQueueOptions) => {
            renders++;
            return useUploadQueue(transport, props);
        },
        { initialProps: options }
    );
    return { ...hook, renderCount: () => renders };
};

// Runs the action inside act and lets every promise chain settle: advanceTimersByTimeAsync yields to a real
// macrotask, and 0 ms never fires the progress timer.
const settle = async (action: () => void = () => {}): Promise<void> => {
    await act(async () => {
        action();
        await vi.advanceTimersByTimeAsync(0);
    });
};

const file = (name: string, content = 'hello', type = ''): File => new File([content], name, { type });

const summary = (items: UploadItem[]): string[] => items.map((item) => `${item.file.name}:${item.status}`);

const itemNamed = (items: UploadItem[], name: string): UploadItem => {
    const item = items.find((candidate) => candidate.file.name === name);
    if (!item) {
        throw new Error(`No item named ${name}`);
    }
    return item;
};

describe('useUploadQueue', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('adding and starting', () => {
        it('should add files in order and start at most three at once', () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);

            act(() => result.current.add([file('a'), file('b'), file('c'), file('d')]));

            expect(summary(result.current.items)).toEqual(['a:uploading', 'b:uploading', 'c:uploading', 'd:queued']);
            expect(new Set(result.current.items.map((item) => item.id)).size).toBe(4);
            expect(result.current.items.every((item) => item.loadedBytes === 0)).toBe(true);
            expect(calls.map((call) => call.file.name)).toEqual(['a', 'b', 'c']);
            expect(calls.every((call) => !call.signal.aborted)).toBe(true);
        });

        it('should start the next queued file when a slot frees up', async () => {
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b'), file('c'), file('d')]));

            await settle(() => callsFor('a')[0].resolve());

            expect(summary(result.current.items)).toEqual(['a:done', 'b:uploading', 'c:uploading', 'd:uploading']);
            expect(callsFor('d')).toHaveLength(1);
        });

        it('should respect maxConcurrentFiles', () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport, { maxConcurrentFiles: 1 });

            act(() => result.current.add([file('a'), file('b')]));

            expect(summary(result.current.items)).toEqual(['a:uploading', 'b:queued']);
            expect(calls).toHaveLength(1);
        });

        it('should append files added while others are uploading', () => {
            const { transport } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a')]));

            act(() => result.current.add([file('b')]));

            expect(summary(result.current.items)).toEqual(['a:uploading', 'b:uploading']);
        });
    });

    describe('finishing', () => {
        it('should mark a finished file as done with all bytes loaded and report what was stored', async () => {
            const onUploaded = vi.fn();
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport, { onUploaded });
            const report = file('report.pdf', 'hello');
            act(() => result.current.add([report]));

            await settle(() => calls[0].resolve({ name: 'stored.pdf', size: 5 }));

            const item = result.current.items[0];
            expect(item).toMatchObject({ status: 'done', loadedBytes: 5 });
            expect(onUploaded).toHaveBeenCalledTimes(1);
            expect(onUploaded).toHaveBeenCalledWith(item, { name: 'stored.pdf', size: 5 });
        });

        it('should call onIdle once when the queue drains, and again after the next batch', async () => {
            const onIdle = vi.fn();
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport, { onIdle });
            act(() => result.current.add([file('a'), file('b')]));

            await settle(() => callsFor('a')[0].resolve());
            expect(onIdle).not.toHaveBeenCalled();
            await settle(() => callsFor('b')[0].reject(new Error('Server exploded')));
            expect(onIdle).toHaveBeenCalledTimes(1);

            act(() => result.current.add([file('c')]));
            await settle(() => callsFor('c')[0].resolve());
            expect(onIdle).toHaveBeenCalledTimes(2);
        });

        it('should not call onIdle when every added file is rejected', () => {
            const onIdle = vi.fn();
            const { transport } = createFakeTransport();
            const { result } = renderQueue(transport, { accept: '.png', onIdle });

            act(() => result.current.add([file('notes.txt')]));

            expect(onIdle).not.toHaveBeenCalled();
        });
    });

    describe('failures', () => {
        it('should mark a failed file as error with its message and keep the others going', async () => {
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b'), file('c'), file('d')]));

            await settle(() => callsFor('a')[0].reject(new Error('Server exploded')));

            expect(summary(result.current.items)).toEqual(['a:error', 'b:uploading', 'c:uploading', 'd:uploading']);
            expect(result.current.items[0].error).toBe('Server exploded');
        });

        it('should show a generic message when the transport rejects with something other than an Error', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a')]));

            await settle(() => calls[0].reject('boom'));

            expect(result.current.items[0]).toMatchObject({ status: 'error', error: 'Upload failed' });
        });
    });

    describe('cancelling', () => {
        it('should cancel a queued file without ever uploading it', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport, { maxConcurrentFiles: 1 });
            act(() => result.current.add([file('a'), file('b')]));

            act(() => result.current.cancel(itemNamed(result.current.items, 'b').id));
            await settle(() => calls[0].resolve());

            expect(summary(result.current.items)).toEqual(['a:done', 'b:cancelled']);
            expect(calls).toHaveLength(1);
        });

        it('should abort an uploading file and mark it cancelled, not failed, freeing its slot', async () => {
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b'), file('c'), file('d')]));

            await settle(() => result.current.cancel(itemNamed(result.current.items, 'a').id));

            expect(callsFor('a')[0].signal.aborted).toBe(true);
            expect(itemNamed(result.current.items, 'a').status).toBe('cancelled');
            expect(itemNamed(result.current.items, 'a').error).toBeUndefined();
            expect(itemNamed(result.current.items, 'd').status).toBe('uploading');
        });

        it('should cancel every queued and uploading file but keep finished ones', async () => {
            const onIdle = vi.fn();
            const { transport, calls, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport, { maxConcurrentFiles: 2, onIdle });
            act(() => result.current.add([file('a'), file('b'), file('c')]));
            await settle(() => callsFor('a')[0].resolve());

            await settle(() => result.current.cancelAll());

            expect(summary(result.current.items)).toEqual(['a:done', 'b:cancelled', 'c:cancelled']);
            expect(calls.every((call) => call.signal.aborted || call.file.name === 'a')).toBe(true);
            expect(onIdle).toHaveBeenCalledTimes(1);
        });
    });

    describe('retrying, removing and clearing', () => {
        it('should upload a failed file again with a fresh signal', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a')]));
            await settle(() => calls[0].reject(new Error('Server exploded')));

            act(() => result.current.retry(result.current.items[0].id));

            expect(result.current.items[0]).toMatchObject({ status: 'uploading', loadedBytes: 0 });
            expect(result.current.items[0].error).toBeUndefined();
            expect(calls).toHaveLength(2);
            expect(calls[1].signal).not.toBe(calls[0].signal);
            expect(calls[1].signal.aborted).toBe(false);
        });

        it('should upload a cancelled file again from zero', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a', 'hello')]));
            act(() => calls[0].onProgress(3));
            act(() => {
                vi.advanceTimersByTime(250);
            });
            await settle(() => result.current.cancel(result.current.items[0].id));

            act(() => result.current.retry(result.current.items[0].id));

            expect(result.current.items[0]).toMatchObject({ status: 'uploading', loadedBytes: 0 });
            expect(calls).toHaveLength(2);
        });

        it('should ignore retry for files that are done or still uploading', async () => {
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b')]));
            await settle(() => callsFor('a')[0].resolve());

            act(() => {
                result.current.retry(itemNamed(result.current.items, 'a').id);
                result.current.retry(itemNamed(result.current.items, 'b').id);
            });

            expect(summary(result.current.items)).toEqual(['a:done', 'b:uploading']);
            expect(transport.upload).toHaveBeenCalledTimes(2);
        });

        it('should ignore a late result of a cancelled attempt after a retry', async () => {
            const onUploaded = vi.fn();
            const { transport, calls } = createFakeTransport({ honourAbort: false });
            const { result } = renderQueue(transport, { onUploaded });
            act(() => result.current.add([file('a')]));
            act(() => result.current.cancel(result.current.items[0].id));
            act(() => result.current.retry(result.current.items[0].id));

            await settle(() => calls[0].resolve());

            expect(result.current.items[0].status).toBe('uploading');
            expect(onUploaded).not.toHaveBeenCalled();

            await settle(() => calls[1].resolve());

            expect(result.current.items[0].status).toBe('done');
            expect(onUploaded).toHaveBeenCalledTimes(1);
        });

        it('should remove a row, aborting its upload if it is running', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b')]));

            await settle(() => result.current.remove(itemNamed(result.current.items, 'a').id));

            expect(summary(result.current.items)).toEqual(['b:uploading']);
            expect(calls[0].signal.aborted).toBe(true);
        });

        it('should clear finished rows and keep queued and uploading ones', async () => {
            const { transport, callsFor } = createFakeTransport();
            const { result } = renderQueue(transport, { maxConcurrentFiles: 2 });
            act(() => result.current.add([file('a'), file('b'), file('c'), file('d'), file('e'), file('f')]));
            await settle(() => callsFor('a')[0].resolve());
            await settle(() => callsFor('b')[0].reject(new Error('Server exploded')));
            await settle(() => result.current.cancel(itemNamed(result.current.items, 'c').id));
            expect(summary(result.current.items)).toEqual([
                'a:done',
                'b:error',
                'c:cancelled',
                'd:uploading',
                'e:uploading',
                'f:queued',
            ]);

            act(() => result.current.clearFinished());

            expect(summary(result.current.items)).toEqual(['d:uploading', 'e:uploading', 'f:queued']);
        });

        it('should clear rejected rows as finished', () => {
            const { transport } = createFakeTransport();
            const { result } = renderQueue(transport, { accept: '.png' });
            act(() => result.current.add([file('notes.txt'), file('photo.png')]));

            act(() => result.current.clearFinished());

            expect(summary(result.current.items)).toEqual(['photo.png:uploading']);
        });
    });

    describe('same-name guard', () => {
        it('should not start a file while another file with the same name is uploading', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);

            act(() => result.current.add([file('a.txt'), file('a.txt'), file('b.txt')]));

            expect(summary(result.current.items)).toEqual(['a.txt:uploading', 'a.txt:queued', 'b.txt:uploading']);

            await settle(() => calls[0].resolve());

            expect(summary(result.current.items)).toEqual(['a.txt:done', 'a.txt:uploading', 'b.txt:uploading']);
        });
    });

    describe('restrictions', () => {
        it('should add files that do not match accept as rejected rows without uploading them', () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport, { accept: '.png,image/jpeg' });

            act(() => result.current.add([file('notes.txt', 'hi', 'text/plain'), file('photo.png')]));

            expect(summary(result.current.items)).toEqual(['notes.txt:rejected', 'photo.png:uploading']);
            expect(result.current.items[0].error).toBe('File type not allowed');
            expect(calls.map((call) => call.file.name)).toEqual(['photo.png']);
        });

        it('should add files rejected by validate as rejected rows with its message', () => {
            const validate = vi.fn((candidate: File) => (candidate.size > 3 ? 'File is too large' : undefined));
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport, { validate });
            const big = file('big', 'hello');

            act(() => result.current.add([big, file('small', 'hi')]));

            expect(validate).toHaveBeenCalledWith(big);
            expect(summary(result.current.items)).toEqual(['big:rejected', 'small:uploading']);
            expect(result.current.items[0].error).toBe('File is too large');
            expect(calls).toHaveLength(1);
        });

        it('should keep only the first file when multiple is false', () => {
            const { transport } = createFakeTransport();
            const { result } = renderQueue(transport, { multiple: false });

            act(() => result.current.add([file('a'), file('b')]));

            expect(summary(result.current.items)).toEqual(['a:uploading']);
        });

        it('should keep a rejected file rejected when it is retried', () => {
            const { transport } = createFakeTransport();
            const { result } = renderQueue(transport, { accept: '.png' });
            act(() => result.current.add([file('notes.txt')]));

            act(() => result.current.retry(result.current.items[0].id));

            expect(result.current.items[0]).toMatchObject({ status: 'rejected', error: 'File type not allowed' });
            expect(transport.upload).not.toHaveBeenCalled();
        });
    });

    describe('progress', () => {
        it('should apply many progress updates of all files in one state flush per 250 ms', () => {
            const { transport, calls } = createFakeTransport();
            const { result, renderCount } = renderQueue(transport);
            act(() => result.current.add([file('a', '0123456789'), file('b', '0123456789')]));
            const rendersBefore = renderCount();

            act(() => {
                for (let bytes = 1; bytes <= 10; bytes++) {
                    calls[0].onProgress(bytes);
                    calls[1].onProgress(bytes / 2);
                }
                vi.advanceTimersByTime(249);
            });

            expect(renderCount()).toBe(rendersBefore);
            expect(result.current.items.map((item) => item.loadedBytes)).toEqual([0, 0]);

            act(() => {
                vi.advanceTimersByTime(1);
            });

            expect(renderCount()).toBe(rendersBefore + 1);
            expect(result.current.items.map((item) => item.loadedBytes)).toEqual([10, 5]);
        });

        it('should apply status changes immediately and not let buffered progress overwrite them', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('a', 'hello')]));

            act(() => calls[0].onProgress(3));
            await settle(() => calls[0].resolve());

            expect(result.current.items[0]).toMatchObject({ status: 'done', loadedBytes: 5 });

            act(() => {
                vi.advanceTimersByTime(250);
            });

            expect(result.current.items[0]).toMatchObject({ status: 'done', loadedBytes: 5 });
        });

        it('should show a slow upload step by step and stop where it was cancelled', async () => {
            const { transport, calls } = createFakeTransport();
            const { result } = renderQueue(transport);
            act(() => result.current.add([file('big.bin', 'x'.repeat(100))]));

            for (const bytes of [10, 20, 30, 40]) {
                act(() => {
                    calls[0].onProgress(bytes);
                    vi.advanceTimersByTime(250);
                });
                expect(result.current.items[0]).toMatchObject({ status: 'uploading', loadedBytes: bytes });
            }

            await settle(() => result.current.cancel(result.current.items[0].id));
            act(() => {
                calls[0].onProgress(50);
                vi.advanceTimersByTime(250);
            });

            expect(calls[0].signal.aborted).toBe(true);
            expect(result.current.items[0]).toMatchObject({ status: 'cancelled', loadedBytes: 40 });
        });
    });

    describe('lifecycle', () => {
        it('should abort every active upload on unmount', () => {
            const { transport, calls } = createFakeTransport();
            const { result, unmount } = renderQueue(transport);
            act(() => result.current.add([file('a'), file('b')]));

            unmount();

            expect(calls.map((call) => call.signal.aborted)).toEqual([true, true]);
        });

        it('should use the latest callbacks without restarting uploads', async () => {
            const firstOnUploaded = vi.fn();
            const latestOnUploaded = vi.fn();
            const { transport, calls } = createFakeTransport();
            const { result, rerender } = renderQueue(transport, { onUploaded: firstOnUploaded });
            act(() => result.current.add([file('a')]));

            rerender({ onUploaded: latestOnUploaded });
            await settle(() => calls[0].resolve());

            expect(transport.upload).toHaveBeenCalledTimes(1);
            expect(firstOnUploaded).not.toHaveBeenCalled();
            expect(latestOnUploaded).toHaveBeenCalledTimes(1);
        });
    });
});
