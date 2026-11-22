import { type ChangeEvent, forwardRef, type ReactElement, type ReactNode, useId, useRef } from 'react';

import { isHiddenPath } from '../../utils/collectDroppedFiles';

export const FOLDER_NOTE = "Folder contents are uploaded as individual files; folder structure isn't kept.";

export type FilePickerProps = {
    // A picked folder's files carry their path in `webkitRelativePath`; hidden and system files are left out.
    onFiles: (files: File[]) => void;
    // Passed to the native input, where it only filters the dialog. The upload queue enforces it for every file.
    accept?: string;
    multiple?: boolean;
    // Adds "Select folder" where the browser supports picking folders, unless only one file may be picked.
    allowFolders?: boolean;
    // Shown next to the buttons, such as a drop hint.
    children?: ReactNode;
};

const BUTTON_CLASS = 'min-h-11 min-w-11 rounded px-3 text-sm';

// React has no type for this attribute, but passes it on to the input as written.
const FOLDER_INPUT = { webkitdirectory: '' };

// Mobile browsers such as iOS Safari can't pick folders. Checked on render, so tests can stub the support.
const canPickFolders = (): boolean => 'webkitdirectory' in HTMLInputElement.prototype;

// Copies the input's files and resets it: without the reset, picking the same files again fires no change event.
// The copy comes first, because the reset empties the input's file list.
const takeFiles = (input: HTMLInputElement): File[] => {
    const files = [...(input.files ?? [])];
    input.value = '';
    return files;
};

// Real buttons that open hidden native inputs, for files and, where supported, folders. The ref points at the files
// button, so it can be focused.
export const FilePicker = forwardRef<HTMLButtonElement, FilePickerProps>(
    ({ onFiles, accept, multiple = true, allowFolders = false, children }, ref): ReactElement => {
        const filesInputRef = useRef<HTMLInputElement>(null);
        const folderInputRef = useRef<HTMLInputElement>(null);
        const folderNoteId = useId();
        const showFolders = allowFolders && multiple && canPickFolders();

        const handleFolder = (event: ChangeEvent<HTMLInputElement>): void => {
            onFiles(takeFiles(event.target).filter((file) => !isHiddenPath(file.webkitRelativePath)));
        };

        return (
            <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button
                        ref={ref}
                        type="button"
                        className={`${BUTTON_CLASS} bg-primary text-surface hover:bg-primary-hover`}
                        onClick={() => filesInputRef.current?.click()}
                    >
                        {multiple ? 'Select files' : 'Select file'}
                    </button>
                    {/* `hidden` keeps it out of the tab order and the accessibility tree; click() still opens it. */}
                    <input
                        ref={filesInputRef}
                        type="file"
                        hidden
                        accept={accept}
                        multiple={multiple}
                        onChange={(event) => onFiles(takeFiles(event.target))}
                    />
                    {showFolders && (
                        <>
                            <button
                                type="button"
                                className={`${BUTTON_CLASS} border border-line bg-surface text-primary hover:bg-surface-hover`}
                                aria-describedby={folderNoteId}
                                onClick={() => folderInputRef.current?.click()}
                            >
                                Select folder
                            </button>
                            {/* No `accept`: the queue checks every file of the folder. `multiple` as in MDN's example;
                                browsers return every file anyway, and tools that read it (user-event) then do too. */}
                            <input
                                ref={folderInputRef}
                                type="file"
                                hidden
                                multiple
                                {...FOLDER_INPUT}
                                onChange={handleFolder}
                            />
                        </>
                    )}
                    {children}
                </div>
                {showFolders && (
                    <p id={folderNoteId} className="text-sm text-secondary">
                        {FOLDER_NOTE}
                    </p>
                )}
            </div>
        );
    }
);

FilePicker.displayName = 'FilePicker';
