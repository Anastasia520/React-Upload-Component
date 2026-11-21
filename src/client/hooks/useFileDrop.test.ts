import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';

import { drag, filesTransfer, textTransfer } from '../test-utils/dragEvents';

import { useFileDrop } from './useFileDrop';

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

        it('should take drops on the target and leave drops elsewhere to the browser', () => {
            const { onDrop, zone, child } = renderZoneDrop();
            const files = [new File(['a'], 'a.txt')];

            const outside = drag('drop', filesTransfer(files));
            expect(outside.defaultPrevented).toBe(false);
            expect(onDrop).not.toHaveBeenCalled();

            const over = drag('dragOver', filesTransfer(), zone);
            const inside = drag('drop', filesTransfer(files), child);
            expect(over.defaultPrevented).toBe(true);
            expect(inside.defaultPrevented).toBe(true);
            expect(onDrop).toHaveBeenCalledWith(files, []);
        });

        it('should stop listening on the target when unmounted', () => {
            const { unmount, onDrop, zone } = renderZoneDrop();

            unmount();
            const drop = drag('drop', filesTransfer(), zone);

            expect(drop.defaultPrevented).toBe(false);
            expect(onDrop).not.toHaveBeenCalled();
        });
    });
});
