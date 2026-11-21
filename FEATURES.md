# Features

This file lists the features I planned before writing any code, how I prioritised them, and why. It's a planning
document: the README describes what was finally built, and `DECISIONS.md` records the decisions and limitations in more
detail.

## Goal

A reusable, accessible React file upload component with its own upload logic, plus a minimal page that uses it against
the provided demo API to upload files and list the ones already stored. The time budget is about half a day, so the
scope is small and the core is polished before anything optional.

## Inspiration: Google Drive

Drive's upload experience is a good reference for bulk uploads. What I adopt, adapt, or leave out:

| Google Drive                                                  | This project                                                                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Several files upload at once while the rest wait              | **Adopt.** At most 3 files at a time, and the whole queue stays visible                                                   |
| A circular progress indicator per file                        | **Adapt.** A linear progress bar per row, because a list with one row per file is easier to scan and suits a simpler page |
| Cancel a single upload, or all of them                        | **Adopt.** Cancel per file and "Cancel all"; a failed or cancelled file can be retried                                    |
| Drop files anywhere on the window, with a full-window overlay | **Adopt.** The overlay makes it obvious that the drop will upload                                                         |
| Upload a folder                                               | **Adapt.** Folder contents upload as individual files, because the API stores files flat. The UI says so                  |
| A warning when leaving the page during uploads                | **Adopt.**                                                                                                                |
| A floating upload panel                                       | **Adapt.** An inline "Uploads" section above the file list, which works better on phones                                  |
| "Replace or keep both" for duplicate names                    | **Leave out.** The API overwrites silently. This is documented as a limitation                                            |

## Design reference: Fondue

Frontify's public design system [Fondue](https://github.com/Frontify/fondue) is the visual reference: colours, radii,
type scale and focus styles become Tailwind theme tokens. It isn't installed as a dependency: the brief asks for our own
component, and a full component library would make the bundle much bigger.

## Features by priority (MoSCoW)

### Must have

-   **Select files** with a "Select files" button that opens the native file picker (multiple files).
-   **Chunked upload** of any file type and size: `Blob.slice`, so a file is never read into memory as a whole, and 0-byte
    files work too.
-   **Upload queue:** one row per file showing the name, size, a progress bar with the percentage, and a status in text
    (Waiting, Uploading, Uploaded, Failed, Cancelled).
-   **Bounded parallelism:** up to 3 files at once with up to 2 chunks each, which stays within the browser's
    6-connections-per-host limit on HTTP/1.1.
-   **Cancel, retry, remove** per file, including cancelling a large file halfway through.
-   **Per-file error messages** taken from the server's response or from the network failure.
-   **File list** of all uploaded files, with loading, empty and error states, updated after uploads.
-   **Pluggable upload logic:** the components talk to small `upload` / `listFiles` interfaces, and only one adapter knows
    the demo API's endpoints. A GraphQL or presigned-URL backend would be another adapter.
-   **Reusable building blocks:** the uploader works without the file list, and the page combines both.
-   **Accessibility, WCAG 2.1 AA:** keyboard operable, visible focus, named progress bars and buttons, announcements for
    important changes, status not shown by colour alone, sufficient contrast, reduced motion respected.
-   **Responsive:** the uploader and the list both work and look good on phones, down to 320px wide.
-   **Meaningful tests:** unit, hook, component and integration tests, plus the upload adapter tested against the real
    server.

### Should have

-   **Drag and drop anywhere on the window** with a clear overlay.
-   **Pagination** of the file list, so it stays usable with tens of thousands of files.
-   **Long file names** shortened with "…", with the full name as a hover hint.
-   **Restrictions for other contexts:** an allowed file types option, a single-file mode and a custom validation
    callback, also enforced for dropped files.
-   **Queue summary** ("Uploading 3 of 12 · 2 failed"), with "Cancel all" and "Clear finished".
-   **Leave-page warning** while uploads are running.
-   **Fondue-inspired styling** through Tailwind tokens.

### Could have (only if time allows)

-   **Folder upload** (picker and drop), flattened to individual files.
-   **Stress test:** a script that creates 10,000–100,000 dummy files, to check that the list stays responsive.
-   **Browser end-to-end tests** with Playwright, including an automated accessibility scan in a real browser.
-   **Server-side pagination** on a separate `server-side-pagination` branch.

### Won't have (this time)

-   Keeping the folder structure: the API stores files flat, so this needs a server change.
-   Resumable uploads and automatic retries with backoff.
-   A "replace or keep both" choice for duplicate names.
-   Virtualised scrolling for very long lists. Pagination covers it for now.
-   Previews, thumbnails, or deleting, renaming and downloading files: the API has no endpoints for them.
-   Upload libraries (tus, Uppy, react-dropzone): the brief asks for our own logic.
-   Dependency and toolchain upgrades: these go on a separate `modernise-deps` branch.

## UX and accessibility principles

-   Native controls first: real buttons and native file inputs, with drag and drop as an extra on top.
-   Announce milestones, not every progress update: a batch starting, failures, cancels and the final summary.
-   Every status has a text label, not only a colour or an icon.
-   Focus never gets lost, for example when "Cancel" turns into "Retry".
-   Touch targets are at least 44px, and nothing scrolls sideways on a phone.

## Architecture outline

```
transport/   talks to a backend; no React (interfaces + the demo API adapter)
hooks/       state and browser-event logic; no markup (upload queue, drag and drop, remote file list)
components/  markup only (uploader, upload queue rows, file list)
App.tsx      the page that composes them
```

## Delivery order

Each step is one small feature with its tests, so every commit is green:

1. Upload logic: chunk planning, the concurrency limit, the request with progress and cancelling, the API adapter, and
   a test against the real server.
2. Upload queue hook: states, parallelism, cancel, retry, interruptions.
3. UI: design tokens, queue rows, file picker, drop overlay, the composed uploader.
4. File list with pagination, then the page that combines everything.
5. Optional: folders, the stress test, Playwright.
6. README.
