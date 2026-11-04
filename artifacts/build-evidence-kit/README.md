# Build Evidence Kit

Zero-upload local browser and CLI tool (`cli.mjs`) that computes deterministic SHA-256 manifests over project files while scanning for accidental private data (street addresses, phone numbers, credentials, secret tokens, and non-ASCII title punctuation) without echoing sensitive values.

## Run CLI & tests
```sh
node artifacts/build-evidence-kit/cli.mjs artifacts/grant-bom-workbench
npm test
npm run test:browser
```
