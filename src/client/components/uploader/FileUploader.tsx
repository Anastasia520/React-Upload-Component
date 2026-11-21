import { type ReactElement, useCallback, useEffect, useRef, useState } from 'react';

import { useFileDrop } from '../../hooks/useFileDrop';
import { isActive, type UploadQueueOptions, useUploadQueue } from '../../hooks/useUploadQueue';
import { type UploadTransport } from '../../transport/types';

import { DropOverlay } from './DropOverlay';
import { FilePicker } from './FilePicker';
import { UploadQueue } from './UploadQueue';
import { describeQueueChanges, describeSkippedFolders } from './announcements';

// TODO: configurable texts (a `labels` prop or i18n). The English strings live in the uploader's components.
export type FileUploaderProps = UploadQueueOptions & {
    transport: UploadTransport;
    // 'self' takes drops only on the uploader, so it can be embedded anywhere. 'window' suits a page built around it.
    dropTarget?: 'self' | 'window';
};

// The complete uploader: a file picker, drag and drop, the upload queue and one live region for screen readers.
export const FileUploader = ({ transport, dropTarget = 'self', ...options }: FileUploaderProps): ReactElement => {
    const queue = useUploadQueue(transport, options);
    const { items, add } = queue;
    const rootRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLButtonElement>(null);
    // A new array for every add, so the same folders dropped twice are announced twice.
    const [skippedFolders, setSkippedFolders] = useState<string[]>([]);
    // A new id for every message, so the live region gets a new node and repeats an identical message.
    const [announcement, setAnnouncement] = useState({ id: 0, text: '' });

    const handleFiles = useCallback(
        (files: File[], folders: string[] = []): void => {
            add(files);
            setSkippedFolders(folders);
        },
        [add]
    );

    const { isDragging } = useFileDrop({ onDrop: handleFiles, target: dropTarget === 'self' ? rootRef : undefined });

    const previous = useRef({ items, skippedFolders });
    useEffect(() => {
        const text = [
            describeQueueChanges(previous.current.items, items),
            skippedFolders === previous.current.skippedFolders ? '' : describeSkippedFolders(skippedFolders),
        ]
            .filter(Boolean)
            .join(' ');
        previous.current = { items, skippedFolders };
        if (text) {
            setAnnouncement((current) => ({ id: current.id + 1, text }));
        }
    }, [items, skippedFolders]);

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

    const folderNote = describeSkippedFolders(skippedFolders);

    return (
        <div ref={rootRef} className="relative flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <FilePicker
                        ref={pickerRef}
                        onFiles={handleFiles}
                        accept={options.accept}
                        multiple={options.multiple}
                    />
                    <p className="text-sm text-secondary">
                        {dropTarget === 'self' ? 'or drop files here' : 'or drop files anywhere on the page'}
                    </p>
                </div>
                {folderNote && <p className="text-sm text-secondary">{folderNote}</p>}
            </div>
            <UploadQueue {...queue} />
            <div role="status" className="sr-only">
                {announcement.text && <p key={announcement.id}>{announcement.text}</p>}
            </div>
            <DropOverlay visible={isDragging} fullWindow={dropTarget === 'window'} />
        </div>
    );
};
