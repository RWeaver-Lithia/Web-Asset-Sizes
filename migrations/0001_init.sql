CREATE TABLE IF NOT EXISTS asset_specs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type TEXT NOT NULL CHECK (record_type IN ('store', 'standard')),
    brand_code TEXT NOT NULL,
    brand TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '',
    store_code TEXT NOT NULL DEFAULT '',
    store_name TEXT NOT NULL DEFAULT '',
    website_provider TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    size TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_asset_specs_brand ON asset_specs (brand);
CREATE INDEX IF NOT EXISTS idx_asset_specs_provider ON asset_specs (website_provider);
CREATE INDEX IF NOT EXISTS idx_asset_specs_asset_type ON asset_specs (asset_type);
CREATE INDEX IF NOT EXISTS idx_asset_specs_record_type ON asset_specs (record_type);