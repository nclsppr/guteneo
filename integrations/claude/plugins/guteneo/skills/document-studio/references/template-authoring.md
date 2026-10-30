# Create a Guteneo template from an assistant

The server is authoritative. Read `get_capabilities`, then
`get_template_authoring_guide` before constructing a definition. The live guide
exposes JSON schemas from current validators, bindings, semantic edits, allowed
visual properties and limits. Never assume a tool absent from the connected catalog.

## Start with a complete example

`list_template_examples` exposes letter, demonstration invoice, statement, quote
and delivery-note examples. `get_template_example({exampleId})` returns
`{id,envelope}`. Adapt the envelope and pass `{envelope}` to `create_template`.
The authenticated user owns the private draft until explicit sharing. Reading
an example changes neither the common gallery nor any private resource. Examples
claim no specific tax compliance or business validation.

## Authoring rules

- Use schemaVersion 1, engine pdfme and engineVersion 6.1.13. `basePdf` contains
  dimensions/margins in millimeters. Fonts use points, embedded GuteneoSans and plain text.
- Declare the business object in `inputSchema`, wholly synthetic `sampleData`,
  `sampleDataSynthetic:true` and empty `resources`.
- Use `bindings`: value for fields, table for arrays and sum for totals. Block
  names and schema paths must exist. Column paths are row-relative; conditions are root-relative.
- Do not embed braced variables in visual content; only `{currentPage}` and
  `{totalPages}` counters are allowed. No JavaScript, expressions, SVG, remote fonts/images.
- Money uses integer minor units: 1250 means EUR12.50. Dates use ISO YYYY-MM-DD.
  Postcodes and identifiers remain strings. Required fields need a supplied value
  or valid default. Never invent missing values or exchange rates.
- Dynamic tables use `repeatHead:true` with matching header/binding column counts.
  Inspect the actual PDF for pagination and overlap; JSON validity is not layout proof.

## Executable minimal envelope

Use this body with `create_template` or `POST /api/templates`; it creates only a private draft.

```json
{
  "envelope": {
    "schemaVersion": 1,
    "engine": "pdfme",
    "engineVersion": "6.1.13",
    "name": "My first template",
    "description": "Minimal example with one variable and synthetic data.",
    "locale": "en-GB",
    "definition": {
      "basePdf": {
        "width": 210,
        "height": 297,
        "padding": [22, 20, 20, 20],
        "staticSchema": [
          {
            "name": "header",
            "type": "text",
            "position": {
              "x": 20,
              "y": 10
            },
            "width": 170,
            "height": 6,
            "content": "EXAMPLE COMPANY",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 8,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          },
          {
            "name": "footer",
            "type": "text",
            "position": {
              "x": 20,
              "y": 283
            },
            "width": 170,
            "height": 6,
            "content": "Synthetic data · Page {currentPage} / {totalPages}",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 8,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          }
        ]
      },
      "schemas": [
        [
          {
            "name": "greeting",
            "type": "text",
            "position": {
              "x": 20,
              "y": 35
            },
            "width": 170,
            "height": 15,
            "content": "Hello",
            "readOnly": true,
            "fontName": "GuteneoSans",
            "fontSize": 18,
            "fontColor": "#202827",
            "lineHeight": 1.25,
            "characterSpacing": 0,
            "alignment": "left",
            "verticalAlignment": "top",
            "overflow": "expand"
          }
        ]
      ],
      "pdfmeVersion": "6.1.13"
    },
    "inputSchema": {
      "type": "object",
      "properties": {
        "personName": {
          "type": "string",
          "title": "First name",
          "maxLength": 160
        }
      },
      "required": ["personName"]
    },
    "bindings": [
      {
        "block": "greeting",
        "kind": "value",
        "path": "personName",
        "format": "text",
        "required": true,
        "prefix": "Hello "
      }
    ],
    "sampleData": {
      "personName": "Camille Example"
    },
    "sampleDataSynthetic": true,
    "resources": []
  }
}
```

## Review, publish and share

Keep the returned id/revision. `preview_template({id,expectedRevision,data})`
returns an actual document preview. Read it with available document tools and
correct errors before publication. `update_template` accepts
`{id,change:{expectedRevision,patch}}` or `change.envelope` for full replacement.
The guide includes patchSchema. After REVISION_CONFLICT, reread `get_template`;
never overwrite a concurrent edit or guess an incremented revision.

`publish_template({id,expectedRevision})` freezes a version. `share_template`
remains separate with explicit permissions. Creation, preview, publication and
generation never constitute send approval.

## Delete only on the owner's request

Read `canDelete`, then call `delete_template({id,expectedRevision})`. The template
leaves the workspace library, including shared copies; generated PDFs/history
remain. Another member's edit/publish rights do not confer ownership. Deleting a
copy never removes its gallery base and never constitutes erasure of its PDFs.

## REST equivalents

- `GET /api/templates/authoring-guide`
- `GET /api/templates/examples`
- `GET /api/templates/examples/{exampleId}`
- `POST /api/templates` with `{envelope}`
- `DELETE /api/templates/{id}` with `{expectedRevision}`

Reads require templates:read; creation/edit/deletion require templates:write.
Preview requires generations:write; publication/sharing have separate scopes.
The server always checks membership and resource authority. Direct assistant
authoring requires no internal OpenAI call, extra key or delivery-provider access.
