import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { drag, filesTransfer } from '../../test-utils/dragEvents';
import { createFakeTransport } from '../../test-utils/fakeTransport';
import { addHiddenRule } from '../../test-utils/hiddenRule';

import { FileUploader, type FileUploaderProps } from './FileUploader';

expect.extend(axeMatchers);

const file = (name: string, content = 'hello'): File => new File([content], name);

const FOLDER_NOTE = 'Folders can\'t be uploaded yet, so "photos" was skipped.';
// The visible note, not its copy in the live region.
const IGNORE_LIVE_REGION = { ignore: '[role="status"] *' };

const renderUploader = (props: Partial<FileUploaderProps> = {}) => {
    const fake = createFakeTransport();
    const view = render(<FileUploader transport={fake.transport} {...props} />);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
        throw new Error('file input not rendered');
    }
    return { ...view, ...fake, input };
};

const pickerButton = (): HTMLElement => screen.getByRole('button', { name: /^Select file/ });
const rows = (): HTMLElement[] => screen.queryAllByRole('listitem');
const liveRegion = (): HTMLElement => screen.getByRole('status');
const overlay = (): HTMLElement | null => screen.getByText('Drop files to upload').closest('[aria-hidden]');

// Settles the transport's promises inside act, so the queue's state updates are applied.
const settle = async (action: () => void): Promise<void> => {
    await act(async () => {
        action();
        await Promise.resolve();
    });
};

// Fires a beforeunload event and reports whether the page asked the browser to warn about leaving.
const leavingIsWarned = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

