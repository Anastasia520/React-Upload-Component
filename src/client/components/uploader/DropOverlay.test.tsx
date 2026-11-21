import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { DropOverlay } from './DropOverlay';

expect.extend(axeMatchers);

// The outermost element, which carries the visibility classes. happy-dom loads no CSS, so classes are checked.
const overlay = (): HTMLElement | null => screen.getByText('Drop files to upload').closest('[aria-hidden]');

describe('DropOverlay', () => {
    afterEach(() => {
        cleanup();
    });

    it('should cover the window without catching events or reaching the accessibility tree', () => {
        render(<DropOverlay visible />);

        expect(overlay()).toHaveAttribute('aria-hidden', 'true');
        expect(overlay()).toHaveClass('fixed', 'inset-0', 'pointer-events-none');
    });

    it.each([
        [true, 'visible opacity-100'],
        [false, 'invisible opacity-0'],
    ])('should show or hide itself (visible: %s)', (visible, classes) => {
        render(<DropOverlay visible={visible} />);

        expect(overlay()).toHaveClass(...classes.split(' '));
    });

    it('should fade only when the user allows motion', () => {
        render(<DropOverlay visible />);

        expect(overlay()).toHaveClass('motion-reduce:transition-none');
    });

    it.each([true, false])('should have no accessibility violations (visible: %s)', async (visible) => {
        const { container } = render(<DropOverlay visible={visible} />);

        expect(await axe(container)).toHaveNoViolations();
    });
});
