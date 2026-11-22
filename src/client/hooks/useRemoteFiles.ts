import { useCallback, useEffect, useRef, useState } from 'react';

import { type FileSource, type RemoteFile } from '../transport/types';
import { compareFileNames, upsertSorted } from '../utils/upsertSorted';

// `loading` whenever a request is in flight, also while the previous files are still shown.
export type RemoteFilesStatus = 'loading' | 'ready' | 'error';

export type RemoteFiles = {
    // Sorted with `compareFileNames`.
    files: RemoteFile[];
    status: RemoteFilesStatus;
    error?: string;
    // Fetches the list again, replacing optimistic entries. A request still in flight is aborted.
    refresh: () => void;
    // Adds or replaces a file without a request, for example after an upload. Applied in batches.
    upsert: (file: RemoteFile) => void;
};

type State = Pick<RemoteFiles, 'files' | 'status' | 'error'>;

const UPSERT_FLUSH_MS = 250;

const byName = (a: RemoteFile, b: RemoteFile): number => compareFileNames(a.name, b.name);

// The files of a FileSource: fetched on mount, refreshed on demand, and updated optimistically. Upserts reach state
// at most every 250 ms, so a burst of finished uploads costs one copy of a large list, not one per file.
export const useRemoteFiles = (source: FileSource): RemoteFiles => {
    const [state, setState] = useState<State>({ files: [], status: 'loading' });
    const request = useRef({ controller: undefined as AbortController | undefined });
    const pending = useRef({ files: new Map<string, RemoteFile>(), timer: undefined as number | undefined });
    const latestSource = useRef(source);
    latestSource.current = source;

    const refresh = useCallback((): void => {
        request.current.controller?.abort();
        const controller = new AbortController();
        request.current.controller = controller;
        setState((previous) =>
            previous.status === 'loading' ? previous : { ...previous, status: 'loading', error: undefined }
        );

        // An aborted request was replaced or unmounted, so its outcome (including the AbortError) is ignored.
        latestSource.current.listFiles(controller.signal).then(
            (files) => {
                if (!controller.signal.aborted) {
                    setState({ files: [...files].sort(byName), status: 'ready' });
                }
            },
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    const message = error instanceof Error ? error.message : 'Request failed';
                    setState((previous) => ({ ...previous, status: 'error', error: message }));
                }
            }
        );
    }, []);

    const upsert = useCallback((file: RemoteFile): void => {
        const buffer = pending.current;
        buffer.files.set(file.name, file);
        if (buffer.timer === undefined) {
            buffer.timer = window.setTimeout(() => {
                buffer.timer = undefined;
                const additions = [...buffer.files.values()];
                buffer.files.clear();
                setState((previous) => ({ ...previous, files: upsertSorted(previous.files, additions) }));
            }, UPSERT_FLUSH_MS);
        }
    }, []);

    useEffect(() => {
        refresh();
        const current = request.current;
        const buffer = pending.current;
        return () => {
            current.controller?.abort();
            window.clearTimeout(buffer.timer);
            // Fast Refresh re-runs effects on the same refs; a stale timer id would block every later flush.
            buffer.timer = undefined;
        };
    }, [refresh]);

    return { ...state, refresh, upsert };
};
