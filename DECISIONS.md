# Decisions

The design decisions, known limitations and possible server improvements behind this project, each with its reason
and cost.

## Decisions

### D1. Always use `/api/upload-chunk`, never `/api/upload-single`

-   **Decision:** every file goes through the chunk endpoint. A file smaller than one chunk is sent as one chunk.
-   **Why:** one code path for all sizes, and a small file still needs only one request. `upload-single` also doesn't
    validate the filename (a missing name creates an empty `uploads/undefined`).
-   **Cost:** the server runs its merge step even for one-chunk files, which is negligible.

### D2. XMLHttpRequest instead of `fetch` for uploads

-   **Decision:** chunks are sent with XHR. `fetch` is used where no upload progress is needed (listing files, tests).
-   **Why:** `fetch` doesn't report upload progress; XHR's `upload.onprogress` does, byte by byte.
-   **Cost:** a small `xhrRequest` wrapper that adapts XHR to promises and `AbortSignal`, injected so tests replace it.

### D3. Concurrency budget: 3 files × 2 chunks

-   **Decision:** up to 3 files upload at once, each with up to 2 chunks in flight, so 6 requests at most. Both numbers
    are configurable. The default chunk size is 5 MiB.
-   **Why:** browsers allow about 6 connections per host over HTTP/1.1, so more requests would only wait in the
    browser's queue. Parallel chunks speed up one large file, parallel files speed up bulk uploads.
-   **Cost:** while 6 uploads are running, a list request may wait briefly for a free connection.

### D4. The last chunk is always sent last

-   **Decision:** chunks `0..n-2` upload in parallel. The last-index chunk starts only after all the others succeeded.
-   **Why:** the server merges the file as soon as the last-index chunk arrives. Sending it early would merge a file
    with missing parts.

### D5. Folders are flattened

-   **Decision:** a folder (picked or dropped) uploads every file inside it under its own name, and the UI says that
    the folder structure isn't kept (details in D27).
-   **Why:** the server writes `uploads/<name>` without subdirectories and lists `uploads/` flat. Keeping paths needs a
    server change (S6), which is out of scope on `main`.
-   **Cost:** same-named files from different subfolders overwrite each other (L2).

### D6. Client-side pagination for the file list

-   **Decision:** the list is fetched once and shown 50 rows at a time with Previous/Next.
-   **Why:** the API returns every file at once, so the browser only needs to avoid rendering them all. Pagination is
    simpler and more accessible than a virtualised list.
-   **Cost:** the whole list is still transferred and parsed. The real fix is server-side pagination (S3).

### D7. Optimistic list updates, then one reconcile

-   **Decision:** a finished file is added to the list right away (batched, inserted by binary search into the sorted
    list). When the queue is empty, the list is fetched once from the server.
-   **Why:** refetching after every file would transfer the whole list once per upload, which is costly for bulk
    uploads into a large list.
-   **Cost:** the list can briefly differ from the server, for example while another client uploads (see also L8).

### D8. Progress updates are batched over time

-   **Decision:** progress is buffered and applied every 250 ms for all items together. Status changes apply at once.
-   **Why:** with thousands of queued files, a state update per progress event would re-render far too often.

### D9. One central live region, not per-row live regions

-   **Decision:** a single `aria-live="polite"` region announces milestones: files added, each failure, each cancel and
    the final summary. Progress rows aren't live regions.
-   **Why:** with 3 uploads running, per-row regions would read out percentages non-stop. Screen-reader users can still
    hear a percentage by moving to its progress bar.

### D10. Long names: ellipsis plus a hover hint

-   **Decision:** long names and folder paths are cut off with "…", with the full text in `title` and in the DOM.
-   **Why:** keeps rows tidy at every width, and screen readers still read the whole name.
-   **Cost:** `title` doesn't show on touch or keyboard focus (L5). WAVE reports "Redundant title text" (an alert);
    setting `title` only when the text is actually cut off would need a `ResizeObserver` per row.

### D11. `upload` resolves with the stored file

-   **Decision:** `UploadTransport.upload()` returns a `RemoteFile` (`{ name, size }`), not `void`.
-   **Why:** a GraphQL or presigned-URL backend usually returns its own record (an id, the final name), which the list
    can use directly. The demo API returns only a message, so its adapter builds the record from the file.

### D12. Fondue as a visual reference only

-   **Decision:** a few Fondue colours are copied into theme tokens (D19); `@frontify/fondue` isn't installed.
-   **Why:** the brief asks for our own component, and no new runtime dependencies keeps the bundle small.

