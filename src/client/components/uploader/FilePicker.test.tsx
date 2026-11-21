import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { FilePicker, type FilePickerProps } from './FilePicker';

expect.extend(axeMatchers);

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
    // Browsers' default stylesheet hides `[hidden]` elements; happy-dom's doesn't, so the tests add that rule.
    const browserDefaults = document.createElement('style');
    browserDefaults.textContent = '[hidden] { display: none; }';

    beforeAll(() => {
        document.head.append(browserDefaults);
    });

    afterAll(() => {
        browserDefaults.remove();
    });

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

    it('should have no accessibility violations', async () => {
        const { container } = renderPicker({ accept: '.pdf' });

        expect(await axe(container)).toHaveNoViolations();
    });
});
