import {
    canEdit,
    databaseRecord,
    isAdmin,
    jsonResponse,
    validatedRecord,
} from "../_shared/access.js";

const SELECT_COLUMNS = "id, record_type, brand_code, brand, state, store_code, store_name, website_provider, asset_type, size, notes";

export async function onRequestGet({ env, data }) {
    if (!env.DB) return jsonResponse({ error: "D1 database binding is missing." }, 503);
    const result = await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM asset_specs`).all();
    return jsonResponse({
        specs: result.results.map(databaseRecord),
        user: { email: data.identity.email, isAdmin: isAdmin(data.identity, env) },
    });
}

export async function onRequestPost({ request, env, data }) {
    const denied = canEdit({ data, env });
    if (denied) return denied;
    if (!env.DB) return jsonResponse({ error: "D1 database binding is missing." }, 503);

    let record;
    try {
        record = validatedRecord(await request.json());
    } catch {
        return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }
    if (!record) return jsonResponse({ error: "A required field is missing or invalid." }, 400);

    const result = await env.DB.prepare(
        "INSERT INTO asset_specs (record_type, brand_code, brand, state, store_code, store_name, website_provider, asset_type, size, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(
        record.recordType,
        record.brandCode,
        record.brand,
        record.state,
        record.storeCode,
        record.store,
        record.provider,
        record.assetType,
        record.size,
        record.notes,
    ).run();
    const created = await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM asset_specs WHERE id = ?`)
        .bind(result.meta.last_row_id)
        .first();
    return jsonResponse({ spec: databaseRecord(created) }, 201);
}