import { act, createEvent, fireEvent } from '@testing-library/react';

// A dropped folder. `batchSize` is how many entries each readEntries call returns (Chrome returns about 100), and
// `unreadable` makes readEntries fail.
export type FakeFolder = { folder: string; children?: Dropped[]; batchSize?: number; unreadable?: boolean };
// A file inside a folder whose file() call fails.
export type FakeBrokenFile = { brokenFile: string };
export type Dropped = File | FakeFolder | FakeBrokenFile;

export const folder = (
    name: string,
    children: Dropped[] = [],
    options: Omit<FakeFolder, 'folder' | 'children'> = {}
): FakeFolder => ({ folder: name, children, ...options });

const readError = (): DOMException => new DOMException('A requested file could not be read.', 'NotReadableError');

// A fake FileSystemEntry. Like the browser's, it answers asynchronously; here in a microtask.
const fakeEntry = (dropped: Dropped, parentPath: string): object => {
    if (dropped instanceof File || 'brokenFile' in dropped) {
        const name = dropped instanceof File ? dropped.name : dropped.brokenFile;
        return {
            isFile: true,
            isDirectory: false,
            name,
            fullPath: `${parentPath}/${name}`,
            file: (success: (file: File) => void, failure: (error: DOMException) => void) => {
                queueMicrotask(() => (dropped instanceof File ? success(dropped) : failure(readError())));
            },
        };
    }

    const fullPath = `${parentPath}/${dropped.folder}`;
    const children = (dropped.children ?? []).map((child) => fakeEntry(child, fullPath));
    const batchSize = dropped.batchSize ?? 100;
    return {
        isFile: false,
        isDirectory: true,
        name: dropped.folder,
        fullPath,
        createReader: () => {
            let offset = 0;
            return {
                readEntries: (success: (entries: object[]) => void, failure: (error: DOMException) => void) => {
                    queueMicrotask(() => {
                        if (dropped.unreadable) {
                            failure(readError());
                            return;
                        }
                        const batch = children.slice(offset, offset + batchSize);
                        offset += batch.length;
                        success(batch);
                    });
                },
            };
        },
    };
};

// A fake DataTransferItem. Browsers also return a File for a dropped folder; only its entry says it's a directory.
const fakeItem = (dropped: Dropped): object => {
    const name = dropped instanceof File ? dropped.name : 'folder' in dropped ? dropped.folder : dropped.brokenFile;
    const file = dropped instanceof File ? dropped : new File([], name);
    return { kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => fakeEntry(dropped, '') };
};

export type FakeTransfer = { types: string[]; items: object[] };

// A fake DataTransfer for a drag of files and folders from the desktop.
export const filesTransfer = (dropped: Dropped[] = []): FakeTransfer => ({
    types: ['Files'],
    items: dropped.map(fakeItem),
});

// A drag of selected text, not files.
export const textTransfer = (): FakeTransfer => ({ types: ['text/plain'], items: [] });

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

// Waits, inside act, until dropped folders have been read: the fake entries answer in microtasks, which all run
// before the next macrotask.
export const finishReading = async (): Promise<void> => {
    await act(async () => {
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
    });
};

// Drops files and folders, and waits until they have been read.
export const dropFiles = async (dataTransfer: object, target: Element | Window = window): Promise<Event> => {
    const event = drag('drop', dataTransfer, target);
    await finishReading();
    return event;
};
