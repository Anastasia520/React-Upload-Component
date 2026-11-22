import { afterAll, beforeAll } from 'vitest';

// A File as a webkitdirectory input returns it: named after the last part of its path, with the whole path in
// `webkitRelativePath`, which happy-dom doesn't implement.
export const fileAt = (path: string, content = 'hello'): File => {
    const file = new File([content], path.split('/').at(-1) ?? path);
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
};

// happy-dom has no `webkitdirectory`, so folder pickers count as unsupported. Call it inside a `describe` to make the
// block's tests run as in a browser that supports them.
export const stubFolderSupport = (): void => {
    beforeAll(() => {
        Object.defineProperty(HTMLInputElement.prototype, 'webkitdirectory', {
            configurable: true,
            writable: true,
            value: false,
        });
    });

    afterAll(() => {
        Reflect.deleteProperty(HTMLInputElement.prototype, 'webkitdirectory');
    });
};
