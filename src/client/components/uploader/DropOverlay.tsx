import { type ReactElement } from 'react';

export type DropOverlayProps = {
    visible: boolean;
    // When false, it covers only its nearest positioned parent instead of the whole window.
    fullWindow?: boolean;
};

// A hint shown while files are dragged over the drop target. It's only visual: it never catches events, so drags
// still reach the target, and it's hidden from assistive technology, whose users use the picker button.
// Always rendered, so it can fade both in and out; `invisible` also keeps its text out of find-in-page while hidden.
export const DropOverlay = ({ visible, fullWindow = true }: DropOverlayProps): ReactElement => (
    <div
        aria-hidden="true"
        className={`pointer-events-none inset-0 z-50 flex bg-surface p-4 transition-[opacity,visibility] motion-reduce:transition-none ${
            fullWindow ? 'fixed' : 'absolute'
        } ${visible ? 'visible opacity-100' : 'invisible opacity-0'}`}
    >
        <div className="flex flex-1 items-center justify-center rounded border-2 border-dashed border-primary p-4">
            <p className="text-center text-lg font-semibold text-primary">Drop files to upload</p>
        </div>
    </div>
);
