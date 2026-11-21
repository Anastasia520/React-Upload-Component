import { type ChangeEvent, forwardRef, type ReactElement, useRef } from 'react';

export type FilePickerProps = {
    onFiles: (files: File[]) => void;
    // Passed to the native input, where it only filters the dialog. The upload queue enforces it for every file.
    accept?: string;
    multiple?: boolean;
};

// A real button that opens a hidden native file input. The ref points at the button, so it can be focused.
export const FilePicker = forwardRef<HTMLButtonElement, FilePickerProps>(
    ({ onFiles, accept, multiple = true }, ref): ReactElement => {
        const inputRef = useRef<HTMLInputElement>(null);

        const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
            // Copied first, because resetting the value empties the input's file list.
            const files = [...(event.target.files ?? [])];
            // Without the reset, picking the same file again wouldn't fire another change event.
            event.target.value = '';
            onFiles(files);
        };

        return (
            <>
                <button
                    ref={ref}
                    type="button"
                    className="min-h-11 min-w-11 rounded bg-primary px-3 text-sm text-surface hover:bg-primary-hover"
                    onClick={() => inputRef.current?.click()}
                >
                    {multiple ? 'Select files' : 'Select file'}
                </button>
                {/* `hidden` keeps it out of the tab order and the accessibility tree; click() still opens it. */}
                <input ref={inputRef} type="file" hidden accept={accept} multiple={multiple} onChange={handleChange} />
            </>
        );
    }
);

FilePicker.displayName = 'FilePicker';
