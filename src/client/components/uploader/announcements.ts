import { isActive, type UploadItem } from '../../hooks/useUploadQueue';

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

// "Uploading "a.txt"." for one item, "Uploading 3 files." for several; nothing for none.
const describeGroup = (
    items: UploadItem[],
    one: (item: UploadItem, name: string) => string,
    several: (count: number) => string
): string => {
    if (items.length === 0) {
        return '';
    }
    return items.length === 1 ? one(items[0], `"${items[0].file.name}"`) : several(items.length);
};

// The milestones between two snapshots of the queue, as one sentence or several, for the central live region.
// Progress alone says nothing, so the region doesn't chatter while files upload.
export const describeQueueChanges = (previous: UploadItem[], next: UploadItem[]): string => {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const added = next.filter((item) => !previousById.has(item.id));
    const changedTo = (status: UploadItem['status']): UploadItem[] =>
        next.filter((item) => item.status === status && previousById.get(item.id)?.status !== status);
    const becameIdle = previous.some(isActive) && next.length > 0 && !next.some(isActive);

    const parts = [
        describeGroup(
            added.filter((item) => item.status !== 'rejected'),
            (_, name) => `Uploading ${name}.`,
            (count) => `Uploading ${plural(count, 'file')}.`
        ),
        describeGroup(
            added.filter((item) => item.status === 'rejected'),
            (item, name) => `${name} not uploaded: ${item.error ?? ''}.`,
            (count) => `${plural(count, 'file')} not uploaded.`
        ),
        describeGroup(
            changedTo('error'),
            (item, name) => `${name} failed: ${item.error ?? ''}.`,
            (count) => `${plural(count, 'upload')} failed.`
        ),
        describeGroup(
            changedTo('cancelled'),
            (_, name) => `Cancelled ${name}.`,
            (count) => `Cancelled ${plural(count, 'upload')}.`
        ),
    ];

    if (becameIdle) {
        // The same counts as the queue's visible summary: rejected files count as failed.
        const done = next.filter((item) => item.status === 'done').length;
        const failed = next.filter((item) => item.status === 'error' || item.status === 'rejected').length;
        parts.push(`Uploads finished: ${done} of ${next.length} uploaded${failed > 0 ? `, ${failed} failed` : ''}.`);
    }

    return parts.filter(Boolean).join(' ');
};

// TODO: (session 11) folders are flattened instead of skipped, and this message goes.
export const describeSkippedFolders = (names: string[]): string => {
    if (names.length === 0) {
        return '';
    }
    const what = names.length === 1 ? `"${names[0]}" was skipped` : `${names.length} folders were skipped`;
    return `Folders can't be uploaded yet, so ${what}.`;
};
