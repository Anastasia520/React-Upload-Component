import { createEvent, fireEvent } from '@testing-library/react';

export type Dropped = File | { folder: string };

// A fake DataTransferItem. Browsers also return a File for a dropped folder; only its entry says it's a directory.
const fakeItem = (dropped: Dropped): object => {
    const isDirectory = !(dropped instanceof File);
    const file = isDirectory ? new File([], dropped.folder) : dropped;
    return { kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isDirectory, name: file.name }) };
};

// A fake DataTransfer for a drag of files and folders from the desktop.
export const filesTransfer = (dropped: Dropped[] = []): object => ({ types: ['Files'], items: dropped.map(fakeItem) });

// A drag of selected text, not files.
export const textTransfer = (): object => ({ types: ['text/plain'], items: [] });

export type DragType = 'dragEnter' | 'dragLeave' | 'dragOver' | 'drop';

// Fires a drag event on the target (the window by default) and returns it, so a test can check defaultPrevented.
export const drag = (
    type: DragType,
    dataTransfer: object = filesTransfer(),
    target: Element | Window = window
): Event => {
    const event = createEvent[type](target, { dataTransfer });
    fireEvent(target, event);
    return event;
};
