import { type UploadItem } from '../hooks/useUploadQueue';

// The upload progress as an integer percentage, rounded down so 100 means fully uploaded. A 0-byte file has nothing
// to measure, so it shows 0 until it's done.
export const getProgress = ({ file, loadedBytes, status }: UploadItem): number => {
    if (file.size === 0) {
        return status === 'done' ? 100 : 0;
    }
    // Multiplying first keeps the division exact for whole percentages (29 / 100 * 100 is 28.999…).
    return Math.floor((loadedBytes * 100) / file.size);
};
