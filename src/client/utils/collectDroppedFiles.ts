import { type FileWithPath } from '../hooks/useUploadQueue';

export type DroppedFiles = {
    // In drop order. `relativePath` ("photos/2024/a.jpg") is set only for files found inside a dropped folder.
    files: FileWithPath[];
    // Dropped folders that weren't read, because folders aren't allowed.
    skippedFolders: string[];
    // Dropped folders with nothing to upload.
    emptyFolders: string[];
    // Paths of folders and files that couldn't be read. Their files are left out; everything else is added.
    unreadable: string[];
};

type Walked = Pick<DroppedFiles, 'files' | 'unreadable'>;

// Windows creates these next to the user's files; macOS's .DS_Store is caught as a hidden file.
const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini']);

// True for hidden (".DS_Store", ".git/…") and system files inside a chosen folder. The first part of the path is the
// folder the user chose, which counts as chosen on purpose, like a hidden file picked directly.
export const isHiddenPath = (relativePath: string): boolean =>
    relativePath
        .split('/')
        .slice(1)
        .some((name) => name.startsWith('.') || SYSTEM_FILES.has(name.toLowerCase()));

const isDirectory = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry => entry.isDirectory;

// The entry's path inside the drop, without the leading slash: "photos/2024/a.jpg".
const pathOf = (entry: FileSystemEntry): string => entry.fullPath.replace(/^\//, '');

const readFile = (entry: FileSystemFileEntry): Promise<File> =>
    new Promise((resolve, reject) => {
        entry.file(resolve, reject);
    });

const readBatch = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((resolve, reject) => {
        reader.readEntries(resolve, reject);
    });

// readEntries returns the entries in batches (about 100 in Chrome), so it's called until a batch comes back empty.
const readEntries = async (directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
    const reader = directory.createReader();
    const entries: FileSystemEntry[] = [];
    for (let batch = await readBatch(reader); batch.length > 0; batch = await readBatch(reader)) {
        entries.push(...batch);
    }
    return entries;
};

// Collects every file under the entry, skipping hidden ones. A failed read leaves out that entry and reports its path.
const walk = async (entry: FileSystemEntry): Promise<Walked> => {
    try {
        if (!isDirectory(entry)) {
            const file = await readFile(entry as FileSystemFileEntry);
            return { files: [{ file, relativePath: pathOf(entry) }], unreadable: [] };
        }
        const entries = await readEntries(entry);
        const walked = await Promise.all(entries.filter((child) => !isHiddenPath(pathOf(child))).map(walk));
        return { files: walked.flatMap((part) => part.files), unreadable: walked.flatMap((part) => part.unreadable) };
    } catch {
        return { files: [], unreadable: [pathOf(entry)] };
    }
};

const NOTHING: DroppedFiles = { files: [], skippedFolders: [], emptyFolders: [], unreadable: [] };

const collectItem = async (
    entry: FileSystemEntry | null,
    file: File | null,
    folders: boolean
): Promise<DroppedFiles> => {
    if (!entry || !isDirectory(entry)) {
        // A file dropped directly is already available, without its entry's async read.
        return { ...NOTHING, files: file ? [{ file }] : [] };
    }
    if (!folders) {
        return { ...NOTHING, skippedFolders: [entry.name] };
    }
    const { files, unreadable } = await walk(entry);
    const isEmpty = files.length === 0 && unreadable.length === 0;
    return { ...NOTHING, files, unreadable, emptyFolders: isEmpty ? [entry.name] : [] };
};

// Collects the files of a drop, flattening dropped folders unless `folders` is false. The items are taken before the
// first await, because the browser empties the DataTransfer once the drop event is over; their entries stay readable.
export const collectDroppedFiles = async (
    transfer: DataTransfer,
    { folders }: { folders: boolean }
): Promise<DroppedFiles> => {
    const items = [...transfer.items]
        .filter((item) => item.kind === 'file')
        .map((item) => ({ entry: item.webkitGetAsEntry(), file: item.getAsFile() }));

    const parts = await Promise.all(items.map(({ entry, file }) => collectItem(entry, file, folders)));
    return {
        files: parts.flatMap((part) => part.files),
        skippedFolders: parts.flatMap((part) => part.skippedFolders),
        emptyFolders: parts.flatMap((part) => part.emptyFolders),
        unreadable: parts.flatMap((part) => part.unreadable),
    };
};
