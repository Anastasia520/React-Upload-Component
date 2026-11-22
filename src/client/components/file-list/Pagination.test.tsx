import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { Pagination } from './Pagination';

expect.extend(axeMatchers);

const renderPagination = (page: number, pageCount: number) => {
    const onPageChange = vi.fn();
    const view = render(<Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />);
    return { ...view, onPageChange };
};

const previous = (): HTMLElement => screen.getByRole('button', { name: 'Previous page' });
const next = (): HTMLElement => screen.getByRole('button', { name: 'Next page' });

describe('Pagination', () => {
    afterEach(() => {
        cleanup();
    });

    it('should show the current page in a navigation landmark', () => {
        renderPagination(2, 3);

        expect(screen.getByRole('navigation', { name: 'Pagination' })).toBeInTheDocument();
        expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
        expect(previous()).toHaveTextContent(/^Previous/);
        expect(next()).toHaveTextContent(/^Next/);
    });

    it('should announce the page politely, since focus stays on the button', () => {
        renderPagination(2, 3);

        expect(screen.getByText('Page 2 of 3')).toHaveAttribute('aria-live', 'polite');
    });

    it('should go to the previous and the next page', async () => {
        const { onPageChange } = renderPagination(2, 3);

        await userEvent.click(previous());
        await userEvent.click(next());

        expect(onPageChange.mock.calls).toEqual([[1], [3]]);
    });

    it('should mark Previous unavailable on the first page and keep it focusable', async () => {
        const { onPageChange } = renderPagination(1, 3);

        expect(previous()).toHaveAttribute('aria-disabled', 'true');
        expect(next()).not.toHaveAttribute('aria-disabled');

        await userEvent.click(previous());
        expect(onPageChange).not.toHaveBeenCalled();
        expect(previous()).toHaveFocus();
    });

    it('should mark Next unavailable on the last page and keep focus on it', async () => {
        const { onPageChange, rerender } = renderPagination(2, 3);

        await userEvent.click(next());
        rerender(<Pagination page={3} pageCount={3} onPageChange={onPageChange} />);

        expect(next()).toHaveAttribute('aria-disabled', 'true');
        expect(next()).toHaveFocus();

        await userEvent.keyboard('{Enter}');
        expect(onPageChange).toHaveBeenCalledTimes(1);
    });

    it('should have no accessibility violations', async () => {
        const { container } = renderPagination(1, 3);

        expect(await axe(container)).toHaveNoViolations();
    });
});
