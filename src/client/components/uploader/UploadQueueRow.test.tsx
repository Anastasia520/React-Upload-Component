import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { type UploadItem, type UploadStatus } from '../../hooks/useUploadQueue';

import { UploadQueueRow } from './UploadQueueRow';

expect.extend(axeMatchers);

const NAME = 'report.pdf';
const LONG_NAME = `${'a'.repeat(196)}.pdf`;

// 200 bytes, 84 of them loaded: 42%.
const makeItem = (overrides: Partial<UploadItem> = {}, name = NAME): UploadItem => ({
    id: 'upload-1',
    file: new File(['x'.repeat(200)], name),
    status: 'uploading',
    loadedBytes: 84,
    ...overrides,
});

const ITEMS: Record<UploadStatus, UploadItem> = {
    queued: makeItem({ status: 'queued', loadedBytes: 0 }),
    uploading: makeItem(),
    done: makeItem({ status: 'done', loadedBytes: 200 }),
    error: makeItem({ status: 'error', error: 'Server exploded' }),
    cancelled: makeItem({ status: 'cancelled' }),
    rejected: makeItem({ status: 'rejected', loadedBytes: 0, error: 'File type not allowed' }),
};

const renderRow = (item: UploadItem) => {
    const callbacks = { onCancel: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn() };
    const view = render(
        <ul>
            <UploadQueueRow item={item} {...callbacks} />
        </ul>
    );
    const rerenderRow = (next: UploadItem): void =>
        view.rerender(
            <ul>
                <UploadQueueRow item={next} {...callbacks} />
            </ul>
        );
    return { ...view, ...callbacks, rerenderRow };
};

describe('UploadQueueRow', () => {
    afterEach(() => {
        cleanup();
    });

    it('should show the name, the size and a named progress bar', () => {
        renderRow(ITEMS.uploading);

        expect(screen.getByRole('listitem')).toBeInTheDocument();
        expect(screen.getByText(NAME)).toBeInTheDocument();
        expect(screen.getByText('200 B')).toBeInTheDocument();
        expect(screen.getByRole('progressbar', { name: `Uploading ${NAME}` })).toHaveAttribute('value', '42');
    });

    it.each([
        ['queued', 'Waiting', undefined],
        ['uploading', '42%', undefined],
        ['done', 'Uploaded', 'text-success'],
        ['error', 'Failed: Server exploded', 'text-error'],
        ['cancelled', 'Cancelled', undefined],
        ['rejected', 'Not uploaded: File type not allowed', 'text-error'],
    ] as const)('should show the status text of a %s row', (status, text, colour) => {
        renderRow(ITEMS[status]);

        const statusText = screen.getByText(text);
        if (colour) {
            expect(statusText).toHaveClass(colour);
        }
    });

    it('should not show a progress bar for a rejected row', () => {
        renderRow(ITEMS.rejected);

        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it.each([
        ['queued', ['Cancel upload of report.pdf']],
        ['uploading', ['Cancel upload of report.pdf']],
        ['done', ['Remove report.pdf']],
        ['error', ['Retry upload of report.pdf', 'Remove report.pdf']],
        ['cancelled', ['Retry upload of report.pdf', 'Remove report.pdf']],
        ['rejected', ['Remove report.pdf']],
    ] as const)('should offer the right buttons for a %s row', (status, names) => {
        renderRow(ITEMS[status]);

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(names.length);
        for (const [index, name] of names.entries()) {
            expect(buttons[index]).toHaveAccessibleName(name);
        }
    });

    it('should show short button labels and hide the file name visually', () => {
        renderRow(ITEMS.error);

        const retry = screen.getByRole('button', { name: `Retry upload of ${NAME}` });
        const remove = screen.getByRole('button', { name: `Remove ${NAME}` });
        expect(within(retry).getByText(`upload of ${NAME}`)).toHaveClass('sr-only');
        expect(within(remove).getByText(NAME)).toHaveClass('sr-only');
    });

    it('should pass the item id to cancel', async () => {
        const { onCancel, onRetry, onRemove } = renderRow(ITEMS.uploading);

        await userEvent.click(screen.getByRole('button', { name: `Cancel upload of ${NAME}` }));

        expect(onCancel).toHaveBeenCalledWith('upload-1');
        expect(onRetry).not.toHaveBeenCalled();
        expect(onRemove).not.toHaveBeenCalled();
    });

    it('should pass the item id to retry and remove', async () => {
        const { onCancel, onRetry, onRemove } = renderRow(ITEMS.error);

        await userEvent.click(screen.getByRole('button', { name: `Retry upload of ${NAME}` }));
        await userEvent.click(screen.getByRole('button', { name: `Remove ${NAME}` }));

        expect(onRetry).toHaveBeenCalledWith('upload-1');
        expect(onRemove).toHaveBeenCalledWith('upload-1');
        expect(onCancel).not.toHaveBeenCalled();
    });

    it('should pass the item id to remove for a finished row', async () => {
        const { onRemove } = renderRow(ITEMS.done);

        await userEvent.click(screen.getByRole('button', { name: `Remove ${NAME}` }));

        expect(onRemove).toHaveBeenCalledWith('upload-1');
    });

    it.each([
        ['cancelled', 'Retry upload of report.pdf'],
        ['error', 'Retry upload of report.pdf'],
        ['done', 'Remove report.pdf'],
    ] as const)('should keep focus on the first button when the row becomes %s', async (status, name) => {
        const { rerenderRow } = renderRow(ITEMS.uploading);
        await userEvent.click(screen.getByRole('button', { name: `Cancel upload of ${NAME}` }));

        rerenderRow(ITEMS[status]);

        expect(screen.getByRole('button', { name })).toHaveFocus();
    });

    it('should truncate a long name visually but keep it whole for hover and screen readers', () => {
        renderRow(makeItem({ status: 'error', error: 'Server exploded' }, LONG_NAME));

        // The Remove button's hidden text is also the bare name, so the visible name is found by its title.
        const name = screen.getByTitle(LONG_NAME);
        expect(name).toHaveClass('truncate');
        expect(name).toHaveTextContent(LONG_NAME);
        expect(screen.getByRole('progressbar', { name: `Uploading ${LONG_NAME}` })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Retry upload of ${LONG_NAME}` })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Remove ${LONG_NAME}` })).toBeInTheDocument();
    });

    it.each(Object.keys(ITEMS) as UploadStatus[])('should have no accessibility violations when %s', async (status) => {
        const { container } = renderRow(ITEMS[status]);

        expect(await axe(container)).toHaveNoViolations();
    });

    it('should have no accessibility violations with a long name', async () => {
        const { container } = renderRow(makeItem({}, LONG_NAME));

        expect(await axe(container)).toHaveNoViolations();
    });

    it('should show where a file from a folder came from under its name, truncated like the name', async () => {
        const relativePath = `photos/${'nested/'.repeat(30)}${NAME}`;
        const { container } = renderRow(makeItem({ relativePath }));

        const path = screen.getByTitle(relativePath);
        expect(path).toHaveTextContent(relativePath);
        expect(path).toHaveClass('truncate');
        expect(screen.getByTitle(NAME).nextElementSibling).toBe(path);
        expect(await axe(container)).toHaveNoViolations();
    });

    it('should show no path for a file that did not come from a folder', () => {
        renderRow(ITEMS.uploading);

        expect(screen.queryByText(/\//)).not.toBeInTheDocument();
    });
});
