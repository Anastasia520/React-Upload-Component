// Runs the tasks with at most `limit` in flight and resolves with their results in task order.
// On the first rejection no new task starts and the returned promise rejects with that error. Tasks already running
// are not awaited; cancelling them is the caller's job (for example through an AbortSignal).
export const runWithLimit = async <T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> => {
    if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError(`limit must be a positive integer, got ${limit}`);
    }

    const results: T[] = [];
    let nextIndex = 0;
    let failed = false;

    const worker = async (): Promise<void> => {
        while (!failed && nextIndex < tasks.length) {
            const index = nextIndex++;
            try {
                results[index] = await tasks[index]();
            } catch (error) {
                failed = true;
                throw error;
            }
        }
    };

    const workerCount = Math.min(limit, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
};
