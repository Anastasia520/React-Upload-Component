import { useCallback, useEffect, useReducer, useRef } from 'react';

import { type RemoteFile, type UploadTransport } from '../transport/types';
import { matchesAccept } from '../utils/matchesAccept';

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export type UploadItem = { id: string; file: File; status: UploadStatus; loadedBytes: number; error?: string };

export type UploadQueueOptions = {
    maxConcurrentFiles?: number;
    // Same format as the native input's `accept`, but also enforced for files added another way (for example a drop).
    accept?: string;
    // When false, only the first file of each `add` call is kept.
    multiple?: boolean;
    // Returns an error message to reject the file, or undefined to accept it.
    validate?: (file: File) => string | undefined;
    onUploaded?: (item: UploadItem, stored: RemoteFile) => void;
    // Called once each time the last queued or uploading file finishes.
    onIdle?: () => void;
};

export type UploadQueue = {
    items: UploadItem[];
    add: (files: Iterable<File>) => void;
    cancel: (id: string) => void;
    cancelAll: () => void;
    retry: (id: string) => void;
    remove: (id: string) => void;
    clearFinished: () => void;
};

const PROGRESS_FLUSH_MS = 250;
const NOT_ALLOWED = 'File type not allowed';

// Ids only need to be unique within the page. A counter works everywhere, unlike crypto.randomUUID, which needs a
// secure context (it fails on plain http://<LAN-IP>, for example when testing on a phone).
let lastId = 0;

type Action =
    | { type: 'add'; items: UploadItem[] }
    | { type: 'start' | 'done' | 'cancel' | 'retry' | 'remove'; id: string }
    | { type: 'fail'; id: string; error: string }
    | { type: 'progress'; loaded: Map<string, number> }
    | { type: 'cancelAll' | 'clearFinished' };

const isActive = (item: UploadItem): boolean => item.status === 'queued' || item.status === 'uploading';

// Changes the item only while it's in one of the `from` statuses, so a late result of a cancelled, removed or
// replaced upload changes nothing.
const transition = (
    items: UploadItem[],
    id: string,
    from: UploadStatus[],
    change: (item: UploadItem) => Partial<UploadItem>
): UploadItem[] =>
    items.map((item) => (item.id === id && from.includes(item.status) ? { ...item, ...change(item) } : item));

const reducer = (items: UploadItem[], action: Action): UploadItem[] => {
    switch (action.type) {
        case 'add': {
            return [...items, ...action.items];
        }
        case 'start': {
            return transition(items, action.id, ['queued'], () => ({ status: 'uploading' }));
        }
        case 'progress': {
            return items.map((item) => {
                const loadedBytes = action.loaded.get(item.id);
                return loadedBytes === undefined || item.status !== 'uploading' ? item : { ...item, loadedBytes };
            });
        }
        case 'done': {
            return transition(items, action.id, ['uploading'], (item) => ({
                status: 'done',
                loadedBytes: item.file.size,
            }));
        }
        case 'fail': {
            return transition(items, action.id, ['uploading'], () => ({ status: 'error', error: action.error }));
        }
        case 'cancel': {
            return transition(items, action.id, ['queued', 'uploading'], () => ({ status: 'cancelled' }));
        }
        case 'cancelAll': {
            return items.map((item) => (isActive(item) ? { ...item, status: 'cancelled' } : item));
        }
        case 'retry': {
            return transition(items, action.id, ['error', 'cancelled'], () => ({
                status: 'queued',
                loadedBytes: 0,
                error: undefined,
            }));
        }
        case 'remove': {
            return items.filter((item) => item.id !== action.id);
        }
        case 'clearFinished': {
            return items.filter(isActive);
        }
    }
};

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

const abortUpload = (controllers: Map<string, AbortController>, id: string): void => {
    controllers.get(id)?.abort();
    controllers.delete(id);
};

