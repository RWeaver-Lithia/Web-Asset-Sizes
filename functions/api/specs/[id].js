import { canEdit, databaseRecord, jsonResponse, validatedRecord } from "../../_shared/access.js";

const SELECT_COLUMNS = "id, record_type, brand_code, brand, state, store_code, store_name, website_provider, asset_type, size, notes";

export async function onRequestPut({ request, env, data, params }) {
    const denied = canEdit({ data, env });
    if (denied) return denied;
    if (!env.DB) return jsonResponse({ error: "D1 database binding is missing." }, 503);

    const id = Number(params.id);
    if (!Number.isSafeInteger(id) || id < 1) return jsonResponse({ error: "Invalid specification ID." }, 400);

    let record;
    try {
        record = validatedRecord(await request.json());
    } catch {
        return jsonResponse({ error: "Request body must be valid JSON." }, 400);
    }
    if (!record) return jsonResponse({ error: "A required field is missing or invalid." }, 400);

    const result = await env.DB.prepare(
        "UPDATE asset_specs SET record_type = ?, brand_code = ?, brand = ?, state = ?, store_code = ?, store_name = ?, website_provider = ?, asset_type = ?, size = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
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
        id,
    ).run();
    if (!result.meta.changes) return jsonResponse({ error: "Specification not found." }, 404);

    const updated = await env.DB.prepare(`SELECT ${SELECT_COLUMNS} FROM asset_specs WHERE id = ?`)
        .bind(id)
        .first();
    return jsonResponse({ spec: databaseRecord(updated) });
}