### D13. Dev dependency: `vitest-axe`

-   **Decision:** `vitest-axe` `0.1.0`, pinned exactly, runs automated accessibility checks in every component test.
-   **Why:** `0.1.0` is the stable release; newer versions are `1.0.0-pre.x` pre-releases that pull in vitest 3.
-   **Cost:** `src/client/vitest-axe.d.ts` (8 lines) types the matcher for vitest 1, and with no setup file each test
    calls `expect.extend` and `cleanup()` itself. happy-dom can't compute colours, so contrast is checked by hand.

### D14. The concurrency limiter fails fast and leaves cancelling to the caller

-   **Decision:** `runWithLimit` starts nothing after the first rejection and rejects at once; the transport aborts the
    running chunks through the file's `AbortSignal`. An invalid `limit` or `chunkSize` throws a `RangeError`.
-   **Why:** one failed chunk fails the file, so the user sees the error at once, and the limiter stays tiny. A `limit`
    of 0 would otherwise hang forever.
-   **Cost:** sibling requests may stay in flight for a moment until the abort reaches them.

### D15. A cancel always rejects with an `AbortError`

-   **Decision:** when the caller's signal aborts, `upload` and `listFiles` reject with a `DOMException` named
    `AbortError`. Every other failure is an `Error` with a readable message.
-   **Why:** the queue tells a user's cancel ("Cancelled") from a real failure by `error.name`. `listFiles` parses the
    body itself, because `response.json().catch()` would turn an abort into a misleading "bad response" error.

### D16. Upload progress is capped per chunk

-   **Decision:** a file's progress is its finished chunks plus the bytes loaded in flight, each capped at its chunk's
    size.
-   **Why:** XHR's `upload.loaded` counts the whole multipart body, so without the cap a file could briefly exceed 100%.

### D17. The transport is tested against the real server; server specs run one at a time

-   **Decision:** a server spec runs the real transport against the Express app in Node and checks the files byte for
    byte on disk. `test:server` runs every server spec with `--no-file-parallelism`, and CI runs both test suites
    (boilerplate changes). Production code appends chunks exactly as documented, without workarounds for happy-dom.
-   **Why:** only a real server proves the multipart body, the file name and the last-chunk-last merge; happy-dom's
    `FormData` names every `Blob` `"blob"`, so unit tests can only spy on `append`. The specs run one at a time because
    the e2e `beforeAll` empties the shared test upload folders.
-   **Cost:** the spec imports client code into the server TS project, so `tsc -b` would report TS6307 (lint and the
    type checks are clean; nothing runs `tsc -b`).

### D18. The upload queue hook: a status-checked reducer, started from an effect

-   **Decision:** `useUploadQueue` keeps the items in a reducer whose actions apply only from the statuses they expect,
    and a result counts only while its `AbortController` is still the row's current one. One effect starts queued
    files while slots are free, skipping names already uploading (L2). Files failing `accept` or `validate` get a
    `rejected` status.
-   **Why:** the status checks make cancel races, unmounts and retries safe without extra flags. Row ids come from a
    counter because `crypto.randomUUID` fails outside secure contexts, such as `http://<LAN-IP>` on a phone.
-   **Cost:** one more status for consumers; it lets the row offer Remove instead of a useless Retry.

### D19. Brand colours live in one CSS file

-   **Decision:** `src/client/theme.css` holds Fondue's light-theme colours as hex CSS variables, mapped to nine
    semantic Tailwind names (`primary`, `surface`, `line`, `focus`, …). Fondue's semi-transparent `line` (1.77:1) is
    replaced by a solid grey. Every control shares one focus style: a 2px outline with a 2px offset.
-   **Why:** rebranding means editing one small file, without touching components or adding theming props; a dark
    theme would be a second block of values. Text contrast is at least 4.78:1, non-text at least 3.01:1.
-   **Cost:** the focus ring passes only just, and fails on Fondue's dim surface (2.83:1), so the UI uses white
    backgrounds only. Tailwind 3 can't apply opacity modifiers to `var()` colours, so each shade needs its own token.

### D20. Queue rows: one action button that changes, focus to the heading, a quiet summary

-   **Decision:** each memoised row has a labelled `<progress>`, a status text and a first button that is the same
    element in every state (Cancel, then Retry or Remove). Button names start with the visible word (WCAG 2.5.3).
    Removing rows moves focus to the "Uploads" heading. The summary ("3 of 5 uploaded · 1 failed") isn't live.
-   **Why:** React keeps the same DOM node, so focus stays on the button when Cancel turns into Retry. A removed button
    would drop focus to `<body>`. A live summary would chatter alongside the central announcements (D9).