describe('FileUploader', () => {
    addHiddenRule();

    afterEach(() => {
        cleanup();
    });

    describe('standalone', () => {
        it('should work with only a transport: a picker, no queue and an empty live region', async () => {
            const { container } = renderUploader();

            expect(pickerButton()).toHaveTextContent('Select files');
            expect(screen.getByText('or drop files here')).toBeInTheDocument();
            expect(screen.queryByRole('list')).not.toBeInTheDocument();
            expect(liveRegion()).toBeEmptyDOMElement();
            expect(await axe(container)).toHaveNoViolations();
        });

        it('should upload picked files and show a row for each', async () => {
            const { input, transport } = renderUploader();

            await userEvent.upload(input, [file('a.txt'), file('b.txt')]);

            expect(rows()).toHaveLength(2);
            expect(rows()[0]).toHaveTextContent('a.txt');
            expect(rows()[1]).toHaveTextContent('b.txt');
            expect(transport.upload).toHaveBeenCalledTimes(2);
        });
    });

    describe('drop target', () => {
        it('should take drops on itself by default, and leave drops elsewhere to the browser', () => {
            renderUploader();

            const outside = drag('drop', filesTransfer([file('outside.txt')]));
            expect(outside.defaultPrevented).toBe(false);
            expect(rows()).toHaveLength(0);

            drag('dragEnter', filesTransfer(), pickerButton());
            expect(overlay()).toHaveClass('absolute', 'visible');

            drag('drop', filesTransfer([file('a.txt')]), pickerButton());
            expect(rows()).toHaveLength(1);
            expect(overlay()).toHaveClass('invisible');
        });

        it('should take drops anywhere on the window when asked to', () => {
            renderUploader({ dropTarget: 'window' });
            expect(screen.getByText('or drop files anywhere on the page')).toBeInTheDocument();

            drag('dragEnter');
            expect(overlay()).toHaveClass('fixed', 'visible');

            const drop = drag('drop', filesTransfer([file('a.txt'), file('b.txt')]));
            expect(drop.defaultPrevented).toBe(true);
            expect(rows()).toHaveLength(2);
            expect(overlay()).toHaveClass('invisible');
        });
    });

    describe('restrictions', () => {
        it('should enforce accept on dropped files', () => {
            const { transport } = renderUploader({ accept: '.png' });

            drag('drop', filesTransfer([file('a.exe')]), pickerButton());

            expect(rows()[0]).toHaveTextContent('Not uploaded: File type not allowed');
            expect(transport.upload).not.toHaveBeenCalled();
        });

        it('should keep only one file when multiple is false', () => {
            renderUploader({ multiple: false });
            expect(pickerButton()).toHaveTextContent('Select file');

            drag('drop', filesTransfer([file('a.txt'), file('b.txt')]), pickerButton());

            expect(rows()).toHaveLength(1);
            expect(rows()[0]).toHaveTextContent('a.txt');
        });

        it('should show the message of a validate rejection', async () => {
            const { input, transport } = renderUploader({
                validate: (candidate) => (candidate.size > 3 ? 'Too big' : undefined),
            });

            await userEvent.upload(input, [file('big.txt', 'hello')]);

            expect(rows()[0]).toHaveTextContent('Not uploaded: Too big');
            expect(transport.upload).not.toHaveBeenCalled();
        });
    });

    it('should pass the concurrency limit and the callbacks on to the queue', async () => {
        const onUploaded = vi.fn();
        const onIdle = vi.fn();
        const { input, transport, calls } = renderUploader({ maxConcurrentFiles: 1, onUploaded, onIdle });

        await userEvent.upload(input, [file('a.txt'), file('b.txt')]);
        expect(transport.upload).toHaveBeenCalledTimes(1);

        await settle(() => calls[0].resolve());
        expect(transport.upload).toHaveBeenCalledTimes(2);
        expect(onUploaded).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }), {
            name: 'a.txt',
            size: 5,
        });
        expect(onIdle).not.toHaveBeenCalled();

        await settle(() => calls[1].resolve());
        expect(onIdle).toHaveBeenCalledTimes(1);
    });

    describe('live announcements', () => {
        it('should announce the start and the summary of a batch', async () => {
            const { input, calls } = renderUploader();

            await userEvent.upload(input, [file('a.txt'), file('b.txt')]);
            expect(liveRegion()).toHaveTextContent('Uploading 2 files.');

            await settle(() => calls[0].resolve());
            await settle(() => calls[1].resolve());
            expect(liveRegion()).toHaveTextContent('Uploads finished: 2 of 2 uploaded.');
        });

        it('should announce a failure', async () => {
            const { input, calls } = renderUploader();

            await userEvent.upload(input, [file('a.txt'), file('b.txt')]);
            await settle(() => calls[0].reject(new Error('Network error')));

            expect(liveRegion()).toHaveTextContent('"a.txt" failed: Network error.');
        });

        it('should announce a cancel', async () => {
            const { input } = renderUploader();

            await userEvent.upload(input, [file('a.txt'), file('b.txt')]);
            await userEvent.click(screen.getByRole('button', { name: 'Cancel upload of a.txt' }));

            expect(liveRegion()).toHaveTextContent('Cancelled "a.txt".');
        });

        it('should announce skipped folders and show the note until files are added again', async () => {
            const { input } = renderUploader();

            drag('drop', filesTransfer([{ folder: 'photos' }]), pickerButton());

            expect(liveRegion()).toHaveTextContent(FOLDER_NOTE);
            expect(screen.getByText(FOLDER_NOTE, IGNORE_LIVE_REGION)).toBeVisible();

            await userEvent.upload(input, [file('a.txt')]);

            expect(screen.queryByText(FOLDER_NOTE, IGNORE_LIVE_REGION)).not.toBeInTheDocument();
        });

        it('should announce the files and the skipped folders of one drop together', () => {
            renderUploader();

            drag('drop', filesTransfer([file('a.txt'), { folder: 'photos' }]), pickerButton());

            expect(liveRegion()).toHaveTextContent(`Uploading "a.txt". ${FOLDER_NOTE}`);
        });

        it('should announce the same message again as a new node', () => {
            renderUploader();

            drag('drop', filesTransfer([{ folder: 'photos' }]), pickerButton());
            const first = liveRegion().firstElementChild;
            drag('drop', filesTransfer([{ folder: 'photos' }]), pickerButton());
            const second = liveRegion().firstElementChild;

            expect(second).toHaveTextContent(FOLDER_NOTE);
            expect(second).not.toBe(first);
        });
    });

    describe('focus', () => {
        it('should move focus to the picker when the last row is removed', async () => {
            const { input, calls } = renderUploader();

            await userEvent.upload(input, [file('a.txt')]);
            await settle(() => calls[0].resolve());
            await userEvent.click(screen.getByRole('button', { name: 'Remove a.txt' }));

            expect(rows()).toHaveLength(0);
            expect(pickerButton()).toHaveFocus();
        });

        it('should move focus to the picker when Clear finished empties the queue', async () => {
            const { input, calls } = renderUploader();

            await userEvent.upload(input, [file('a.txt'), file('b.txt')]);
            await settle(() => calls[0].resolve());
            await settle(() => calls[1].reject(new Error('Network error')));
            await userEvent.click(screen.getByRole('button', { name: 'Clear finished' }));

            expect(rows()).toHaveLength(0);
            expect(pickerButton()).toHaveFocus();
        });

        it('should leave focus on the queue heading after Cancel all, because the rows stay', async () => {
            const { input } = renderUploader();

            await userEvent.upload(input, [file('a.txt')]);
            await userEvent.click(screen.getByRole('button', { name: 'Cancel all' }));

            expect(rows()).toHaveLength(1);
            expect(screen.getByRole('heading', { name: 'Uploads' })).toHaveFocus();
        });
    });

    describe('leave-page warning', () => {
        it('should warn only while files are queued or uploading', async () => {
            const { input, calls } = renderUploader();
            expect(leavingIsWarned()).toBe(false);

            await userEvent.upload(input, [file('a.txt')]);
            expect(leavingIsWarned()).toBe(true);

            await settle(() => calls[0].resolve());
            expect(leavingIsWarned()).toBe(false);
        });

        it('should stop warning when unmounted', async () => {
            const { input, unmount } = renderUploader();

            await userEvent.upload(input, [file('a.txt')]);
            unmount();

            expect(leavingIsWarned()).toBe(false);
        });
    });

    it('should have no accessibility violations with rows and the folder note shown', async () => {
        const { container } = renderUploader({ accept: '.txt' });

        drag('drop', filesTransfer([file('a.txt'), file('b.exe'), { folder: 'photos' }]), pickerButton());

        expect(rows()).toHaveLength(2);
        expect(within(container).getByText(FOLDER_NOTE, IGNORE_LIVE_REGION)).toBeInTheDocument();
        expect(await axe(container)).toHaveNoViolations();
    });
});
