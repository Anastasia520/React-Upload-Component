import { isActive, type UploadItem } from '../../hooks/useUploadQueue';
import { type DroppedFiles } from '../../utils/collectDroppedFiles';

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

// ` from "photos"` when every item comes from the same chosen folder, otherwise nothing.
const describeSource = (items: UploadItem[]): string => {
    const folders = new Set(items.map((item) => item.relativePath?.split('/')[0]));
    const [folder] = folders;
    return folders.size === 1 && folder ? ` from "${folder}"` : '';
};

// The milestones between two snapshots of the queue, as one sentence or several, for the central live region.
// Progress alone says nothing, so the region doesn't chatter while files upload.
export const describeQueueChanges = (previous: UploadItem[], next: UploadItem[]): string => {
    const previousById = new Map(previous.map((item) => [item.id, item]));
    const added = next.filter((item) => !previousById.has(item.id));
    const accepted = added.filter((item) => item.status !== 'rejected');
    const changedTo = (status: UploadItem['status']): UploadItem[] =>
        next.filter((item) => item.status === status && previousById.get(item.id)?.status !== status);
    const becameIdle = previous.some(isActive) && next.length > 0 && !next.some(isActive);
    const source = describeSource(accepted);

    const parts = [
        describeGroup(
            accepted,
            (_, name) => `Uploading ${name}${source}.`,
            (count) => `Uploading ${plural(count, 'file')}${source}.`
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

export type NotAdded = Pick<DroppedFiles, 'skippedFolders' | 'emptyFolders' | 'unreadable'>;

// `"photos"` for one name, `3 folders` for several.
const nameOrCount = (names: string[], word: string): string =>
    names.length === 1 ? `"${names[0]}"` : plural(names.length, word);

// What a drop couldn't add, for the visible note and the live region; nothing when everything was added.
export const describeNotAdded = ({ skippedFolders, emptyFolders, unreadable }: NotAdded): string => {
    const parts: string[] = [];
    if (skippedFolders.length > 0) {
        const verb = skippedFolders.length === 1 ? 'was' : 'were';
        parts.push(`Folders can't be uploaded here, so ${nameOrCount(skippedFolders, 'folder')} ${verb} skipped.`);
    }
    if (emptyFolders.length > 0) {
        const verb = emptyFolders.length === 1 ? 'has' : 'have';
        parts.push(`${nameOrCount(emptyFolders, 'folder')} ${verb} no files to upload.`);
    }
    if (unreadable.length > 0) {
        parts.push(`${nameOrCount(unreadable, 'item')} couldn't be read.`);
    }
    return parts.join(' ');
};
