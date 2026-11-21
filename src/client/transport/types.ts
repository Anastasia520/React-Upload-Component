export type RemoteFile = { name: string; size: number };

export type UploadOptions = {
    // Aborting it cancels the upload, which then rejects with a DOMException named `AbortError`.
    signal: AbortSignal;
    onProgress: (loadedBytes: number) => void;
};

// Two small interfaces, so the uploader on its own only needs an UploadTransport.
export interface UploadTransport {
    // Resolves with the stored file. The chunked HTTP transport builds it from the File; a GraphQL or presigned-URL
    // backend would return its own record.
    upload(file: File, options: UploadOptions): Promise<RemoteFile>;
}

export interface FileSource {
    listFiles(signal: AbortSignal): Promise<RemoteFile[]>;
}
