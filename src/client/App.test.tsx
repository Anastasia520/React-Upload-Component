import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { App } from './App';
import { drag, dropFiles, filesTransfer, folder } from './test-utils/dragEvents';
import { createFakeTransport } from './test-utils/fakeTransport';
import { addHiddenRule } from './test-utils/hiddenRule';

expect.extend(axeMatchers);

const renderApp = () => {
    const fake = createFakeTransport();
    const view = render(<App transport={fake.transport} />);
    const input = view.container.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) {
        throw new Error('file input not rendered');
    }
    return { ...view, ...fake, input };
};

// Runs the action inside act and lets the promise chains it starts settle: a macrotask runs after every microtask.
const settle = async (action: () => void): Promise<void> => {
    await act(async () => {
        action();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });
};

// The page has two sections, each found through its heading.
const section = (name: string): HTMLElement => {
    const element = screen.getByRole('heading', { level: 2, name }).closest('section');
    if (!element) {
        throw new Error(`No section headed ${name}`);
    }
    return element;
};

const uploads = (): HTMLElement => section('Uploads');
const fileList = (): HTMLElement => section('Files');

describe('App', () => {
    addHiddenRule();

    // Testing Library cleans up automatically only when vitest globals are enabled, which they aren't here.
    afterEach(() => {
        cleanup();
    });

    it('should render the upload page', () => {
        renderApp();

        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: 'Upload files' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Select files' })).toBeInTheDocument();
        expect(within(fileList()).getByText('Loading files…')).toBeInTheDocument();
    });

    it('should upload picked files through the given transport', async () => {
        const { input, transport } = renderApp();

        await userEvent.upload(input, new File(['hello'], 'a.txt'));

        expect(transport.upload).toHaveBeenCalledTimes(1);
        expect(within(uploads()).getAllByRole('listitem')[0]).toHaveTextContent('a.txt');
    });

    it('should take files and folders dropped anywhere on the window', async () => {
        renderApp();

        drag('dragEnter');
        expect(screen.getByText('Drop files or folders to upload').closest('[aria-hidden]')).toHaveClass(
            'fixed',
            'visible'
        );

        await dropFiles(filesTransfer([new File(['a'], 'a.txt'), folder('docs', [new File(['b'], 'b.txt')])]));
        expect(within(uploads()).getAllByRole('listitem')).toHaveLength(2);
    });

    it('should list the stored files from the same transport', async () => {
        const { transport, listCalls } = renderApp();

        await settle(() => {
            listCalls[0].resolve([
                { name: 'b.txt', size: 2048 },
                { name: 'a.txt', size: 5 },
            ]);
        });

        expect(transport.listFiles).toHaveBeenCalledTimes(1);
        const rows = within(fileList()).getAllByRole('listitem');
        expect(rows[0]).toHaveTextContent('a.txt');
        expect(rows[1]).toHaveTextContent('2 KB');
    });

    it('should add an uploaded file to the list before the queue is idle', async () => {
        const { input, transport, listCalls, callsFor } = renderApp();
        await settle(() => {
            listCalls[0].resolve([]);
        });

        await userEvent.upload(input, [new File(['hello'], 'a.txt'), new File(['world!'], 'b.txt')]);
        await settle(() => {
            callsFor('a.txt')[0].resolve();
        });

        expect(within(uploads()).getAllByRole('listitem')[0]).toHaveTextContent('Uploaded');
        expect(await within(fileList()).findByText('a.txt')).toBeInTheDocument();
        // b.txt is still uploading, so no reconcile has started.
        expect(transport.listFiles).toHaveBeenCalledTimes(1);
    });

    it('should refresh the list exactly once when the queue becomes idle', async () => {
        const { input, transport, listCalls, callsFor } = renderApp();
        await settle(() => {
            listCalls[0].resolve([]);
        });

        await userEvent.upload(input, [new File(['a'], 'a.txt'), new File(['b'], 'b.txt'), new File(['c'], 'c.txt')]);
        for (const name of ['b.txt', 'a.txt', 'c.txt']) {
            await settle(() => {
                callsFor(name)[0].resolve();
            });
        }

        expect(transport.listFiles).toHaveBeenCalledTimes(2);

        await settle(() => {
            listCalls[1].resolve([
                { name: 'a.txt', size: 1 },
                { name: 'b.txt', size: 1 },
                { name: 'c.txt', size: 1 },
                { name: 'other.txt', size: 1 },
            ]);
        });
        expect(within(fileList()).getAllByRole('listitem')).toHaveLength(4);
        expect(transport.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should have no accessibility violations, empty or with uploads and files', async () => {
        const { container, listCalls } = renderApp();
        expect(await axe(container)).toHaveNoViolations();

        await settle(() => {
            listCalls[0].resolve([{ name: 'stored.txt', size: 1 }]);
        });
        await dropFiles(filesTransfer([new File(['a'], 'a.txt')]));
        expect(await axe(container)).toHaveNoViolations();
    });
});
