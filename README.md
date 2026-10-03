<div align="center">

<img src="https://img.shields.io/badge/DARKNOVA-DEV%20KIT-7c5cfc?style=for-the-badge&labelColor=050508&color=7c5cfc" />

<br /><br />

![JSON](https://img.shields.io/badge/JSON-Format-7c5cfc?style=flat-square&labelColor=050508)
![Hash](https://img.shields.io/badge/SHA--256-WebCrypto-7c5cfc?style=flat-square&labelColor=050508)
![JWT](https://img.shields.io/badge/JWT-Peek-7c5cfc?style=flat-square&labelColor=050508)

<br />

**Tabbed bench: JSON, Base64, SHA-256, JWT payload peek, UUID, color.**

[Live demo](https://nova-devkit.vercel.app) · [Portfolio](https://www.mrdarknova.com)

</div>

---

## Tools

| Tool | What it does |
| --- | --- |
| JSON | Format, minify, sort keys, choose indent, download. Errors report line and column with a pointer. |
| Base64 | Encode and decode text (UTF-8 safe) or files, URL-safe option, forgiving about missing padding. |
| URL | Percent-encode and decode, and break a URL into parts and query parameters. |
| Hash | SHA-1, SHA-256, SHA-384 and SHA-512 of text or a file, optional HMAC, checksum compare. |
| JWT | Decode header and payload, read `exp` / `iat` / `nbf` in plain language, verify HS256/384/512 signatures. |
| Generate | UUID v4, UUID v7, ULID, NanoID-style IDs and passwords from the browser's secure random generator. |
| Timestamp | Unix seconds and milliseconds, ISO 8601, local time and relative time, auto-detected. |
| Regex | Live highlighting, capture groups, named groups, and flags g / i / m / s / u. |
| Color | HEX / RGB / HSL conversion, shades, and WCAG AA / AAA contrast against white and black. |

Everything runs in the tab. Nothing is uploaded and nothing is stored. Decoding a JWT does not verify it unless you supply the secret.

## Shortcuts

- `/` or `Ctrl/Cmd + K` focuses the tool finder; `Enter` opens the first match
- Every tool has a deep link, for example `#jwt` or `#regex`

## Run it

No build step. Serve the folder with any static host (`python3 -m http.server`) and open it. Web Crypto needs `https://` or `localhost`.

MD5 is intentionally absent: the browser's built-in crypto does not provide it.

<div align="center">

**Built by [MR. DARKNOVA](https://www.mrdarknova.com)**

</div>
