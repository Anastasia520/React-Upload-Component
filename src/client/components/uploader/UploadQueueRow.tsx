import { memo, type ReactElement } from 'react';

import { isActive, type UploadItem } from '../../hooks/useUploadQueue';
import { formatBytes } from '../../utils/formatBytes';
import { getProgress } from '../../utils/getProgress';

export type UploadQueueRowProps = {
    item: UploadItem;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
};

const BUTTON_CLASS =
    'min-h-11 min-w-11 rounded border border-line bg-surface px-3 text-sm text-primary hover:bg-surface-hover';

// A native <progress> styled per engine: the track is `line`, the fill `primary`.
const PROGRESS_CLASS = [
    'h-2 w-full appearance-none overflow-hidden rounded bg-line',
    '[&::-webkit-progress-bar]:bg-line [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-value]:bg-primary',
    '[&::-webkit-progress-value]:transition-[width] motion-reduce:[&::-webkit-progress-value]:transition-none',
].join(' ');

const getStatus = (item: UploadItem): { text: string; className: string } => {
    switch (item.status) {
        case 'queued': {
            return { text: 'Waiting', className: 'text-secondary' };
        }
        case 'uploading': {
            return { text: `${getProgress(item)}%`, className: 'text-secondary' };
        }
        case 'done': {
            return { text: 'Uploaded', className: 'text-success' };
        }
        case 'error': {
            return { text: `Failed: ${item.error ?? ''}`, className: 'text-error' };
        }
        case 'cancelled': {
            return { text: 'Cancelled', className: 'text-secondary' };
        }
        case 'rejected': {
            return { text: `Not uploaded: ${item.error ?? ''}`, className: 'text-error' };
        }
    }
};

type Action = { label: string; hiddenText: string; onClick: (id: string) => void };

// The action of the first button: Cancel while active, Retry after a failure or cancel, otherwise Remove.
const getFirstAction = ({ item, onCancel, onRetry, onRemove }: UploadQueueRowProps, canRetry: boolean): Action => {
    const { name } = item.file;
    if (isActive(item)) {
        return { label: 'Cancel', hiddenText: `upload of ${name}`, onClick: onCancel };
    }
    if (canRetry) {
        return { label: 'Retry', hiddenText: `upload of ${name}`, onClick: onRetry };
    }
    return { label: 'Remove', hiddenText: name, onClick: onRemove };
};

const Row = (props: UploadQueueRowProps): ReactElement => {
    const { item, onRemove } = props;
    const { name, size } = item.file;
    const status = getStatus(item);
    const canRetry = item.status === 'error' || item.status === 'cancelled';
    const first = getFirstAction(props, canRetry);

    return (
        <li className="flex flex-col gap-2 py-3">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-primary" title={name}>
                        {name}
                    </p>
                    {item.relativePath && (
                        <p className="truncate text-sm text-secondary" title={item.relativePath}>
                            {item.relativePath}
                        </p>
                    )}
                    <p className="flex flex-wrap gap-x-2 text-sm">
                        <span className="text-secondary">{formatBytes(size)}</span>
                        <span className={`min-w-0 break-words ${status.className}`}>{status.text}</span>
                    </p>
                </div>
                <div className="flex shrink-0 gap-2">
                    {/* The same element in every state, so focus stays on it when Cancel turns into Retry or Remove. */}
                    <button type="button" className={BUTTON_CLASS} onClick={() => first.onClick(item.id)}>
                        {first.label}
                        <span className="sr-only"> {first.hiddenText}</span>
                    </button>
                    {canRetry && (
                        <button type="button" className={BUTTON_CLASS} onClick={() => onRemove(item.id)}>
                            Remove
                            <span className="sr-only"> {name}</span>
                        </button>
                    )}
                </div>
            </div>
            {item.status !== 'rejected' && (
                <progress
                    className={PROGRESS_CLASS}
                    max={100}
                    value={getProgress(item)}
                    aria-label={`Uploading ${name}`}
                />
            )}
        </li>
    );
};

// Memoised, so a progress update re-renders only the rows whose item changed.
export const UploadQueueRow = memo(Row);
