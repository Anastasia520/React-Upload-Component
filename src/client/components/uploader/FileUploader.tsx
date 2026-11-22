import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import { useFileDrop } from '../../hooks/useFileDrop';
import { isActive, type UploadQueueOptions, useUploadQueue } from '../../hooks/useUploadQueue';
import { type UploadTransport } from '../../transport/types';
import { type DroppedFiles } from '../../utils/collectDroppedFiles';

import { DropOverlay } from './DropOverlay';
import { FilePicker } from './FilePicker';
import { UploadQueue } from './UploadQueue';
import { describeNotAdded, describeQueueChanges, type NotAdded } from './announcements';

// TODO: configurable texts (a `labels` prop or i18n). The English strings live in the uploader's components.
export type FileUploaderProps = UploadQueueOptions & {
    transport: UploadTransport;
    // 'self' takes drops only on the uploader, so it can be embedded anywhere. 'window' suits a page built around it.
    dropTarget?: 'self' | 'window';
    // Folders (picked or dropped) upload their files, flattened. Ignored when `multiple` is false.
    allowFolders?: boolean;
};

const ALL_ADDED: NotAdded = { skippedFolders: [], emptyFolders: [], unreadable: [] };

// The complete uploader: a file picker, drag and drop, the upload queue and one live region for screen readers.
export const FileUploader = ({
    transport,
    dropTarget = 'self',
    allowFolders = true,
    ...options
}: FileUploaderProps): ReactElement => {
    const queue = useUploadQueue(transport, options);
    const { items, add } = queue;
    const rootRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLButtonElement>(null);
    const foldersAllowed = allowFolders && options.multiple !== false;
    // What the latest drop couldn't add. A new object for every drop, so the same problem is announced again.
    const [notAdded, setNotAdded] = useState(ALL_ADDED);
    // A new id for every message, so the live region gets a new node and repeats an identical message.
    const [announcement, setAnnouncement] = useState({ id: 0, text: '' });

    const handlePicked = useCallback(
        (files: File[]): void => {
            add(files);
            setNotAdded(ALL_ADDED);
        },
        [add]
    );

    const handleDropped = useCallback(
        (dropped: DroppedFiles): void => {
            add(dropped.files);
            setNotAdded(dropped);
        },
        [add]
    );

    const { isDragging, isReading } = useFileDrop({
        onDrop: handleDropped,
        target: dropTarget === 'self' ? rootRef : undefined,
        allowFolders: foldersAllowed,
    });

    const previous = useRef({ items, notAdded });
    useEffect(() => {
        const text = [
            describeQueueChanges(previous.current.items, items),
            notAdded === previous.current.notAdded ? '' : describeNotAdded(notAdded),
        ]
            .filter(Boolean)
            .join(' ');
        previous.current = { items, notAdded };
        if (text) {
            setAnnouncement((current) => ({ id: current.id + 1, text }));
        }
    }, [items, notAdded]);

    // Only the queue's Remove and Clear finished can empty it, and the focused button goes with the last row.
    const hadItems = useRef(false);
    useEffect(() => {
        if (hadItems.current && items.length === 0) {
            pickerRef.current?.focus();
        }
        hadItems.current = items.length > 0;
    }, [items.length]);

    const hasActive = items.some(isActive);
    useEffect(() => {
        if (!hasActive) {
            return;
        }
        // Asks the browser to confirm leaving the page, which would abort the uploads.
        const warn = (event: BeforeUnloadEvent): void => {
            event.preventDefault();
        };
        window.addEventListener('beforeunload', warn);
        return () => {
            window.removeEventListener('beforeunload', warn);
        };
    }, [hasActive]);

    const notAddedNote = describeNotAdded(notAdded);
    const what = foldersAllowed ? 'files or folders' : 'files';

    return (
        <div ref={rootRef} className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <FilePicker
                    ref={pickerRef}
                    onFiles={handlePicked}
                    accept={options.accept}
                    multiple={options.multiple}
                    allowFolders={foldersAllowed}
                >
                    <p className="text-sm text-secondary">
                        {dropTarget === 'self' ? `or drop ${what} here` : `or drop ${what} anywhere on the page`}
                    </p>
                </FilePicker>
                {/* Not announced: the announcement of the added files follows as soon as reading ends. */}
                {isReading && <p className="text-sm text-secondary">Reading folders…</p>}
                {notAddedNote && <p className="text-sm text-secondary">{notAddedNote}</p>}
            </div>
            <UploadQueue {...queue} />
            <div role="status" className="sr-only">
                {announcement.text && <p key={announcement.id}>{announcement.text}</p>}
            </div>
            <DropOverlay visible={isDragging} fullWindow={dropTarget === 'window'} allowFolders={foldersAllowed} />
        </div>
    );
};
