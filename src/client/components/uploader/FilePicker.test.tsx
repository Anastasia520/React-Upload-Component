import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { fileAt, stubFolderSupport } from '../../test-utils/folders';
import { addHiddenRule } from '../../test-utils/hiddenRule';

import { FilePicker, type FilePickerProps } from './FilePicker';

expect.extend(axeMatchers);

const FOLDER_NOTE = "Folder contents are uploaded as individual files; folder structure isn't kept.";

const renderPicker = (props: Partial<FilePickerProps> = {}) => {
    const onFiles = vi.fn();
    const view = render(<FilePicker onFiles={onFiles} {...props} />);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
        throw new Error('file input not rendered');
    }
    return { ...view, onFiles, input };
};

// Counts clicks on the hidden input, which is what opens the native file dialog.
const countClicks = (input: HTMLInputElement): (() => number) => {
    const onClick = vi.fn();
    input.addEventListener('click', onClick);
    return () => onClick.mock.calls.length;
};

describe('FilePicker', () => {
    addHiddenRule();

    afterEach(() => {
        cleanup();
    });

    it('should render a "Select files" button and keep the input out of the tab order', async () => {
        renderPicker();

        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Select files' })).toHaveFocus();

        await userEvent.tab();
        expect(document.body).toHaveFocus();
    });

    it('should open the file input once when the button is clicked', async () => {
        const { input } = renderPicker();
        const clicks = countClicks(input);

        await userEvent.click(screen.getByRole('button', { name: 'Select files' }));

        expect(clicks()).toBe(1);
    });

    it.each(['{Enter}', ' '])('should open the file input with the keyboard (%s)', async (key) => {
        const { input } = renderPicker();
        const clicks = countClicks(input);

        await userEvent.tab();
        await userEvent.keyboard(key);

        expect(clicks()).toBe(1);
    });

    it('should pass the selected files to onFiles as an array, in order', async () => {
        const { input, onFiles } = renderPicker();
        const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];

        await userEvent.upload(input, files);

        expect(onFiles).toHaveBeenCalledTimes(1);
        expect(onFiles).toHaveBeenCalledWith(files);
    });

    it('should let the same file be picked again', async () => {
        const { input, onFiles } = renderPicker();
        const file = new File(['a'], 'a.txt');

        await userEvent.upload(input, file);
        await userEvent.upload(input, file);

        expect(onFiles).toHaveBeenCalledTimes(2);
        expect(input.value).toBe('');
    });

    it('should pass accept to the input and allow multiple files by default', () => {
        const { input } = renderPicker({ accept: 'image/*,.pdf' });

        expect(input).toHaveAttribute('accept', 'image/*,.pdf');
        expect(input.multiple).toBe(true);
    });

    it('should allow a single file and say so when multiple is false', () => {
        const { input } = renderPicker({ multiple: false });

        expect(input.multiple).toBe(false);
        expect(screen.getByRole('button', { name: 'Select file' })).toBeInTheDocument();
    });

    it('should forward its ref to the button, so it can be focused', () => {
        const ref = createRef<HTMLButtonElement>();
        render(<FilePicker ref={ref} onFiles={vi.fn()} />);

        ref.current?.focus();

        expect(screen.getByRole('button', { name: 'Select files' })).toHaveFocus();
    });

    it('should show its children next to the buttons', () => {
        render(
            <FilePicker onFiles={vi.fn()}>
                <p>or drop files here</p>
            </FilePicker>
        );

        expect(screen.getByText('or drop files here')).toBeInTheDocument();
    });

    it('should have no accessibility violations', async () => {
        const { container } = renderPicker({ accept: '.pdf' });

        expect(await axe(container)).toHaveNoViolations();
    });

    it('should not offer folders where the browser cannot pick them', () => {
        renderPicker({ allowFolders: true });

        expect(screen.queryByRole('button', { name: 'Select folder' })).not.toBeInTheDocument();
        expect(screen.queryByText(FOLDER_NOTE)).not.toBeInTheDocument();
    });

    describe('folders', () => {
        stubFolderSupport();

        const folderButton = (): HTMLElement => screen.getByRole('button', { name: 'Select folder' });

        const folderInput = (container: HTMLElement): HTMLInputElement => {
            const input = container.querySelector<HTMLInputElement>('input[webkitdirectory]');
            if (!input) {
                throw new Error('folder input not rendered');
            }
            return input;
        };

        it('should offer a folder button after the files button, described by the visible folder note', async () => {
            renderPicker({ allowFolders: true });

            await userEvent.tab();
            await userEvent.tab();
            expect(folderButton()).toHaveFocus();
            expect(folderButton()).toHaveAccessibleDescription(FOLDER_NOTE);
            expect(screen.getByText(FOLDER_NOTE)).toBeVisible();

            await userEvent.tab();
            expect(document.body).toHaveFocus();
        });

        it('should open a hidden folder input without accept once per click or key press', async () => {
            const { container } = renderPicker({ allowFolders: true, accept: '.pdf' });
            const input = folderInput(container);
            const clicks = countClicks(input);

            await userEvent.click(folderButton());
            expect(clicks()).toBe(1);
            await userEvent.keyboard('{Enter}');
            expect(clicks()).toBe(2);
            await userEvent.keyboard(' ');
            expect(clicks()).toBe(3);

            expect(input).not.toBeVisible();
            expect(input).not.toHaveAttribute('accept');
        });

        it('should pass on the folder’s files without hidden and system files, and reset the input', async () => {
            const { container, onFiles } = renderPicker({ allowFolders: true });
            const input = folderInput(container);
            const files = [fileAt('photos/a.jpg'), fileAt('photos/2024/b.jpg')];

            await userEvent.upload(input, [
                files[0],
                fileAt('photos/.DS_Store'),
                fileAt('photos/.git/HEAD'),
                files[1],
                fileAt('photos/Thumbs.db'),
            ]);

            expect(onFiles).toHaveBeenCalledWith(files);
            expect(input.value).toBe('');
        });

        it.each([
            ['folders are not allowed', {}],
            ['only one file may be picked', { allowFolders: true, multiple: false }],
        ])('should not offer folders when %s', (_, props) => {
            renderPicker(props);

            expect(screen.queryByRole('button', { name: 'Select folder' })).not.toBeInTheDocument();
            expect(screen.queryByText(FOLDER_NOTE)).not.toBeInTheDocument();
        });

        it('should have no accessibility violations with the folder button', async () => {
            const { container } = renderPicker({ allowFolders: true });

            expect(await axe(container)).toHaveNoViolations();
        });
    });
});
