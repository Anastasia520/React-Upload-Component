import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { type UploadItem, type UploadStatus } from '../../hooks/useUploadQueue';

import { UploadQueue } from './UploadQueue';

expect.extend(axeMatchers);

const makeItem = (name: string, status: UploadStatus, error?: string): UploadItem => ({
    id: `id-${name}`,
    file: new File(['hello'], name),
    status,
    loadedBytes: status === 'done' ? 5 : 0,
    error,
});

const MIXED: UploadItem[] = [
    makeItem('a.txt', 'done'),
    makeItem('b.txt', 'uploading'),
    makeItem('c.txt', 'queued'),
    makeItem('d.txt', 'error', 'Server exploded'),
    makeItem('e.txt', 'cancelled'),
    makeItem('f.txt', 'rejected', 'File type not allowed'),
];

const renderQueue = (items: UploadItem[]) => {
    const actions = {
        cancel: vi.fn(),
        retry: vi.fn(),
        remove: vi.fn(),
        cancelAll: vi.fn(),
        clearFinished: vi.fn(),
    };
    const view = render(<UploadQueue items={items} {...actions} />);
    const rerenderQueue = (next: UploadItem[]): void => view.rerender(<UploadQueue items={next} {...actions} />);
    return { ...view, ...actions, rerenderQueue };
};

const heading = (): HTMLElement => screen.getByRole('heading', { level: 2, name: 'Uploads' });

// Counts how often a file's name is read. A row reads it on every render, the queue itself never does.
const countNameReads = (file: File): (() => number) => {
    const { name } = file;
    const read = vi.fn(() => name);
    Object.defineProperty(file, 'name', { get: read });
    return () => read.mock.calls.length;
};

describe('UploadQueue', () => {
    afterEach(() => {
        cleanup();
    });

    it('should render nothing when there are no items', () => {
        const { container } = renderQueue([]);

        expect(container).toBeEmptyDOMElement();
    });

    it('should show a heading and one list item per upload, in order', () => {
        renderQueue(MIXED);

        expect(heading()).toBeInTheDocument();
        const rows = within(screen.getByRole('list')).getAllByRole('listitem');
        expect(rows).toHaveLength(MIXED.length);
        for (const [index, item] of MIXED.entries()) {
            expect(rows[index]).toHaveTextContent(item.file.name);
        }
    });

    it('should summarise how many files are uploaded', () => {
        renderQueue([makeItem('a.txt', 'done'), makeItem('b.txt', 'uploading'), makeItem('c.txt', 'queued')]);

        expect(screen.getByText('1 of 3 uploaded')).toBeInTheDocument();
    });

    it('should count failed and rejected files as failed in the summary', () => {
        renderQueue(MIXED);

        expect(screen.getByText('1 of 6 uploaded · 2 failed')).toBeInTheDocument();
    });

    it('should not make the summary or anything else a live region', () => {
        const { container } = renderQueue(MIXED);

        expect(container.querySelector('[aria-live]')).toBeNull();
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it.each([
        ['only active rows', [makeItem('a.txt', 'queued'), makeItem('b.txt', 'uploading')], true, false],
        ['active and finished rows', MIXED, true, true],
        [
            'only finished rows',
            [
                makeItem('a.txt', 'done'),
                makeItem('b.txt', 'error', 'Server exploded'),
                makeItem('c.txt', 'cancelled'),
                makeItem('d.txt', 'rejected', 'File type not allowed'),
            ],
            false,
            true,
        ],
    ])('should show the right bulk buttons with %s', (_, items, showsCancelAll, showsClearFinished) => {
        renderQueue(items);

        expect(screen.queryByRole('button', { name: 'Cancel all' }) !== null).toBe(showsCancelAll);
        expect(screen.queryByRole('button', { name: 'Clear finished' }) !== null).toBe(showsClearFinished);
    });

    it('should cancel all and clear finished through the hook', async () => {
        const { cancelAll, clearFinished } = renderQueue(MIXED);

        await userEvent.click(screen.getByRole('button', { name: 'Cancel all' }));
        await userEvent.click(screen.getByRole('button', { name: 'Clear finished' }));

        expect(cancelAll).toHaveBeenCalledTimes(1);
        expect(clearFinished).toHaveBeenCalledTimes(1);
    });

    it('should pass the row id to cancel, retry and remove', async () => {
        const { cancel, retry, remove } = renderQueue(MIXED);

        await userEvent.click(screen.getByRole('button', { name: 'Cancel upload of b.txt' }));
        await userEvent.click(screen.getByRole('button', { name: 'Retry upload of d.txt' }));
        await userEvent.click(screen.getByRole('button', { name: 'Remove e.txt' }));

        expect(cancel).toHaveBeenCalledWith('id-b.txt');
        expect(retry).toHaveBeenCalledWith('id-d.txt');
        expect(remove).toHaveBeenCalledWith('id-e.txt');
    });

    it.each(['Remove a.txt', 'Cancel all', 'Clear finished'])(
        'should move focus to the heading after "%s"',
        async (buttonName) => {
            renderQueue(MIXED);

            await userEvent.click(screen.getByRole('button', { name: buttonName }));

            expect(heading()).toHaveFocus();
        }
    );

    it('should not focus the heading after cancel or retry', async () => {
        renderQueue(MIXED);

        await userEvent.click(screen.getByRole('button', { name: 'Cancel upload of b.txt' }));

        expect(heading()).not.toHaveFocus();
    });

    it('should re-render only the rows that changed', () => {
        const unchanged = makeItem('a.txt', 'uploading');
        const changing = makeItem('b.txt', 'uploading');
        const unchangedReads = countNameReads(unchanged.file);
        const changingReads = countNameReads(changing.file);
        const { rerenderQueue } = renderQueue([unchanged, changing]);
        const before = { unchanged: unchangedReads(), changing: changingReads() };

        rerenderQueue([unchanged, { ...changing, loadedBytes: 3 }]);

        expect(unchangedReads()).toBe(before.unchanged);
        expect(changingReads()).toBeGreaterThan(before.changing);
    });

    it('should have no accessibility violations with every status', async () => {
        const { container } = renderQueue(MIXED);

        expect(await axe(container)).toHaveNoViolations();
    });

    it('should have no accessibility violations with long names', async () => {
        const { container } = renderQueue([
            makeItem(`${'a'.repeat(196)}.pdf`, 'uploading'),
            makeItem(`${'b'.repeat(196)}.pdf`, 'error', 'Server exploded'),
        ]);

        expect(await axe(container)).toHaveNoViolations();
    });
});
