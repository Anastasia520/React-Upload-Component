export type RequestOptions = {
    signal: AbortSignal;
    // Raw bytes sent so far. This counts the whole multipart body, so it can be slightly larger than the file part.
    onProgress: (loadedBytes: number) => void;
};

// POSTs the form data and resolves with the parsed JSON body, or null if there is no body or it isn't JSON.
export type FormDataRequest = (url: string, body: FormData, options: RequestOptions) => Promise<unknown>;

const pickMessage = (body: unknown): string | undefined => {
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }
    const { error, message } = body as { error?: unknown; message?: unknown };
    if (typeof error === 'string' && error) {
        return error;
    }
    if (typeof message === 'string' && message) {
        return message;
    }
    return undefined;
};

// The demo API puts its message in `error` or `message`. HTTP/2 responses have no status text, hence the last fallback.
export const createHttpError = (status: number, statusText: string, body: unknown): Error =>
    new Error(pickMessage(body) ?? (statusText || `Request failed with status ${status}`));

export const createAbortError = (): DOMException => new DOMException('The upload was aborted.', 'AbortError');

// XHR instead of fetch because fetch can't report upload progress.
export const xhrRequest: FormDataRequest = (url, body, { signal, onProgress }) =>
    new Promise<unknown>((resolve, reject) => {
        if (signal.aborted) {
            reject(createAbortError());
            return;
        }

        const xhr = new XMLHttpRequest();
        const abort = (): void => xhr.abort();
        const stopListening = (): void => signal.removeEventListener('abort', abort);

        xhr.upload.onprogress = (event) => onProgress(event.loaded);
        xhr.onload = () => {
            stopListening();
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(createHttpError(xhr.status, xhr.statusText, xhr.response));
            }
        };
        xhr.onerror = () => {
            stopListening();
            reject(new Error('Network error'));
        };
        xhr.onabort = () => {
            stopListening();
            reject(createAbortError());
        };

        signal.addEventListener('abort', abort);
        xhr.open('POST', url);
        xhr.responseType = 'json';
        xhr.send(body);
    });
