# Private original PDF transfer

Keep the person’s explicit permission for the exact file and destination, content
exclusions, host confirmations and network policy. A visible filename, local path,
extracted text or private attachment ID does not establish access to its original
bytes. Reuse an existing authorized Guteneo document when appropriate.

Choose only a transport that the current host actually provides:

1. Preserve a native host file envelope when its exact original is accessible
   through the supported `import_document` contract. Never invent a `file_id` or
   `download_url`, publish a private file or manufacture a public link.
2. If the runtime can read the allowed original and make a permitted binary PUT,
   use `begin_document_upload` with code-computed size/SHA-256 and one stable
   idempotency key. Follow its bounded upload-only grant and reviewed client for
   the unchanged original up to 10 MiB. Keep the capability private. After an
   ambiguous result, read `get_document_upload` with the same upload ID; recover
   a lost begin receipt with the exact same key and metadata. Do not repeat an
   uncertain upload or create another key.
3. When original bytes are available but runtime egress is unavailable,
   `import_inline_pdf`, if exposed, accepts one unchanged original up to 64 KiB.
   Compute canonical base64, size and SHA-256 with code and use one stable key in
   one call. Encoded arguments consume host context. Never chunk, truncate, echo
   or log the encoding, or apply the 10 MiB binary limit to this route. Follow
   the same binary-upload status recovery on its returned upload ID.
4. If `open_mcp_document_upload` is exposed and the host supports MCP Apps, offer
   its private original-file picker. This requires a new explicit selection of
   the original on the person’s device and an Import action; it does not access
   an attachment already in the conversation. The reviewed App computes its
   exact size/SHA-256 and carries bounded parts through the official App-only
   tool bridge, without model-visible bytes or new runtime egress. The assistant
   opens the App only; it never invokes the five App-only upload tools. Wait for
   the App’s actual registered document result. App uploads recover only through
   its Check status controls with the same upload/key, then explicit Resume if
   positively permitted. Do not switch them to `get_document_upload`, inline or
   binary transfer, automatically resend a part, or start a replacement import.

Only the same stored document’s `ready` state permits requested preparation.
Import is not approval, purchase, sending or a delegation mandate. If the host
provides no qualified route, explain its precise missing capability and let the
person choose another journey. Never reconstruct the PDF, bypass network controls
or claim an unavailable `upload_local_pdf` tool. A local fixture, desktop test or
listed tool does not qualify another host, web client or physical iPhone.
