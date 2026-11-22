import { type ReactElement } from 'react';

import { FileList } from './components/file-list/FileList';
import { FileUploader } from './components/uploader/FileUploader';
import { useRemoteFiles } from './hooks/useRemoteFiles';
import { type FileSource, type UploadTransport } from './transport/types';

export type AppProps = {
    // Created once in main.tsx, so tests can pass a fake one. It uploads the files and lists the stored ones.
    transport: UploadTransport & FileSource;
};

// The upload page. White only: the focus ring needs the plain surface for its contrast (see theme.css).
export const App = ({ transport }: AppProps): ReactElement => {
    const remoteFiles = useRemoteFiles(transport);

    return (
        <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8 sm:py-12">
            <h1 className="text-2xl font-semibold text-primary">Upload files</h1>
            {/* Each finished file joins the list at once; one fetch reconciles it when the queue is idle. */}
            <FileUploader
                transport={transport}
                dropTarget="window"
                onUploaded={(_item, stored) => remoteFiles.upsert(stored)}
                onIdle={remoteFiles.refresh}
            />
            <FileList {...remoteFiles} />
        </main>
    );
};
