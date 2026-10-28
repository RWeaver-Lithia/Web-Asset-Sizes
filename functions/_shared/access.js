let cachedKeys;
let cachedKeysUntil = 0;

function decodeBase64Url(value) {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonPart(value) {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function teamDomain(env) {
    const configured = String(env.CF_ACCESS_TEAM_DOMAIN || "").trim();
    if (!configured) return "";
    return configured.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function getAccessKeys(domain) {
    if (cachedKeys && cachedKeysUntil > Date.now()) return cachedKeys;
    const response = await fetch(`https://${domain}/cdn-cgi/access/certs`);
    if (!response.ok) throw new Error("Could not load Access signing keys");
    const payload = await response.json();
    cachedKeys = payload.keys || [];
    cachedKeysUntil = Date.now() + 5 * 60 * 1000;
    return cachedKeys;
}

export async function verifyAccessRequest(request, env) {
    const domain = teamDomain(env);
    const audience = String(env.CF_ACCESS_AUD || "").trim();
    if (!domain || !audience) {
        return { error: "Access protection is not configured.", status: 503 };
    }

    const token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) return { error: "Authentication required.", status: 401 };

    try {
        const parts = token.split(".");
        if (parts.length !== 3) throw new Error("Invalid token");
        const header = decodeJsonPart(parts[0]);
        const claims = decodeJsonPart(parts[1]);
        const expectedIssuer = `https://${domain}`;
        const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
        const now = Math.floor(Date.now() / 1000);
        if (header.alg !== "RS256" || claims.iss !== expectedIssuer) throw new Error("Invalid issuer");
        if (!audiences.includes(audience)) throw new Error("Invalid audience");
        if (typeof claims.exp !== "number" || claims.exp < now - 60) throw new Error("Expired token");
        if (typeof claims.nbf === "number" && claims.nbf > now + 60) throw new Error("Token not active");

        const signingKey = (await getAccessKeys(domain)).find((key) => key.kid === header.kid);
        if (!signingKey) throw new Error("Unknown signing key");
        const publicKey = await crypto.subtle.importKey(
            "jwk",
            signingKey,
            { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
            false,
            ["verify"],
        );
        const signedContent = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        const valid = await crypto.subtle.verify(
            { name: "RSASSA-PKCS1-v1_5" },
            publicKey,
            decodeBase64Url(parts[2]),
            signedContent,
        );
        if (!valid || !claims.email || !claims.sub) throw new Error("Invalid signature or identity");
        return { identity: { email: String(claims.email), subject: String(claims.sub) } };
    } catch {
        return { error: "Invalid Access identity.", status: 401 };
    }
}

export function isAdmin(identity, env) {
    const admins = String(env.CF_ACCESS_ADMIN_EMAILS || "")
        .split(",")
        .map((email) => email.trim().toLocaleLowerCase())
        .filter(Boolean);
    return admins.includes(identity.email.toLocaleLowerCase());
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

export function validatedRecord(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const record = {
        recordType: String(payload.recordType || ""),
        brandCode: String(payload.brandCode || "").trim(),
        brand: String(payload.brand || "").trim(),
        state: String(payload.state || "").trim(),
        storeCode: String(payload.storeCode || "").trim(),
        store: String(payload.store || "").trim(),
        provider: String(payload.provider || "").trim(),
        assetType: String(payload.assetType || "").trim(),
        size: String(payload.size || "").trim(),
        notes: String(payload.notes || "").trim(),
    };
    if (!['store', 'standard'].includes(record.recordType)) return null;
    if (!record.brandCode || !record.brand || !record.provider || !record.assetType || !record.size) return null;
    if (record.recordType === "store" && !record.store) return null;
    if (Object.values(record).some((value) => value.length > 2000)) return null;
    return record;
}

export function databaseRecord(row) {
    return {
        id: row.id,
        recordType: row.record_type,
        brandCode: row.brand_code,
        brand: row.brand,
        state: row.state,
        storeCode: row.store_code,
        store: row.store_name,
        provider: row.website_provider,
        assetType: row.asset_type,
        size: row.size,
        notes: row.notes,
    };
}

export function canEdit(context) {
    const identity = context.data.identity;
    if (!isAdmin(identity, context.env)) {
        return jsonResponse({ error: "Administrator access required." }, 403);
    }
    return null;
}