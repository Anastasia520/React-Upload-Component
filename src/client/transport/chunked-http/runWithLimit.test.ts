import { describe, it, expect, vi } from 'vitest';

import { runWithLimit } from './runWithLimit';

const createDeferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
    });
    return { promise, resolve, reject };
};

// Tasks whose promises the test settles by hand; tracks start order and the peak number running at once.
const createTasks = <T>(count: number) => {
    const deferreds = Array.from({ length: count }, () => createDeferred<T>());
    const started: number[] = [];
    let running = 0;
    let peak = 0;
    const tasks = deferreds.map((deferred, index) =>
        vi.fn(() => {
            started.push(index);
            running++;
            peak = Math.max(peak, running);
            return deferred.promise.finally(() => running--);
        })
    );
    return { deferreds, tasks, started, getPeak: () => peak };
};

// A macrotask runs only after every pending microtask, so all promise chains have settled by then.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('runWithLimit', () => {
    it('should resolve with an empty array for an empty task list', async () => {
        await expect(runWithLimit([], 2)).resolves.toEqual([]);
    });

    it('should keep the results in task order when tasks finish in reverse order', async () => {
        const { deferreds, tasks } = createTasks<string>(3);

        const result = runWithLimit(tasks, 3);
        deferreds[2].resolve('c');
        deferreds[1].resolve('b');
        deferreds[0].resolve('a');

        await expect(result).resolves.toEqual(['a', 'b', 'c']);
    });

    it('should never run more than the limit at once and start the next task when one finishes', async () => {
        const { deferreds, tasks, started, getPeak } = createTasks<number>(5);

        const result = runWithLimit(tasks, 2);
        await flush();
        expect(started).toEqual([0, 1]);

        deferreds[0].resolve(0);
        await flush();
        expect(started).toEqual([0, 1, 2]);

        deferreds[1].resolve(1);
        await flush();
        expect(started).toEqual([0, 1, 2, 3]);

        deferreds[2].resolve(2);
        deferreds[3].resolve(3);
        deferreds[4].resolve(4);

        await expect(result).resolves.toEqual([0, 1, 2, 3, 4]);
        expect(getPeak()).toBe(2);
    });

    it('should start all tasks at once when the limit is larger than the task count', async () => {
        const { deferreds, tasks, started } = createTasks<number>(3);

        const result = runWithLimit(tasks, 10);
        await flush();
        expect(started).toEqual([0, 1, 2]);

        for (const [index, deferred] of deferreds.entries()) {
            deferred.resolve(index);
        }
        await expect(result).resolves.toEqual([0, 1, 2]);
    });

    it('should reject with the first error and never start the remaining tasks', async () => {
        const { deferreds, tasks } = createTasks<number>(4);
        const error = new Error('chunk failed');

        const result = runWithLimit(tasks, 2);
        const assertion = expect(result).rejects.toBe(error);
        deferreds[0].reject(error);
        await assertion;

        deferreds[1].resolve(1);
        await flush();
        expect(tasks[2]).not.toHaveBeenCalled();
        expect(tasks[3]).not.toHaveBeenCalled();
    });

    it('should reject without waiting for tasks that are still running', async () => {
        const { deferreds, tasks } = createTasks<number>(2);
        const error = new Error('chunk failed');

        const result = runWithLimit(tasks, 2);
        const assertion = expect(result).rejects.toBe(error);
        deferreds[0].reject(error);

        // Task 1 is never settled, so this only passes if the rejection does not wait for it.
        await assertion;
    });

    it('should ignore a sibling that rejects after the first failure', async () => {
        const { deferreds, tasks } = createTasks<number>(2);
        const firstError = new Error('first');

        const result = runWithLimit(tasks, 2);
        const assertion = expect(result).rejects.toBe(firstError);
        deferreds[0].reject(firstError);
        await assertion;

        // Vitest fails the run on an unhandled rejection, so this also checks that the late error is handled.
        deferreds[1].reject(new Error('second'));
        await flush();
    });

    it.each([0, -1, 1.5])('should reject with a RangeError for limit %s', async (limit) => {
        const task = vi.fn(() => Promise.resolve(1));

        await expect(runWithLimit([task], limit)).rejects.toThrow(RangeError);
        expect(task).not.toHaveBeenCalled();
    });
});
