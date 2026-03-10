"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const view_1 = __importDefault(require("@fastify/view"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const handlebars_1 = __importDefault(require("handlebars"));
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const app = (0, fastify_1.default)({ logger: false });
// ─── Plugins ──────────────────────────────────────────────────────────────────
app.register(formbody_1.default);
// ─── Handlebars setup ─────────────────────────────────────────────────────────
app.register(view_1.default, {
    engine: { handlebars: handlebars_1.default },
    root: path_1.default.join(__dirname, "../views"),
    viewExt: "hbs",
});
const orders = [];
const issuedTokens = new Set();
const authCodes = new Map();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateToken() {
    return "mock_pos_" + crypto_1.default.randomBytes(20).toString("hex");
}
function generatePosOrderId() {
    return `POS-ORD-${90000 + Math.floor(Math.random() * 9999)}`;
}
function generateAuthCode() {
    return "code_" + crypto_1.default.randomBytes(16).toString("hex");
}
// Mark new orders as received after 4 seconds (simulates kitchen acknowledgement)
function scheduleAck(posOrderId) {
    setTimeout(() => {
        const o = orders.find((o) => o.posOrderId === posOrderId);
        if (o)
            o.status = "received";
    }, 4000);
}
// ─── OAuth: Authorization screen ─────────────────────────────────────────────
app.get("/oauth/authorize", async (req, reply) => {
    const { redirect_uri, client_id, state, scope } = req.query;
    return reply.view("authorize", {
        redirect_uri,
        client_id: client_id || "orderbridge",
        state: state || "",
        scope: scope || "orders:write orders:read",
    });
});
// OAuth: Handle allow/deny form submission
app.post("/oauth/authorize", async (req, reply) => {
    const { redirect_uri, state, action, client_id } = req.body;
    if (action === "deny") {
        const url = new URL(redirect_uri);
        url.searchParams.set("error", "access_denied");
        if (state)
            url.searchParams.set("state", state);
        return reply.redirect(url.toString());
    }
    const code = generateAuthCode();
    authCodes.set(code, {
        clientId: client_id || "orderbridge",
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min expiry
    });
    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    if (state)
        url.searchParams.set("state", state);
    return reply.redirect(url.toString());
});
// ─── OAuth: Token exchange ────────────────────────────────────────────────────
app.post("/oauth/token", async (req, reply) => {
    const { code } = req.body;
    const entry = authCodes.get(code || "");
    if (!entry || Date.now() > entry.expiresAt) {
        authCodes.delete(code);
        return reply.status(400).send({
            error: "invalid_grant",
            error_description: "Authorization code is invalid or expired",
        });
    }
    authCodes.delete(code);
    const token = generateToken();
    issuedTokens.add(token);
    return reply.send({
        access_token: token,
        token_type: "Bearer",
        expires_in: 86400,
        scope: "orders:write orders:read",
        outlet_id: "OUTLET-001",
        outlet_name: "The Bridge Kitchen",
    });
});
// ─── Orders: Inject ───────────────────────────────────────────────────────────
app.post("/orders", async (req, reply) => {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token || !issuedTokens.has(token)) {
        return reply.status(401).send({
            error: "unauthorized",
            message: "Invalid or missing access token",
        });
    }
    const body = req.body;
    const posOrderId = generatePosOrderId();
    const order = {
        posOrderId,
        sourceOrderId: body.orderId ||
            body.order_id ||
            body.external_delivery_id ||
            body.orderID ||
            body.order_ref ||
            "unknown",
        platform: body.source || "unknown",
        items: (body.items ||
            body.orderItems ||
            body.line_items ||
            body.cart?.items ||
            []).map((i) => ({
            name: i.name || i.item_name || i.itemName || i.product_name || i.title || "Item",
            quantity: i.quantity || i.qty || 1,
            price: i.price || i.unit_price || i.itemPrice || i.sku_price || 0,
        })),
        total: body.total_amount ||
            body.order_total ||
            body.orderValue ||
            body.pricing?.grand_total ||
            body.payment?.charges?.total?.amount / 100 ||
            0,
        customerNote: body.customer_note ||
            body.special_instructions ||
            body.buyerNote ||
            body.dasher_instructions ||
            body.rider_note ||
            null,
        receivedAt: new Date(),
        status: "new",
    };
    orders.unshift(order);
    scheduleAck(posOrderId);
    return reply.status(201).send({
        posOrderId,
        status: "received",
        outlet_id: "OUTLET-001",
        message: "Order queued for kitchen",
        timestamp: new Date().toISOString(),
    });
});
// ─── Orders: Terminal UI ──────────────────────────────────────────────────────
app.get("/orders", async (req, reply) => {
    const todayCount = orders.filter((o) => new Date(o.receivedAt).toDateString() === new Date().toDateString()).length;
    const platformLabel = {
        foodpanda: "🐼 foodpanda",
        ubereats: "🟢 Uber Eats",
        grabfood: "🟩 GrabFood",
        doordash: "🔴 DoorDash",
        grubhub: "🍔 GrubHub",
        mock: "⚙ Mock",
        unknown: "⚙ Unknown",
    };
    const viewOrders = orders.map((o) => ({
        ...o,
        platformLabel: platformLabel[o.platform] || o.platform,
        totalFormatted: Number(o.total).toFixed(2),
        timeFormatted: new Date(o.receivedAt).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        }),
        itemSummary: o.items.slice(0, 2).map((i) => `${i.name} ×${i.quantity}`).join(", ") +
            (o.items.length > 2 ? ` +${o.items.length - 2} more` : ""),
        isNew: o.status === "new",
    }));
    return reply.view("orders", {
        orders: viewOrders,
        todayCount,
        hasOrders: orders.length > 0,
    });
});
// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", async (_req, reply) => {
    return reply.send({
        status: "ok",
        service: "mock-pos-server",
        version: "4.2.1",
        uptime: process.uptime(),
    });
});
// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || "3100");
app.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log(`\n🖨  BridgePOS Mock Server running on http://localhost:${PORT}\n`);
    console.log(`  OAuth authorize : http://localhost:${PORT}/oauth/authorize`);
    console.log(`  OAuth token     : POST http://localhost:${PORT}/oauth/token`);
    console.log(`  Inject order    : POST http://localhost:${PORT}/orders`);
    console.log(`  Orders terminal : http://localhost:${PORT}/orders\n`);
});
