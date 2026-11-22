import { type RefObject, useEffect, useRef, useState } from 'react';

import { collectDroppedFiles, type DroppedFiles } from '../utils/collectDroppedFiles';

export type FileDropOptions = {
    // Called once the dropped files, including those inside dropped folders, have been read.
    onDrop: (dropped: DroppedFiles) => void;
    // The element that takes drops (a ref filled before effects run). Without one, the whole window does.
    target?: RefObject<HTMLElement>;
    // When false, dropped folders aren't read; their names come back in `skippedFolders`.
    allowFolders?: boolean;
};

// `isReading`: dropped folders are still being read, so their files haven't reached onDrop yet.
export type FileDrop = { isDragging: boolean; isReading: boolean };

// The drag's DataTransfer if it carries files from the desktop; other drags (selected text, links) are left alone.
// Takes an Event because listeners on `HTMLElement | Window` get the generic signature; only drag events reach it.
const getFilesTransfer = (event: Event): DataTransfer | undefined => {
    const { dataTransfer } = event as DragEvent;
    return dataTransfer?.types.includes('Files') ? dataTransfer : undefined;
};

// Detects files dragged over the window (or the target element) and receives them on drop, so the browser doesn't
// open them instead.
export const useFileDrop = ({ onDrop, target, allowFolders = true }: FileDropOptions): FileDrop => {
    const [isDragging, setIsDragging] = useState(false);
    // The number of drops still being read; drops can overlap.
    const [readingCount, setReadingCount] = useState(0);
    // The latest options, so a new inline onDrop neither re-subscribes nor resets a drag in progress.
    const latest = useRef({ onDrop, allowFolders });
    latest.current = { onDrop, allowFolders };

    useEffect(() => {
        const zone = target?.current ?? window;
        // dragenter and dragleave fire for every element the pointer crosses, so they're counted.
        let depth = 0;
        // Cleared on unmount, so a drop that finishes reading afterwards is dropped.
        let isSubscribed = true;

        const handleDragEnter = (event: Event): void => {
            if (getFilesTransfer(event)) {
                depth++;
                setIsDragging(true);
            }
        };

        // Only file drags raise the depth, so a leave needs no type check.
        const handleDragLeave = (): void => {
            if (depth > 0) {
                depth--;
                setIsDragging(depth > 0);
            }
        };

        // Without preventDefault on dragover, the browser doesn't allow a drop here.
        const handleDragOver = (event: Event): void => {
            const transfer = getFilesTransfer(event);
            if (transfer) {
                event.preventDefault();
                transfer.dropEffect = 'copy';
            }
        };

        // Failed reads come back in `unreadable`, so `dropped` is missing only after an unexpected browser error.
        const finishReading = (dropped?: DroppedFiles): void => {
            if (isSubscribed) {
                setReadingCount((count) => count - 1);
                if (dropped) {
                    latest.current.onDrop(dropped);
                }
            }
        };

        const handleDrop = (event: Event): void => {
            const transfer = getFilesTransfer(event);
            if (transfer) {
                event.preventDefault();
                depth = 0;
                setIsDragging(false);
                setReadingCount((count) => count + 1);
                collectDroppedFiles(transfer, { folders: latest.current.allowFolders }).then(finishReading, () =>
                    finishReading()
                );
            }
        };

        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
        return () => {
            // Reads in progress are dropped, so they no longer count; otherwise a new target would stay "reading".
            isSubscribed = false;
            setReadingCount(0);
            zone.removeEventListener('dragenter', handleDragEnter);
            zone.removeEventListener('dragleave', handleDragLeave);
            zone.removeEventListener('dragover', handleDragOver);
            zone.removeEventListener('drop', handleDrop);
        };
    }, [target]);

    return { isDragging, isReading: readingCount > 0 };
};
