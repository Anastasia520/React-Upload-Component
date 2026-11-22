import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { type RemoteFilesStatus } from '../../hooks/useRemoteFiles';
import { type RemoteFile } from '../../transport/types';

import { FileList } from './FileList';

expect.extend(axeMatchers);

// file-001.txt … file-NNN.txt, already sorted like the hook returns them.
const manyFiles = (count: number): RemoteFile[] =>
    Array.from({ length: count }, (_, index) => ({ name: `file-${String(index + 1).padStart(3, '0')}.txt`, size: 1 }));

type ListState = { files?: RemoteFile[]; status?: RemoteFilesStatus; error?: string };

const renderList = ({ files = [], status = 'ready', error }: ListState = {}) => {
    const refresh = vi.fn();
    const view = render(<FileList files={files} status={status} error={error} refresh={refresh} />);
    const rerenderList = (next: ListState): void =>
        view.rerender(
            <FileList files={next.files ?? files} status={next.status ?? status} error={next.error} refresh={refresh} />
        );
    return { ...view, refresh, rerenderList };
};

const heading = (): HTMLElement => screen.getByRole('heading', { level: 2, name: 'Files' });

const rowNames = (): string[] =>
    within(screen.getByRole('list'))
        .getAllByRole('listitem')
        .map((row) => row.querySelector('[title]')?.textContent ?? '');

describe('FileList', () => {
    afterEach(() => {
        cleanup();
    });

    describe('states', () => {
        it('should show a loading text while the first fetch runs', () => {
            renderList({ status: 'loading' });

            expect(heading()).toBeInTheDocument();
            expect(screen.getByText('Loading files…')).toBeInTheDocument();
            expect(screen.queryByRole('list')).not.toBeInTheDocument();
        });

        it('should keep the rows instead of the loading text while refreshing', () => {
            renderList({ files: manyFiles(2), status: 'loading' });

            expect(screen.queryByText('Loading files…')).not.toBeInTheDocument();
            expect(rowNames()).toEqual(['file-001.txt', 'file-002.txt']);
        });

        it('should say when there are no files', () => {
            renderList();

            expect(screen.getByText('No files uploaded yet.')).toBeInTheDocument();
            expect(screen.queryByRole('list')).not.toBeInTheDocument();
        });

        it('should show an error with a retry that moves focus to the heading', async () => {
            const { refresh, rerenderList } = renderList({ status: 'error', error: 'Server exploded' });

            expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load the files: Server exploded");
            expect(screen.queryByText('No files uploaded yet.')).not.toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
            rerenderList({ status: 'loading' });

            expect(refresh).toHaveBeenCalledTimes(1);
            expect(heading()).toHaveFocus();
        });

        it('should keep the rows when a refresh fails', () => {
            renderList({ files: manyFiles(2), status: 'error', error: 'Network error' });

            expect(screen.getByRole('alert')).toHaveTextContent('Network error');
            expect(rowNames()).toHaveLength(2);
        });
    });

    describe('rows', () => {
        it('should show the count, the names and the sizes', () => {
            renderList({
                files: [
                    { name: 'a.txt', size: 1536 },
                    { name: 'b.txt', size: 5 },
                ],
            });

            expect(screen.getByText('2 files')).toBeInTheDocument();
            const rows = within(screen.getByRole('list')).getAllByRole('listitem');
            expect(rows[0]).toHaveTextContent('a.txt');
            expect(rows[0]).toHaveTextContent('1.5 KB');
            expect(rows[1]).toHaveTextContent('5 B');
        });

        it('should count a single file in the singular, and thousands with separators', () => {
            const { rerenderList } = renderList({ files: manyFiles(1) });
            expect(screen.getByText('1 file')).toBeInTheDocument();

            rerenderList({ files: manyFiles(1234) });
            expect(screen.getByText('1,234 files')).toBeInTheDocument();
        });

        it('should truncate a long name, keeping the full name as hint and accessible text', () => {
            const name = `${'very-long-file-name-'.repeat(10)}.pdf`;
            renderList({ files: [{ name, size: 1 }] });

            const label = screen.getByText(name);
            expect(label).toHaveClass('truncate');
            expect(label).toHaveAttribute('title', name);
            expect(within(screen.getByRole('list')).getByRole('listitem')).toHaveTextContent(name);
        });
    });

    describe('pagination', () => {
        it('should show no pagination for one page', () => {
            renderList({ files: manyFiles(50) });

            expect(rowNames()).toHaveLength(50);
            expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
        });

        it('should show 50 files per page and move between pages', async () => {
            renderList({ files: manyFiles(120) });

            expect(rowNames()).toHaveLength(50);
            expect(rowNames()[0]).toBe('file-001.txt');
            expect(rowNames()[49]).toBe('file-050.txt');
            expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
            expect(rowNames()[0]).toBe('file-051.txt');
            expect(rowNames()[49]).toBe('file-100.txt');

            await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
            expect(rowNames()).toHaveLength(20);
            expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

            await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
            expect(rowNames()[0]).toBe('file-051.txt');
        });

        it('should stay on the last page when the list shrinks', async () => {
            const { rerenderList } = renderList({ files: manyFiles(120) });
            await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
            await userEvent.click(screen.getByRole('button', { name: 'Next page' }));

            rerenderList({ files: manyFiles(60) });

            expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
            expect(rowNames()).toHaveLength(10);
            expect(rowNames()[0]).toBe('file-051.txt');

            await userEvent.click(screen.getByRole('button', { name: 'Previous page' }));
            expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
        });
    });

    it('should have no accessibility violations in any state', async () => {
        const { container, rerenderList } = renderList({ status: 'loading' });
        expect(await axe(container)).toHaveNoViolations();

        rerenderList({ status: 'ready', files: [] });
        expect(await axe(container)).toHaveNoViolations();

        rerenderList({ status: 'error', error: 'Server exploded' });
        expect(await axe(container)).toHaveNoViolations();

        rerenderList({ status: 'ready', files: manyFiles(120) });
        expect(await axe(container)).toHaveNoViolations();
    });
});
