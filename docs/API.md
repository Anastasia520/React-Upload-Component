# Provided API

> This is the API documentation from the original boilerplate README, unchanged. One correction: the server implements
> the chunk endpoint as `POST /api/upload-chunk` (singular), not `/api/upload-chunks` as written below. The upload
> component always uses that endpoint, never `upload-single` (see [DECISIONS.md](../DECISIONS.md), D1).

## API

You can find the Express code for the server API under `src/server`. You can use it and/or modify it to your needs.

It provides for you the following endpoints:

### List of files

```http
GET /api/files
```

##### Responses:

- On success:

  `HTTP 200`
  ```json
  {
    "files": [
      {
        "name": "string",
        "size": "number",
      }
    ]
  }
  ```

  Example:
  ```json
  {
    "files": [
      { "name": "file1.jpg", "size": 1024 },
      { "name": "file2.jpg", "size": 2048 }
    ]
  }
  ```

- On unexpected error:

  `HTTP 500`
  ```json
  {
    "message": "string"
  }
  ```

  Example:
  ```json
  { "message": "An error occurred" }
  ```

### Upload a single file

```http
POST /api/upload-single
```

Content-Type: `multipart/form-data`

| Body parameter | Type   | Description                      |
| :------------- | :----- | :------------------------------- |
| `file`         | `file` | **Required**. The file to upload |

##### Responses:

- On success

  `HTTP 200`
  ```json
  { "message": "File uploaded successfully" }
  ```

- On invalid request:

  `HTTP 400`
  ```json
  { "error": "Missing required `file` key in body." }
  ```

- On unexpected error:

  `HTTP 500`
  ```json
  { "error": "Error saving file" }
  ```

### Upload a file in chunks

```http
POST /api/upload-chunks
```

| Body parameter      | Type     | Description                                  |
| :------------------ | :------- | :------------------------------------------- |
| `file`              | `file`   | **Required**. The file to upload             |
| `currentChunkIndex` | `number` | **Required**. The current chunk index number |
| `totalChunks`       | `number` | **Required**. The total number of chunks     |

##### Responses:

- On success

  `HTTP 200`
  ```json
  { "message": "Chunked file uploaded successfully" }
  ```

- On invalid request:

  `HTTP 400`
  ```json
  { "error": "string" }
  ```

    Example:
    ```json
    { "error": "Missing required parameters" }
    ```

- On unexpected error:

  `HTTP 500`
  ```json
  { "error": "Error saving chunk" }
  ```
