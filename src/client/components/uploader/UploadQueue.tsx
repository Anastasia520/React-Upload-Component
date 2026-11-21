import { type ReactElement, useCallback, useRef } from 'react';

import { isActive, type UploadQueue as UploadQueueState } from '../../hooks/useUploadQueue';

import { UploadQueueRow } from './UploadQueueRow';

export type UploadQueueProps = Pick<
    UploadQueueState,
    'items' | 'cancel' | 'retry' | 'remove' | 'cancelAll' | 'clearFinished'
>;

const BUTTON_CLASS =
    'min-h-11 min-w-11 rounded border border-line bg-surface px-3 text-sm text-primary hover:bg-surface-hover';

// The list of uploads with a summary and bulk actions. Takes the queue hook's result: `<UploadQueue {...queue} />`.
// The summary is deliberately not a live region; the uploader announces milestones in one central region.
export const UploadQueue = ({
    items,
    cancel,
    retry,
    remove,
    cancelAll,
    clearFinished,
}: UploadQueueProps): ReactElement | null => {
    const headingRef = useRef<HTMLHeadingElement>(null);

    // Remove, Cancel all and Clear finished make the focused button disappear, so focus moves to the heading.
    const handleRemove = useCallback(
        (id: string): void => {
            remove(id);
            headingRef.current?.focus();
        },
        [remove]
    );

    const handleCancelAll = (): void => {
        cancelAll();
        headingRef.current?.focus();
    };

    const handleClearFinished = (): void => {
        clearFinished();
        headingRef.current?.focus();
    };

    if (items.length === 0) {
        return null;
    }

    const doneCount = items.filter((item) => item.status === 'done').length;
    const failedCount = items.filter((item) => item.status === 'error' || item.status === 'rejected').length;
    const hasActive = items.some(isActive);
    const hasFinished = items.some((item) => !isActive(item));

    return (
        <section className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-primary">
                        Uploads
                    </h2>
                    <p className="text-sm text-secondary">
                        {`${doneCount} of ${items.length} uploaded`}
                        {failedCount > 0 && ` · ${failedCount} failed`}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {hasActive && (
                        <button type="button" className={BUTTON_CLASS} onClick={handleCancelAll}>
                            Cancel all
                        </button>
                    )}
                    {hasFinished && (
                        <button type="button" className={BUTTON_CLASS} onClick={handleClearFinished}>
                            Clear finished
                        </button>
                    )}
                </div>
            </div>
            {/* eslint-disable-next-line jsx-a11y/no-redundant-roles -- Safari drops list semantics without bullets */}
            <ul role="list" className="divide-y divide-line">
                {items.map((item) => (
                    <UploadQueueRow
                        key={item.id}
                        item={item}
                        onCancel={cancel}
                        onRetry={retry}
                        onRemove={handleRemove}
                    />
                ))}
            </ul>
        </section>
    );
};
