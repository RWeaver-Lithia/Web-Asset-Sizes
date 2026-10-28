# Web Asset Sizes

Internal catalog for digital marketing asset requirements across brands, website providers, and stores.

## Local data and build

The source workbook and Word reference are kept at the repository root and are not copied into the deployable site. The importer reads the consolidated `Web Asset Sizes - IRC ONLY` sheet and preserves size values and notes as text.

```sh
python scripts/import_workbook.py
python scripts/build.py
```

The importer writes `data/asset-specs.json` for local read-only preview and `data/seed.sql` for loading the same records into D1. Re-run it after changes to the workbook.

## Cloudflare Pages and D1

1. Create a D1 database named `web-asset-sizes` and connect it to the Pages project with the binding name `DB`.
2. Apply the schema with `npx wrangler d1 execute web-asset-sizes --remote --file=migrations/0001_init.sql`.
3. Generate and load the workbook records with `python scripts/import_workbook.py` and `npx wrangler d1 execute web-asset-sizes --remote --file=data/seed.sql`.
4. Configure the Pages build command as `python scripts/build.py` and the output directory as `dist`.
5. Protect the Pages hostname with a Cloudflare Access application. Set `CF_ACCESS_TEAM_DOMAIN` (for example, `example.cloudflareaccess.com`), `CF_ACCESS_AUD` (the Access application audience tag), and `CF_ACCESS_ADMIN_EMAILS` (comma-separated admin addresses) in the Pages environment.

The Pages middleware validates the signed Access assertion for every request and fails closed if Access settings are missing. The API only permits create/update requests from configured admin email addresses. Add the same D1 binding and Access variables to the Preview environment before testing preview deployments.

## Current behavior

- Search across brand, store, provider, placement, size, and notes.
- Filter by brand, provider, asset type, desktop/mobile, and standard/store-specific scope.
- The D1 API supports catalog reads and admin-only create/update. The create/edit form appears only when the authenticated API identifies the current user as an administrator; the static JSON fallback is read-only.