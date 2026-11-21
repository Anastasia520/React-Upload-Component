import { afterAll, beforeAll } from 'vitest';

// Browsers' default stylesheet hides `[hidden]` elements; happy-dom's doesn't. Call it inside a `describe` to add that
// one rule for the block's tests, instead of bending production code around happy-dom.
export const addHiddenRule = (): void => {
    const style = document.createElement('style');
    style.textContent = '[hidden] { display: none; }';

    beforeAll(() => {
        document.head.append(style);
    });

    afterAll(() => {
        style.remove();
    });
};
