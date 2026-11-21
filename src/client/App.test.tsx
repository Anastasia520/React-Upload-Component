import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

import '@testing-library/jest-dom/vitest';
import { App } from './App';

expect.extend(axeMatchers);

describe('App', () => {
    // Testing Library cleans up automatically only when vitest globals are enabled, which they aren't here.
    afterEach(() => {
        cleanup();
    });

    it('should render the component', () => {
        const { getByText } = render(<App />);

        expect(getByText('Hello there')).toBeInTheDocument();
        expect(getByText(/everything brand starts small/i)).toBeInTheDocument();
    });

    it('should have no accessibility violations', async () => {
        const { container } = render(<App />);

        expect(await axe(container)).toHaveNoViolations();
    });
});
