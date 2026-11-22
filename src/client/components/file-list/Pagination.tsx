import { type ReactElement } from 'react';

export type PaginationProps = {
    // 1-based.
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
};

const BUTTON_CLASS = [
    'min-h-11 min-w-11 rounded border border-line bg-surface px-3 text-sm text-primary hover:bg-surface-hover',
    'aria-disabled:cursor-not-allowed aria-disabled:text-secondary aria-disabled:hover:bg-surface',
].join(' ');

// Previous / Next with the current page in between. The ends use `aria-disabled` instead of `disabled`, because a
// disabled button loses focus: pressing Next onto the last page would drop focus to the page body.
export const Pagination = ({ page, pageCount, onPageChange }: PaginationProps): ReactElement => {
    const isFirst = page <= 1;
    const isLast = page >= pageCount;

    return (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-2">
            <button
                type="button"
                className={BUTTON_CLASS}
                aria-disabled={isFirst || undefined}
                onClick={() => {
                    if (!isFirst) {
                        onPageChange(page - 1);
                    }
                }}
            >
                Previous
                <span className="sr-only"> page</span>
            </button>
            {/* Focus stays on the button, so the new page is announced here. */}
            <p aria-live="polite" className="text-sm text-secondary">
                {`Page ${page} of ${pageCount}`}
            </p>
            <button
                type="button"
                className={BUTTON_CLASS}
                aria-disabled={isLast || undefined}
                onClick={() => {
                    if (!isLast) {
                        onPageChange(page + 1);
                    }
                }}
            >
                Next
                <span className="sr-only"> page</span>
            </button>
        </nav>
    );
};
