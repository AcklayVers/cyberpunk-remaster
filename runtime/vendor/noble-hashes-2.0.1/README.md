# Vendored @noble/hashes 2.0.1

Unmodified `sha2.js`, `_md.js`, `_u64.js`, `utils.js` and MIT `LICENSE` from the published `@noble/hashes@2.0.1` npm tarball. Optional source maps are not included. The module imports only the SHA-256 implementation for COMM-LINK PIN compatibility when WebCrypto is unavailable. It runs locally without a CDN, additional modules or global Crypto patches.

Upstream: https://github.com/paulmillr/noble-hashes/tree/2.0.1

Package: https://registry.npmjs.org/@noble/hashes/-/hashes-2.0.1.tgz

SHA-256 of original files:

- `sha2.js`: `3ddc587c588283cbceed4dd9929cefcce06a0c231b54d4c6f0f99c478c686c00`
- `_md.js`: `a112f0fe1b15db00f2638618c436a17be1c5e13baf19d02fcc29016ae1db2233`
- `_u64.js`: `e48c0cfc10810439a4807b46db136ce603a3fa09b62584f513ef2f3ca496af54`
- `utils.js`: `11319ec0a8132a0c2ced8c98af33ae9274c001d6baf4f4709c4a6115e031a3c5`
- `LICENSE`: `4f221aee6e072336700c408c68ab3b96a3fc09f6aebe6f48f1bd99e5ef13faec`

Compatibility format remains `SHA-256(UTF8("COMM-LINK:" + trimmedPIN))`, lowercase hexadecimal. Existing PINs are neither migrated nor reset. Native WebCrypto remains preferred when available. Profile PIN is a UI lock and does not replace Foundry authentication or document permissions.
