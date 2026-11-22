import { type ReactElement } from 'react';

import { FOLDER_NOTE } from './FilePicker';

export type DropOverlayProps = {
    visible: boolean;
    // When false, it covers only its nearest positioned parent instead of the whole window.
    fullWindow?: boolean;
    // Mentions folders and repeats the note that their structure isn't kept.
    allowFolders?: boolean;
};

// A hint shown while files are dragged over the drop target. It's only visual: it never catches events, so drags
// still reach the target, and it's hidden from assistive technology, whose users use the picker button.
// Always rendered, so it can fade both in and out; `invisible` also keeps its text out of find-in-page while hidden.
export const DropOverlay = ({ visible, fullWindow = true, allowFolders = false }: DropOverlayProps): ReactElement => (
    <div
        aria-hidden="true"
        className={`pointer-events-none inset-0 z-50 flex bg-surface p-4 transition-[opacity,visibility] motion-reduce:transition-none ${
            fullWindow ? 'fixed' : 'absolute'
        } ${visible ? 'visible opacity-100' : 'invisible opacity-0'}`}
    >
        <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-primary p-4 text-center">
            <p className="text-lg font-semibold text-primary">
                {allowFolders ? 'Drop files or folders to upload' : 'Drop files to upload'}
            </p>
            {allowFolders && <p className="text-sm text-secondary">{FOLDER_NOTE}</p>}
        </div>
    </div>
);
