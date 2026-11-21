import { type RefObject, useEffect, useRef, useState } from 'react';

export type FileDropOptions = {
    // `skippedFolders` holds the names of dropped folders, which aren't uploaded.
    // TODO: (session 11) upload the files inside dropped folders instead of skipping them.
    onDrop: (files: File[], skippedFolders: string[]) => void;
    // The element that takes drops (a ref filled before effects run). Without one, the whole window does.
    target?: RefObject<HTMLElement>;
};

export type FileDrop = { isDragging: boolean };

// The drag's DataTransfer if it carries files from the desktop; other drags (selected text, links) are left alone.
// Takes an Event because listeners on `HTMLElement | Window` get the generic signature; only drag events reach it.
const getFilesTransfer = (event: Event): DataTransfer | undefined => {
    const { dataTransfer } = event as DragEvent;
    return dataTransfer?.types.includes('Files') ? dataTransfer : undefined;
};

// Splits the dropped items into files and folder names. Only works during the drop event, because the browser
// empties the DataTransfer afterwards.
const splitDropped = (transfer: DataTransfer): { files: File[]; folders: string[] } => {
    const files: File[] = [];
    const folders: string[] = [];
    for (const item of transfer.items) {
        const entry = item.kind === 'file' ? item.webkitGetAsEntry() : null;
        const file = item.kind === 'file' ? item.getAsFile() : null;
        if (entry?.isDirectory) {
            folders.push(entry.name);
        } else if (file) {
            files.push(file);
        }
    }
    return { files, folders };
};

// Detects files dragged over the window (or the target element) and receives them on drop, so the browser doesn't
// open them instead.
export const useFileDrop = ({ onDrop, target }: FileDropOptions): FileDrop => {
    const [isDragging, setIsDragging] = useState(false);
    // The latest callback, so a new inline onDrop neither re-subscribes nor resets a drag in progress.
    const latestOnDrop = useRef(onDrop);
    latestOnDrop.current = onDrop;

    useEffect(() => {
        const zone = target?.current ?? window;
        // dragenter and dragleave fire for every element the pointer crosses, so they're counted.
        let depth = 0;

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

        const handleDrop = (event: Event): void => {
            const transfer = getFilesTransfer(event);
            if (transfer) {
                event.preventDefault();
                depth = 0;
                setIsDragging(false);
                const { files, folders } = splitDropped(transfer);
                latestOnDrop.current(files, folders);
            }
        };

        zone.addEventListener('dragenter', handleDragEnter);
        zone.addEventListener('dragleave', handleDragLeave);
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
        return () => {
            zone.removeEventListener('dragenter', handleDragEnter);
            zone.removeEventListener('dragleave', handleDragLeave);
            zone.removeEventListener('dragover', handleDragOver);
            zone.removeEventListener('drop', handleDrop);
        };
    }, [target]);

    return { isDragging };
};
