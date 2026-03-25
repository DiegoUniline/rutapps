

## Problem

The ticket PNG has two issues:
1. **Header not centered** — using spaces to center text inside `white-space: pre` doesn't work reliably in HTML rendering because even "monospace" fonts have slight variations in browser rendering
2. **Prices misaligned / jumping lines** — the entire ticket is in a single `<pre>`-style div, and `toLocaleString('es-MX')` produces multi-byte Unicode characters (non-breaking spaces, special comma chars) that break the 32-char column math

## Solution

Split the ticket HTML into two zones as the technical advisor suggested:

1. **Header** — Real HTML with `text-align: center` (no space padding)
2. **Body** — `<pre>` block with monospace font for the product/totals grid

Also fix `fmt()` to use ASCII-only characters (replace locale separators with plain `,` and `.`).

## Changes

### File: `src/lib/ticketHtml.ts`

Rewrite `buildTicketHTML` to:

- **Header section**: Use a `<div style="text-align:center">` with real HTML `<div>` elements for empresa name, RFC, address, phone, email — no space-padding
- **Body section**: Use `<pre style="margin:0;white-space:pre;font:inherit">` containing the monospace-aligned grid for folio, date, client, products, totals
- **ASCII-safe fmt()**: Replace `toLocaleString` with manual formatting: `n.toFixed(2)` + regex for comma thousands separator — guarantees single-byte chars so column math works
- **Font size**: Bump to `font-size:20px` for readability on thermal prints
- Keep the same `pad()`, `wrapText()` helpers but only use them inside the `<pre>` block
- Container: `width:380px; background:#fff; color:#000; font-family:'Courier New',monospace; font-size:20px; line-height:1.2`

### No other files changed

The `handlePrintTicket` fallback flow and `getTicketData()` mapping are correct — `total` maps properly from `venta.total ?? 0`.

