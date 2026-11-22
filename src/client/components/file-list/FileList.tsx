import { type ReactElement, useRef, useState } from 'react';

import { type RemoteFiles } from '../../hooks/useRemoteFiles';
import { formatBytes } from '../../utils/formatBytes';

import { Pagination } from './Pagination';

// Takes the remote files hook's result: `<FileList {...remoteFiles} />`.
export type FileListProps = Pick<RemoteFiles, 'files' | 'status' | 'error' | 'refresh'> & {
    pageSize?: number;
};

const BUTTON_CLASS =
    'min-h-11 min-w-11 rounded border border-line bg-surface px-3 text-sm text-primary hover:bg-surface-hover';

// English, like the rest of the texts (see the TODO on the uploader's props).
const countFormat = new Intl.NumberFormat('en');

const describeCount = (count: number): string => `${countFormat.format(count)} ${count === 1 ? 'file' : 'files'}`;

// The stored files, one page at a time. Loading and empty texts show only while there are no files, so a background
// refresh keeps the rows on screen; a failed refresh shows its error above them.
export const FileList = ({ files, status, error, refresh, pageSize = 50 }: FileListProps): ReactElement => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const [page, setPage] = useState(1);
    // The list can shrink after a refresh, so the stored page is capped instead of corrected in an effect.
    const pageCount = Math.max(1, Math.ceil(files.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const start = (currentPage - 1) * pageSize;

    // "Try again" disappears once the request starts, so focus moves to the heading.
    const handleRetry = (): void => {
        refresh();
        headingRef.current?.focus();
    };

    return (
        <section className="flex flex-col gap-3">
            <div>
                <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-primary">
                    Files
                </h2>
                {files.length > 0 && <p className="text-sm text-secondary">{describeCount(files.length)}</p>}
            </div>
            {status === 'error' && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <p role="alert" className="min-w-0 break-words text-sm text-error">
                        {`Couldn't load the files: ${error ?? ''}`}
                    </p>
                    <button type="button" className={BUTTON_CLASS} onClick={handleRetry}>
                        Try again
                    </button>
                </div>
            )}
            {files.length === 0 && status === 'loading' && <p className="text-sm text-secondary">Loading files…</p>}
            {files.length === 0 && status === 'ready' && (
                <p className="text-sm text-secondary">No files uploaded yet.</p>
            )}
            {files.length > 0 && (
                <>
                    {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics without bullets */}
                    <ul role="list" className="divide-y divide-line">
                        {files.slice(start, start + pageSize).map((file) => (
                            <li key={file.name} className="flex items-center gap-3 py-2">
                                <span className="min-w-0 flex-1 truncate text-primary" title={file.name}>
                                    {file.name}
                                </span>
                                <span className="shrink-0 text-sm tabular-nums text-secondary">
                                    {formatBytes(file.size)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />}
                </>
            )}
        </section>
    );
};
