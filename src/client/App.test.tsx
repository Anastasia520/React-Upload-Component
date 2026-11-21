import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { App } from './App';
import { drag, filesTransfer } from './test-utils/dragEvents';
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
    });

    it('should upload picked files through the given transport', async () => {
        const { input, transport } = renderApp();

        await userEvent.upload(input, new File(['hello'], 'a.txt'));

        expect(transport.upload).toHaveBeenCalledTimes(1);
        expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('a.txt');
    });

    it('should take files dropped anywhere on the window', () => {
        renderApp();

        drag('dragEnter');
        expect(screen.getByText('Drop files to upload').closest('[aria-hidden]')).toHaveClass('fixed', 'visible');

        drag('drop', filesTransfer([new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]));
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    it('should have no accessibility violations, empty or with uploads', async () => {
        const { container } = renderApp();
        expect(await axe(container)).toHaveNoViolations();

        drag('drop', filesTransfer([new File(['a'], 'a.txt')]));
        expect(await axe(container)).toHaveNoViolations();
    });
});
