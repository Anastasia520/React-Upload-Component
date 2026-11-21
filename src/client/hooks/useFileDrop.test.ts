import { cleanup, createEvent, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { useFileDrop } from './useFileDrop';

type Dropped = File | { folder: string };

// A fake DataTransferItem. Browsers also return a File for a dropped folder; only its entry says it's a directory.
const fakeItem = (dropped: Dropped) => {
    const isDirectory = !(dropped instanceof File);
    const file = isDirectory ? new File([], dropped.folder) : dropped;
    return { kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isDirectory, name: file.name }) };
};

// A fake DataTransfer for a drag of files and folders from the desktop.
const filesTransfer = (dropped: Dropped[] = []) => ({ types: ['Files'], items: dropped.map(fakeItem) });

// A drag of selected text, not files.
const textTransfer = () => ({ types: ['text/plain'], items: [] });

type DragType = 'dragEnter' | 'dragLeave' | 'dragOver' | 'drop';

// Fires a drag event on the window and returns it, so a test can check defaultPrevented.
const drag = (type: DragType, dataTransfer: object = filesTransfer()): Event => {
    const event = createEvent[type](window, { dataTransfer });
    fireEvent(window, event);
    return event;
};

const renderDrop = () => {
    const onDrop = vi.fn();
    const view = renderHook(() => useFileDrop({ onDrop }));
    return { ...view, onDrop };
};

describe('useFileDrop', () => {
    // Every hook listens on the shared window, so each test's hook must be unmounted before the next test.
    afterEach(() => {
        cleanup();
    });

    it('should report dragging while files are dragged over the window', () => {
        const { result } = renderDrop();
        expect(result.current.isDragging).toBe(false);

        drag('dragEnter');
        expect(result.current.isDragging).toBe(true);

        drag('dragLeave');
        expect(result.current.isDragging).toBe(false);
    });

    it('should keep dragging while the pointer moves between nested elements', () => {
        const { result } = renderDrop();

        drag('dragEnter');
        drag('dragEnter');
        drag('dragLeave');
        expect(result.current.isDragging).toBe(true);

        drag('dragLeave');
        expect(result.current.isDragging).toBe(false);
    });

    it('should pass dropped files on in order and stop the browser from opening them', () => {
        const { result, onDrop } = renderDrop();
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

        drag('dragEnter');
        drag('dragEnter');
        const over = drag('dragOver');
        const drop = drag('drop', filesTransfer(files));

        expect(over.defaultPrevented).toBe(true);
        expect(drop.defaultPrevented).toBe(true);
        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop).toHaveBeenCalledWith(files, []);
        expect(result.current.isDragging).toBe(false);
    });

    it('should ignore drags that carry no files', () => {
        const { result, onDrop } = renderDrop();

        drag('dragEnter', textTransfer());
        expect(result.current.isDragging).toBe(false);

        const over = drag('dragOver', textTransfer());
        const drop = drag('drop', textTransfer());
        drag('dragLeave', textTransfer());

        expect(over.defaultPrevented).toBe(false);
        expect(drop.defaultPrevented).toBe(false);
        expect(onDrop).not.toHaveBeenCalled();
        expect(result.current.isDragging).toBe(false);
    });

    it('should skip dropped folders and report their names', () => {
        const { onDrop } = renderDrop();
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

        drag('drop', filesTransfer([files[0], { folder: 'photos' }, files[1]]));

        expect(onDrop).toHaveBeenCalledWith(files, ['photos']);
    });

    it('should report a drop of only folders, so the user can be told', () => {
        const { onDrop } = renderDrop();

        drag('drop', filesTransfer([{ folder: 'photos' }, { folder: 'docs' }]));

        expect(onDrop).toHaveBeenCalledWith([], ['photos', 'docs']);
    });

    it('should call the latest onDrop without losing the drag in progress', () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(({ onDrop }) => useFileDrop({ onDrop }), {
            initialProps: { onDrop: first },
        });

        drag('dragEnter');
        rerender({ onDrop: second });
        expect(result.current.isDragging).toBe(true);

        drag('drop');

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('should stop listening when unmounted', () => {
        const { unmount, onDrop } = renderDrop();

        unmount();
        const over = drag('dragOver');
        const drop = drag('drop');

        expect(over.defaultPrevented).toBe(false);
        expect(drop.defaultPrevented).toBe(false);
        expect(onDrop).not.toHaveBeenCalled();
    });
});
