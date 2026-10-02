# Synthetic datasets

All people, identifiers, addresses and organizations here are fictional test data.
No file is a source of permission to send a communication.

- `clients-articles.xlsx`: two sheets, title rows, a merged title and textual dates.
- `clients-articles.mapping.json`: explicit DMY dates, comma decimals and one-to-many client/items join.
- `clients-reordered.csv`: a reordered layout preserving zero-prefixed postal codes.
- `grouped-200.csv`: 200 line items for one synthetic client; use `id` as group key.

Workbook generation source: `tests/unit/datasets-fixtures.ts`. See
`docs/DATA_IMPORT.md` for limits and proof boundaries.
