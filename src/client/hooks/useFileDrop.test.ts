import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { drag, dropFiles, filesTransfer, finishReading, folder, textTransfer } from '../test-utils/dragEvents';
import { type DroppedFiles } from '../utils/collectDroppedFiles';

import { type FileDropOptions, useFileDrop } from './useFileDrop';

const renderDrop = (options: Partial<FileDropOptions> = {}) => {
    const onDrop = vi.fn();
    const view = renderHook(() => useFileDrop({ onDrop, ...options }));
    return { ...view, onDrop };
};

// What onDrop receives for a drop of plain files.
const droppedFiles = (files: File[]): DroppedFiles => ({
    files: files.map((file) => ({ file })),
    skippedFolders: [],
    emptyFolders: [],
    unreadable: [],
});

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

    it('should pass dropped files on in order and stop the browser from opening them', async () => {
        const { result, onDrop } = renderDrop();
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

        drag('dragEnter');
        drag('dragEnter');
        const over = drag('dragOver');
        const drop = await dropFiles(filesTransfer(files));

        expect(over.defaultPrevented).toBe(true);
        expect(drop.defaultPrevented).toBe(true);
        expect(onDrop).toHaveBeenCalledTimes(1);
        expect(onDrop).toHaveBeenCalledWith(droppedFiles(files));
        expect(result.current.isDragging).toBe(false);
    });

    it('should ignore drags that carry no files', async () => {
        const { result, onDrop } = renderDrop();

        drag('dragEnter', textTransfer());
        expect(result.current.isDragging).toBe(false);

        const over = drag('dragOver', textTransfer());
        const drop = await dropFiles(textTransfer());
        drag('dragLeave', textTransfer());

        expect(over.defaultPrevented).toBe(false);
        expect(drop.defaultPrevented).toBe(false);
        expect(onDrop).not.toHaveBeenCalled();
        expect(result.current.isDragging).toBe(false);
    });

    it('should read dropped folders and pass their files on with their paths', async () => {
        const { onDrop } = renderDrop();
        const a = new File(['a'], 'a.txt');
        const b = new File(['b'], 'b.txt');

        await dropFiles(filesTransfer([a, folder('photos', [b])]));

        expect(onDrop).toHaveBeenCalledWith({
            ...droppedFiles([a]),
            files: [{ file: a }, { file: b, relativePath: 'photos/b.txt' }],
        });
    });

    it('should report reading while dropped items are read, also for overlapping drops', async () => {
        const { result, onDrop } = renderDrop();
        expect(result.current.isReading).toBe(false);

        drag('drop', filesTransfer([folder('photos', [new File(['a'], 'a.txt')])]));
        drag('drop', filesTransfer([folder('docs', [new File(['b'], 'b.txt')])]));
        expect(result.current.isReading).toBe(true);
        expect(onDrop).not.toHaveBeenCalled();

        await finishReading();

        expect(result.current.isReading).toBe(false);
        expect(onDrop).toHaveBeenCalledTimes(2);
    });

    it('should skip dropped folders and report their names when folders are not allowed', async () => {
        const { onDrop } = renderDrop({ allowFolders: false });
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

        await dropFiles(filesTransfer([files[0], folder('photos', [new File(['c'], 'c.txt')]), files[1]]));

        expect(onDrop).toHaveBeenCalledWith({ ...droppedFiles(files), skippedFolders: ['photos'] });
    });

    it('should stop reading without an error when the drop cannot be read at all', async () => {
        const { result, onDrop } = renderDrop();
        const broken = {
            kind: 'file',
            getAsFile: () => null,
            webkitGetAsEntry: () => {
                throw new Error('Unexpected browser failure');
            },
        };

        await dropFiles({ types: ['Files'], items: [broken] });

        expect(result.current.isReading).toBe(false);
        expect(onDrop).not.toHaveBeenCalled();
    });

    it('should not pass on a drop that is still being read when unmounted', async () => {
        const { unmount, onDrop } = renderDrop();

        drag('drop', filesTransfer([folder('photos', [new File(['a'], 'a.txt')])]));
        unmount();
        await finishReading();

        expect(onDrop).not.toHaveBeenCalled();
    });

    it('should call the latest onDrop without losing the drag in progress', async () => {
        const first = vi.fn();
        const second = vi.fn();
        const { result, rerender } = renderHook(({ onDrop }) => useFileDrop({ onDrop }), {
            initialProps: { onDrop: first },
        });

        drag('dragEnter');
        rerender({ onDrop: second });
        expect(result.current.isDragging).toBe(true);

        await dropFiles(filesTransfer());

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('should stop listening when unmounted', async () => {
        const { unmount, onDrop } = renderDrop();

        unmount();
        const over = drag('dragOver');
        const drop = await dropFiles(filesTransfer());

        expect(over.defaultPrevented).toBe(false);
        expect(drop.defaultPrevented).toBe(false);
        expect(onDrop).not.toHaveBeenCalled();
    });

    describe('with a target element', () => {
        // A drop zone with a child, so the tests can check that drags over children count too.
        const createZone = () => {
            const zone = document.createElement('div');
            const child = document.createElement('button');
            zone.append(child);
            document.body.append(zone);
            return { zone, child };
        };

        const renderZoneDrop = () => {
            const { zone, child } = createZone();
            const onDrop = vi.fn();
            // Created once, like a useRef object.
            const target = { current: zone };
            const view = renderHook(() => useFileDrop({ onDrop, target }));
            return { ...view, onDrop, zone, child };
        };

        afterEach(() => {
            document.body.replaceChildren();
        });

        it('should react to drags over the target and its children, but not elsewhere in the window', () => {
            const { result, child } = renderZoneDrop();

            drag('dragEnter');
            expect(result.current.isDragging).toBe(false);

            drag('dragEnter', filesTransfer(), child);
            expect(result.current.isDragging).toBe(true);

            drag('dragLeave', filesTransfer(), child);
            expect(result.current.isDragging).toBe(false);
        });

        it('should take drops on the target and leave drops elsewhere to the browser', async () => {
            const { onDrop, zone, child } = renderZoneDrop();
            const files = [new File(['a'], 'a.txt')];

            const outside = await dropFiles(filesTransfer(files));
            expect(outside.defaultPrevented).toBe(false);
            expect(onDrop).not.toHaveBeenCalled();

            const over = drag('dragOver', filesTransfer(), zone);
            const inside = await dropFiles(filesTransfer(files), child);
            expect(over.defaultPrevented).toBe(true);
            expect(inside.defaultPrevented).toBe(true);
            expect(onDrop).toHaveBeenCalledWith(droppedFiles(files));
        });

        it('should drop a read in progress and stop reading when the target changes', async () => {
            const { zone } = createZone();
            const other = createZone().zone;
            const onDrop = vi.fn();
            const { result, rerender } = renderHook(({ target }) => useFileDrop({ onDrop, target }), {
                initialProps: { target: { current: zone } },
            });

            drag('drop', filesTransfer([folder('photos', [new File(['a'], 'a.txt')])]), zone);
            rerender({ target: { current: other } });
            await finishReading();

            expect(result.current.isReading).toBe(false);
            expect(onDrop).not.toHaveBeenCalled();
        });

        it('should stop listening on the target when unmounted', async () => {
            const { unmount, onDrop, zone } = renderZoneDrop();

            unmount();
            const drop = await dropFiles(filesTransfer(), zone);

            expect(drop.defaultPrevented).toBe(false);
            expect(onDrop).not.toHaveBeenCalled();
        });
    });
});