-   **Cost:** Firefox's progress fill jumps instead of sliding (the transition is WebKit-only).

### D21. File picker: real buttons over hidden native inputs

-   **Decision:** "Select files" (or "Select file") and "Select folder" are real `<button>`s that open hidden
    `<input type="file">`s. Each pick resets the input's value, and each input has an `aria-label` matching its button.
-   **Why:** a real button works with keyboard and screen readers and can be styled, while the native input still
    opens the system dialog. Without the reset, picking the same file again fires no change event. The hidden inputs
    aren't reachable, but WAVE flags unlabelled inputs, so they're labelled anyway.
-   **Cost:** the button labels aren't configurable yet (D23).

### D22. Drag and drop: a drag counter and a visual-only overlay

-   **Decision:** `useFileDrop` reacts only to drags carrying files, counts `dragenter`/`dragleave` and prevents the
    browser's default on drop. `DropOverlay` stays mounted, ignores pointer events and is `aria-hidden`.
-   **Why:** enter and leave fire for every element crossed, so a counter keeps the overlay steady. Without
    `preventDefault` the browser would open the file. Keyboard, touch and screen-reader users have the buttons.
-   **Cost:** the solid overlay hides the page while dragging; a tint would need another colour token.

### D23. The uploader: one wrapper, announcements derived from the queue, no `labels`

-   **Decision:** `FileUploader` combines picker, queue, overlay and live region, and reuses the queue hook's options
    type. `dropTarget` is `'self'` by default. A pure `describeQueueChanges(previous, next)` derives every
    announcement. An empty queue returns focus to the picker, and a leave-page warning runs while files upload.
-   **Why:** deriving messages from the items covers every source without wiring each handler, stays silent on
    progress, and keeps the wording in one testable function. `'self'` is the safe default for embedding. A `labels`
    prop covering only some strings would look configurable without being so (a `// TODO:` marks it).
-   **Cost:** with `'self'`, a drop that misses the uploader opens the file. Quick successive failures replace each
    other in the region, so a screen reader may read only the latest.

### D24. The upload page

-   **Decision:** `App.tsx` replaces the boilerplate hero with a plain white page: an `h1`, the uploader with
    `dropTarget="window"`, and the file list. `main.tsx` creates the transport once and passes it to `App`.
-   **Why:** white keeps the focus ring visible (D19). Passing the transport in keeps `App` testable with a fake.

### D25. Remote files: sorted on the client, batched upserts, the latest request wins

-   **Decision:** `useRemoteFiles` aborts the request in flight on `refresh` and unmount, and ignores aborted results.
    Responses are sorted with a numeric `Intl.Collator` (`file2` before `file10`), with code-point order as the tie
    break so only identical names compare equal. `upsert` batches additions every 250 ms.
-   **Why:** the server returns unsorted `readdir` order, and client sorting is the only way optimistic inserts and the
    server's list agree. Without batching, a burst of uploads into a 100k list would copy it once per file.
-   **Cost:** sorting 100k unordered names takes up to about 280 ms per fetch.

### D26. The file list: rows stay during refreshes, `aria-disabled` pagination

-   **Decision:** `FileList` shows a heading with the count, then loading, empty, error ("Try again") or the rows, which
    stay visible during refreshes. Previous/Next use `aria-disabled`, and "Page X of Y" is a polite live region.
-   **Why:** keeping rows avoids a "Loading files…" flash after every batch. A natively disabled button loses focus.
    Focus stays on the button when paging, so the live page text tells screen-reader users where they are.
-   **Cost:** a new upload doesn't jump the list to its page; the queue row already confirms it.

### D27. Folders: read on drop, flattened, hidden files left out, partial reads reported

-   **Decision:** `allowFolders` (default `true`) adds "Select folder" (shown only where `webkitdirectory` exists) and
    reads dropped folders recursively. Hidden and system files inside folders (`.DS_Store`, `.git`) are left out.
    Empty, unreadable or skipped folders get a visible, announced note. Rows show each file's relative path.
-   **Why:** reading can fail per entry, so a partial result with a note beats all or nothing. Finder hides dotfiles,
    and skipping `.git` avoids thousands of entries. The path is display-only for now (D5) and ready for S6.
-   **Cost:** see L9. No duplicate-name warning: it would suggest overwrites are detected in general (L2).

### D28. Stress test: seed and cleanup scripts, Vite stops watching the upload folders