// The upload queue: validates added files, uploads at most `maxConcurrentFiles` at once through the transport, and
// tracks each file's status and progress. Progress reaches state at most every 250 ms for all files together;
// status changes apply immediately.
export const useUploadQueue = (transport: UploadTransport, options: UploadQueueOptions = {}): UploadQueue => {
    const [items, dispatch] = useReducer(reducer, []);
    // One controller per running upload. An upload's result only counts while its controller is still the current one.
    const controllers = useRef(new Map<string, AbortController>());
    const progress = useRef({ loaded: new Map<string, number>(), timer: undefined as number | undefined });
    // Ids of files rejected by `accept` or `validate`; retrying them can't succeed.
    const rejectedIds = useRef(new Set<string>());
    // The latest transport and options, so new inline callbacks neither restart nor duplicate uploads.
    const latest = useRef({ transport, options });
    latest.current = { transport, options };

    const startUpload = useCallback((item: UploadItem): void => {
        const controller = new AbortController();
        const isCurrent = (): boolean => controllers.current.get(item.id) === controller;
        controllers.current.set(item.id, controller);
        progress.current.loaded.delete(item.id);
        dispatch({ type: 'start', id: item.id });

        const onProgress = (loadedBytes: number): void => {
            const buffer = progress.current;
            if (!isCurrent()) {
                return;
            }
            buffer.loaded.set(item.id, loadedBytes);
            if (buffer.timer === undefined) {
                buffer.timer = window.setTimeout(() => {
                    buffer.timer = undefined;
                    const loaded = new Map(buffer.loaded);
                    buffer.loaded.clear();
                    dispatch({ type: 'progress', loaded });
                }, PROGRESS_FLUSH_MS);
            }
        };

        const onStored = (stored: RemoteFile): void => {
            if (isCurrent()) {
                controllers.current.delete(item.id);
                dispatch({ type: 'done', id: item.id });
                latest.current.options.onUploaded?.({ ...item, status: 'done', loadedBytes: item.file.size }, stored);
            }
        };

        const onFailed = (error: unknown): void => {
            if (isCurrent()) {
                controllers.current.delete(item.id);
                if (isAbortError(error)) {
                    dispatch({ type: 'cancel', id: item.id });
                } else {
                    const message = error instanceof Error ? error.message : 'Upload failed';
                    dispatch({ type: 'fail', id: item.id, error: message });
                }
            }
        };

        latest.current.transport.upload(item.file, { signal: controller.signal, onProgress }).then(onStored, onFailed);
    }, []);

    // Starts queued files in order while slots are free. A file waits while another file with the same name uploads,
    // because the server keys chunk files by name; files behind it can still start.
    useEffect(() => {
        const { maxConcurrentFiles = 3 } = latest.current.options;
        const uploading = items.filter((item) => item.status === 'uploading');
        const busyNames = new Set(uploading.map((item) => item.file.name));
        let freeSlots = maxConcurrentFiles - uploading.length;
        for (const item of items) {
            if (freeSlots <= 0) {
                break;
            }
            if (item.status === 'queued' && !busyNames.has(item.file.name)) {
                busyNames.add(item.file.name);
                freeSlots--;
                startUpload(item);
            }
        }
    }, [items, startUpload]);

    const activeCount = items.filter(isActive).length;
    const wasActive = useRef(false);
    useEffect(() => {
        if (wasActive.current && activeCount === 0) {
            latest.current.options.onIdle?.();
        }
        wasActive.current = activeCount > 0;
    }, [activeCount]);

    useEffect(() => {
        const running = controllers.current;
        const buffer = progress.current;
        return () => {
            for (const controller of running.values()) {
                controller.abort();
            }
            running.clear();
            window.clearTimeout(buffer.timer);
        };
    }, []);

    const add = useCallback((files: Iterable<File>): void => {
        const { accept, multiple = true, validate } = latest.current.options;
        const selected = [...files].slice(0, multiple ? undefined : 1);
        const added = selected.map((file): UploadItem => {
            const id = `upload-${++lastId}`;
            const error = matchesAccept(file, accept) ? validate?.(file) : NOT_ALLOWED;
            if (error) {
                rejectedIds.current.add(id);
                return { id, file, status: 'error', loadedBytes: 0, error };
            }
            return { id, file, status: 'queued', loadedBytes: 0 };
        });
        dispatch({ type: 'add', items: added });
    }, []);

    const cancel = useCallback((id: string): void => {
        abortUpload(controllers.current, id);
        dispatch({ type: 'cancel', id });
    }, []);

    const cancelAll = useCallback((): void => {
        for (const id of controllers.current.keys()) {
            abortUpload(controllers.current, id);
        }
        dispatch({ type: 'cancelAll' });
    }, []);

    const retry = useCallback((id: string): void => {
        if (!rejectedIds.current.has(id)) {
            dispatch({ type: 'retry', id });
        }
    }, []);

    const remove = useCallback((id: string): void => {
        abortUpload(controllers.current, id);
        dispatch({ type: 'remove', id });
    }, []);

    const clearFinished = useCallback((): void => dispatch({ type: 'clearFinished' }), []);

    return { items, add, cancel, cancelAll, retry, remove, clearFinished };
};
