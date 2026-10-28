import { verifyAccessRequest } from "./_shared/access.js";

export async function onRequest(context) {
    const result = await verifyAccessRequest(context.request, context.env);
    if (result.error) {
        return new Response(result.error, {
            status: result.status,
            headers: {
                "Cache-Control": "no-store",
                "Content-Type": "text/plain; charset=utf-8",
                "X-Content-Type-Options": "nosniff",
            },
        });
    }
    context.data.identity = result.identity;
    return context.next();
}