-   **Decision:** `npm run seed -- <count>` writes `seed-000001.txt` … (0–99 B) into `uploads/`, `npm run seed:clean`
    removes only names matching `^seed-\d{6}\.txt$`, and Vite ignores the upload folders (boilerplate change).
-   **Why:** the strict pattern leaves real uploads alone without a manifest that could go stale. Vite's watcher kept
    the dev server at 186% CPU and 1.7 GB with 100k files, and delayed the first list request to 213 s.
-   **Measurements** (MacBook, Docker Desktop bind mount, dev server):

    | Files   | Seed   | `GET /api/files` | Payload | Browser (longest task)      |
    | ------- | ------ | ---------------- | ------- | --------------------------- |
    | 10,000  | 2.3 s  | 0.7–1.1 s        | 361 KiB | not measured                |
    | 100,000 | 25.5 s | 11.5 s           | 3.5 MiB | 450 ms load, 50 ms per page |

-   **Findings:** the client copes with 100k files (50 rows render, upserts cost a binary search; browser numbers are
    from React's dev build). The server is the bottleneck: a sequential `stat` per file (L7, L8, S3).

## Known limitations

-   **L1. Orphaned chunk files.** A cancelled or failed upload leaves its `.part_<i>` files in `uploads-chunks/`. The
    API has no way to clean them up (S1).
-   **L2. Same-name overwrite.** A file whose name already exists replaces it silently, also from flattened folders.
    The client waits for a same-named upload to finish before starting the next, because chunks are keyed by name.
-   **L3. The merge may not be finished when the response arrives.** `mergeChunks` doesn't await the write stream, so a
    size listed right after an upload can be too small. The reconcile (D7) usually corrects it (S4).
-   **L4. Very long names fail.** Chunks are stored as `<name>.part_<i>`, so names near the 255-byte limit fail even
    though the merged name would fit.
-   **L5. The hover hint isn't available everywhere.** `title` doesn't appear on touch devices or on keyboard focus.
-   **L6. No resumable uploads.** A failed file restarts from the first chunk (S2).
-   **L7. The list endpoint returns everything at once,** with a sequential `stat` per file: about 11.5 s and 3.5 MiB at
    100k files. The page stays responsive, but "Loading files…" shows that long (D28, S3).
-   **L8. A refresh can briefly drop a fresh upload.** A file finishing while a reconcile is in flight may be missing
    from its response, which replaces the list; the next reconcile brings it back. At 100k files that window is ~12 s.
-   **L9. Folder edge cases.** An empty folder chosen with the picker does nothing and gets no note. Hidden files inside
    folders are left out silently. Some mobile browsers expose `webkitdirectory` without supporting it. Large folders
    are read in full before anything is added, with no progress. With `accept`, non-matching files from a dropped
    folder become rejected rows.
-   **L10. Seed cleanup matches by name.** `npm run seed:clean` also deletes a real upload named `seed-NNNNNN.txt`.

## Possible server improvements (out of scope for `main`)

-   **S1. Chunk garbage collection:** a periodic cleanup of old parts, or an endpoint the client calls on cancel.
-   **S2. Server-assigned upload ids:** chunks keyed by id instead of name, which removes name collisions and allows
    resumable uploads.
-   **S3. Paginated listing** (`?offset&limit` or a cursor) without a `stat` per file, on a `server-side-pagination`
    branch: one page instead of 11.5 s and 3.5 MiB, and server-side sorting instead of the client's. Even parallel
    `stat` calls would likely help a lot.
-   **S4. Await the merge:** wait for the write stream's `finish` before responding.
-   **S5. Validate the filename in `upload-single`,** as `upload-chunk` already does.
-   **S6. Folder support:** sanitised relative paths, subdirectories and recursive listing.
-   **S7. The `modernise-deps` branch:** stable multer 2.x instead of the pinned `2.0.0-rc.4`, the major upgrades
    `npm audit` asks for, and Node 22/24.

## Manual checks

-   **Devices and DevTools:** 320px reflow with long names and paths, 44px targets, reduced motion, the overlay, folder
    drops in Chrome, Safari and Firefox, the folder button on a phone, a throttled upload with cancel, and the list
    error with "Try again". No problems found.
-   **Keyboard and WAVE:** keyboard only in Chrome (tab order, visible focus, picker, Cancel → Retry, focus after
    removals, pagination). WAVE's two "Missing form label" errors were fixed (D21); "Redundant title text" is kept
    (D10).
-   **Not done by hand:** VoiceOver, a 1,000-file selection, and stopping the server mid-upload. The 3-file cap and
    the failure and retry paths are covered by the hook tests.
