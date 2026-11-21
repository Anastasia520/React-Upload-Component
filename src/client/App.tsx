import { type ReactElement } from 'react';

import { FileUploader } from './components/uploader/FileUploader';
import { type UploadTransport } from './transport/types';

export type AppProps = {
    // Created once in main.tsx, so tests can pass a fake one.
    transport: UploadTransport;
};

// The upload page. White only: the focus ring needs the plain surface for its contrast (see theme.css).
export const App = ({ transport }: AppProps): ReactElement => (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-semibold text-primary">Upload files</h1>
        <FileUploader transport={transport} dropTarget="window" />
    </main>
);
