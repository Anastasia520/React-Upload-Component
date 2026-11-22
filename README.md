# File upload component

A reusable, accessible React file uploader with its own chunked upload logic, a file list, and a page that wires both
to the provided demo API. No upload libraries and no new runtime dependencies.

-   [FEATURES.md](FEATURES.md): the plan, written before any code.
-   [DECISIONS.md](DECISIONS.md): each decision with its reason and cost. **D**, **L** and **S** numbers below refer to
    its decisions, limitations and server improvements.
-   [docs/API.md](docs/API.md): the provided API documentation.

## Run it

Everything runs in Docker, so nothing from the project executes on the host.

```sh
docker compose build
docker compose run --rm app npm ci   # once
docker compose up -d                 # http://127.0.0.1:3000
docker compose down                  # stop
```

With the server running, prefix each command with `docker compose exec app` (when it's stopped, use
`docker compose run --rm app`):

| Command                     | What it does                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run lint`              | ESLint with Frontify's config, including type-aware rules                                |
| `npm run typecheck`         | TypeScript check of the client                                                           |
| `npx vitest run src/client` | Unit, hook, component and page tests in happy-dom (`npm run test:client` for watch mode) |
| `npm run test:server`       | The real transport and the boilerplate e2e spec against the Express server               |
| `npm run build`             | Production bundle in `dist/`                                                             |
| `npm run seed -- 10000`     | Fills `uploads/` with that many dummy files for the stress test                          |
| `npm run seed:clean`        | Removes the dummy files again (every file named `seed-NNNNNN.txt`)                       |

## What's built

-   **Chunked upload** of any type and size in 5 MiB slices, 3 files × 2 chunks in parallel (the browser's 6
    connections per host), the last chunk always last because the server merges when it arrives (D3, D4).
-   **Upload queue** with progress, Cancel / Retry / Remove, Cancel all and Clear finished, and a leave-page warning.
-   **Select files, select a folder, or drop anywhere** on the page. Folders are flattened, and the UI says so (D5).
-   **`accept`, `multiple` and `validate`**, enforced for drops too.
-   **File list** with pagination, updated as each file finishes, then reconciled with one request (D7).
-   **WCAG 2.1 AA** and responsive down to 320px.

## Architecture

Three layers, each with one job. Every file's tests sit next to it (`*.test.ts(x)`).

```
src/client/
├── transport/                   Talks to a backend. No React.
│   ├── types.ts                 UploadTransport, FileSource, RemoteFile: the only contract the UI knows
│   └── chunked-http/            The adapter for the demo API
│       ├── chunkedHttpTransport.ts   chunked upload (last chunk last, D4) and listFiles
│       ├── planChunks.ts        chunk boundaries; a 0-byte file is one empty chunk
│       ├── runWithLimit.ts      a small promise pool for parallel chunks
│       └── xhrRequest.ts        POST with upload progress and abort (fetch can't report upload progress, D2)
├── hooks/                       State and browser events. No markup.
│   ├── useUploadQueue.ts        the queue: 3 files at once, cancel / retry / remove, validation, batched progress (D8)
│   ├── useFileDrop.ts           drag and drop on the window or an element; dropped folders read and flattened
│   └── useRemoteFiles.ts        the stored files: fetch, refresh, batched inserts, stale requests aborted
├── components/                  Markup and Tailwind only.
│   ├── uploader/
│   │   ├── FileUploader.tsx     the complete uploader: picker, queue, drop overlay and one live region
│   │   ├── FilePicker.tsx       "Select files" / "Select folder" buttons over hidden native inputs
│   │   ├── UploadQueue.tsx      heading, summary, Cancel all, Clear finished
│   │   ├── UploadQueueRow.tsx   name, size, progress bar, status, Cancel / Retry / Remove (memoised)
│   │   ├── DropOverlay.tsx      the visual drop target
│   │   └── announcements.ts     screen-reader messages derived from queue changes
│   └── file-list/
│       ├── FileList.tsx         loading, empty and error states, 50 files per page
│       └── Pagination.tsx       Previous, "Page 2 of 25", Next
├── utils/                       pure helpers: formatBytes, getProgress, matchesAccept, upsertSorted, collectDroppedFiles
├── test-utils/                  the fake transport and drag-and-drop helpers shared by the tests
├── theme.css                    brand colours as CSS variables (D19)
├── App.tsx                      the page: uploader and list connected through onUploaded and onIdle (D7)
└── main.tsx                     creates the transport once and renders the page
src/server/scripts/              seed and cleanup scripts for the stress test
```

Only `chunked-http/` knows the endpoints. Everything else depends on two interfaces, so another backend is another
transport passed in `main.tsx`:

```ts
export interface UploadTransport {
    // Resolves with the stored file. Aborting the signal rejects with a DOMException named `AbortError`.
    upload(
        file: File,
        options: { signal: AbortSignal; onProgress: (loadedBytes: number) => void }
    ): Promise<RemoteFile>;
}

export interface FileSource {
    listFiles(signal: AbortSignal): Promise<RemoteFile[]>;
}
```

`FileUploader` needs only an `UploadTransport`, and `FileList` takes plain props (the result of `useRemoteFiles`), so
the uploader works without the list.

**GraphQL** fits the same interfaces without component changes. For example, `upload` would call a mutation that
returns a presigned URL, send the file there with progress, and return the record from a completing mutation, while
`listFiles` would be a query. That's why `upload` resolves with a `RemoteFile` instead of `void`: a server that assigns
its own name or id can feed the list directly (D11).

## Usage

Paths are relative to `src/client/`.

```tsx
// The uploader on its own
const transport = createChunkedHttpTransport(); // once, outside render

<FileUploader transport={transport} accept="image/*" multiple={false}
    validate={(file) => (file.size > 5 * 1024 * 1024 ? 'Larger than 5 MB' : undefined)} />

// Uploader and list together (App.tsx)
const remoteFiles = useRemoteFiles(transport);

<FileUploader transport={transport} dropTarget="window"
    onUploaded={(_item, stored) => remoteFiles.upsert(stored)} onIdle={remoteFiles.refresh} />
<FileList {...remoteFiles} />

// Headless, with your own UI
const { items, add, cancel, retry, remove } = useUploadQueue(transport, { maxConcurrentFiles: 2 });

<input type="file" multiple aria-label="Add files" onChange={(event) => add(event.target.files ?? [])} />
{items.map((item) => <progress key={item.id} value={getProgress(item)} max={100} aria-label={item.file.name} />)}
```

**`FileUploader` props:**

| Prop                 | Default  | Description                                                                          |
| -------------------- | -------- | ------------------------------------------------------------------------------------ |
| `transport`          | required | The `UploadTransport` that uploads the files                                         |
| `dropTarget`         | `'self'` | Where files can be dropped: `'self'` (the uploader) or `'window'` (the whole page)   |
| `allowFolders`       | `true`   | Offers "Select folder" and accepts dropped folders; ignored when `multiple` is false |
| `accept`             |          | Allowed types, like the native `accept` (`'.pdf,image/*'`); also checked for drops   |
| `multiple`           | `true`   | When false, only the first file of each selection is kept                            |
| `validate`           |          | `(file) => string \| undefined`: return a message to reject the file                 |
| `maxConcurrentFiles` | `3`      | Files uploading at the same time                                                     |
| `onUploaded`         |          | `(item, stored) => void`, called after each finished file                            |
| `onIdle`             |          | `() => void`, called when the last queued or uploading file finishes                 |

## Accessibility

-   Native controls: real buttons open hidden file inputs, and each row has a named `<progress>`.
-   One polite live region announces milestones (added, failed, cancelled, finished), not percentages (D9).
-   Focus is never lost: Cancel becomes Retry on the same button, removing rows moves focus to the heading, and an
    empty queue returns it to "Select files".
-   Status is text, not only colour; contrast is checked for every colour token (D19); 44px targets, reduced motion.
-   Drag and drop is an extra; the buttons do everything.

`vitest-axe` runs in every component test. By hand: keyboard only, WAVE, and DevTools for contrast, 320px and reduced
motion. WAVE's "Redundant title text" alert on long names is kept on purpose: `title` is the hover hint for truncated
names (L5).

## Tests

300 client tests and 29 server tests; CI runs lint, typecheck and both suites.

| Layer            | Where                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Units, transport | `utils/`, `transport/chunked-http/` (chunking, limiter, XHR progress, abort, last chunk) |
| Hooks            | `hooks/` (queue states, cap, cancel and retry races, batching) with a fake transport     |
| Components, page | `components/`, `App.test.tsx` (roles, focus, announcements, axe, uploader + list)        |
| Real server      | `src/server/test/`: the real transport against Express, byte for byte on disk (D17)      |

**Manual checks** (Chrome DevTools and real devices): throttled uploads with cancel (Network panel → custom profile at
about 1,000 kbit/s upload), 320px layout, folder drops in Chrome, Safari and Firefox, keyboard only, the list error.
VoiceOver hasn't been checked yet.

## Performance

Memoised rows, batched progress, 50 rows per page. Production build: 164 kB JS (53 kB gzip, mostly React), 10.5 kB
CSS. Stress test with 100,000 seeded files (D28): the server takes 11.5 s for `GET /api/files` (3.5 MiB), while the
browser needs 450 ms for the first render and 50 ms per page change. The server is the bottleneck (S3).

## Boilerplate changes

`git diff 22ebfe0` shows every change since the unchanged import. The server code is unchanged.

| Change                                                  | Why                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Dockerfile`, `docker-compose.yml`                      | Run everything in a container, port on `127.0.0.1` only                       |
| `.gitkeep` in the upload folders, `.gitignore`          | The server and the e2e spec need these folders; fresh clones lacked them      |
| `e2e.spec.ts` in the Node environment                   | happy-dom's `FormData` sent no body multer could parse                        |
| `npm audit fix`, multer pinned to `2.0.0-rc.4`          | Security fixes; the caret range jumped to stable 2.x, which breaks the server |
| CI runs both test suites; `test:server` runs every spec | The test steps were commented out                                             |
| `vitest-axe` (dev dependency)                           | Accessibility checks in tests (D13)                                           |
| `theme.css`, `tailwind.config.ts`, `index.css`          | Colour tokens from Fondue's palette and one focus style (D19)                 |
| `App.tsx`, `main.tsx`, `index.html` title               | The upload page replaces the placeholder                                      |
| `seed` scripts, Vite ignores the upload folders         | Stress test; Vite's watcher choked on 100k files                              |

## Limitations

Corners cut, mostly because the server stays unchanged on `main`.

| Limitation                                                             | Why                                                        | Fix                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Cancelled or failed uploads leave chunk files on the server (L1)       | The API has no way to clean them up                        | A cleanup endpoint or job (S1)     |
| Same-name files overwrite each other, also from different folders (L2) | The server stores files flat, by name                      | Upload ids (S2), folder paths (S6) |
| No resumable uploads; a failed file restarts (L6)                      | Chunks are keyed by file name, not an upload id            | Upload ids (S2)                    |
| The list arrives all at once: 11.5 s at 100,000 files (L7)             | No paging, and one `stat` per file on the server           | Server-side pagination (S3)        |
| Truncated names show in full only on hover (L5)                        | The hint is a `title`, which touch and keyboard don't show | An expandable row or a tooltip     |
| Texts are English only                                                 | No `labels` prop yet (`// TODO:` in `FileUploader.tsx`)    | A `labels` prop or i18n            |
| Contrast, layout and throttling are checked by hand                    | Playwright was skipped for time                            | Next step 1                        |

## Next steps

1. **Playwright e2e tests:** upload then list, a throttled upload cancelled mid-way, a 320px viewport, and an
   axe scan with colour contrast, in a Docker service and CI.
2. **Server-side pagination** on a `server-side-pagination` branch (S3).
3. **Server fixes:** chunk cleanup (S1), upload ids for resumable uploads (S2), the other S items.
4. **Dependency upgrades** on a `modernise-deps` branch (S7), starting with stable multer.
5. **Client:** configurable texts, per-chunk retry, "replace or keep both" for duplicate names.
