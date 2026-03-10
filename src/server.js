"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fastify_1 = require("fastify");
var view_1 = require("@fastify/view");
var formbody_1 = require("@fastify/formbody");
var handlebars_1 = require("handlebars");
var crypto_1 = require("crypto");
var path_1 = require("path");
var app = (0, fastify_1.default)({ logger: false });
// ─── Plugins ──────────────────────────────────────────────────────────────────
app.register(formbody_1.default);
// ─── Handlebars setup ─────────────────────────────────────────────────────────
app.register(view_1.default, {
    engine: { handlebars: handlebars_1.default },
    root: path_1.default.join(__dirname, "../views"),
    viewExt: "hbs",
});
var orders = [];
var issuedTokens = new Set();
var authCodes = new Map();
// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateToken() {
    return "mock_pos_" + crypto_1.default.randomBytes(20).toString("hex");
}
function generatePosOrderId() {
    return "POS-ORD-".concat(90000 + Math.floor(Math.random() * 9999));
}
function generateAuthCode() {
    return "code_" + crypto_1.default.randomBytes(16).toString("hex");
}
// Mark new orders as received after 4 seconds (simulates kitchen acknowledgement)
function scheduleAck(posOrderId) {
    setTimeout(function () {
        var o = orders.find(function (o) { return o.posOrderId === posOrderId; });
        if (o)
            o.status = "received";
    }, 4000);
}
// ─── OAuth: Authorization screen ─────────────────────────────────────────────
app.get("/oauth/authorize", function (req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, redirect_uri, client_id, state, scope;
    return __generator(this, function (_b) {
        _a = req.query, redirect_uri = _a.redirect_uri, client_id = _a.client_id, state = _a.state, scope = _a.scope;
        return [2 /*return*/, reply.view("authorize", {
                redirect_uri: redirect_uri,
                client_id: client_id || "orderbridge",
                state: state || "",
                scope: scope || "orders:write orders:read",
            })];
    });
}); });
// OAuth: Handle allow/deny form submission
app.post("/oauth/authorize", function (req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    var _a, redirect_uri, state, action, client_id, url_1, code, url;
    return __generator(this, function (_b) {
        _a = req.body, redirect_uri = _a.redirect_uri, state = _a.state, action = _a.action, client_id = _a.client_id;
        if (action === "deny") {
            url_1 = new URL(redirect_uri);
            url_1.searchParams.set("error", "access_denied");
            if (state)
                url_1.searchParams.set("state", state);
            return [2 /*return*/, reply.redirect(url_1.toString())];
        }
        code = generateAuthCode();
        authCodes.set(code, {
            clientId: client_id || "orderbridge",
            expiresAt: Date.now() + 10 * 60 * 1000, // 10 min expiry
        });
        url = new URL(redirect_uri);
        url.searchParams.set("code", code);
        if (state)
            url.searchParams.set("state", state);
        return [2 /*return*/, reply.redirect(url.toString())];
    });
}); });
// ─── OAuth: Token exchange ────────────────────────────────────────────────────
app.post("/oauth/token", function (req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    var code, entry, token;
    return __generator(this, function (_a) {
        code = req.body.code;
        entry = authCodes.get(code || "");
        if (!entry || Date.now() > entry.expiresAt) {
            authCodes.delete(code);
            return [2 /*return*/, reply.status(400).send({
                    error: "invalid_grant",
                    error_description: "Authorization code is invalid or expired",
                })];
        }
        authCodes.delete(code);
        token = generateToken();
        issuedTokens.add(token);
        return [2 /*return*/, reply.send({
                access_token: token,
                token_type: "Bearer",
                expires_in: 86400,
                scope: "orders:write orders:read",
                outlet_id: "OUTLET-001",
                outlet_name: "The Bridge Kitchen",
            })];
    });
}); });
// ─── Orders: Inject ───────────────────────────────────────────────────────────
app.post("/orders", function (req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    var authHeader, token, body, posOrderId, order;
    var _a, _b, _c, _d, _e;
    return __generator(this, function (_f) {
        authHeader = req.headers["authorization"] || "";
        token = authHeader.replace("Bearer ", "").trim();
        if (!token || !issuedTokens.has(token)) {
            return [2 /*return*/, reply.status(401).send({
                    error: "unauthorized",
                    message: "Invalid or missing access token",
                })];
        }
        body = req.body;
        posOrderId = generatePosOrderId();
        order = {
            posOrderId: posOrderId,
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
                ((_a = body.cart) === null || _a === void 0 ? void 0 : _a.items) ||
                []).map(function (i) { return ({
                name: i.name || i.item_name || i.itemName || i.product_name || i.title || "Item",
                quantity: i.quantity || i.qty || 1,
                price: i.price || i.unit_price || i.itemPrice || i.sku_price || 0,
            }); }),
            total: body.total_amount ||
                body.order_total ||
                body.orderValue ||
                ((_b = body.pricing) === null || _b === void 0 ? void 0 : _b.grand_total) ||
                ((_e = (_d = (_c = body.payment) === null || _c === void 0 ? void 0 : _c.charges) === null || _d === void 0 ? void 0 : _d.total) === null || _e === void 0 ? void 0 : _e.amount) / 100 ||
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
        return [2 /*return*/, reply.status(201).send({
                posOrderId: posOrderId,
                status: "received",
                outlet_id: "OUTLET-001",
                message: "Order queued for kitchen",
                timestamp: new Date().toISOString(),
            })];
    });
}); });
// ─── Orders: Terminal UI ──────────────────────────────────────────────────────
app.get("/orders", function (req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    var todayCount, platformLabel, viewOrders;
    return __generator(this, function (_a) {
        todayCount = orders.filter(function (o) { return new Date(o.receivedAt).toDateString() === new Date().toDateString(); }).length;
        platformLabel = {
            foodpanda: "🐼 foodpanda",
            ubereats: "🟢 Uber Eats",
            grabfood: "🟩 GrabFood",
            doordash: "🔴 DoorDash",
            grubhub: "🍔 GrubHub",
            mock: "⚙ Mock",
            unknown: "⚙ Unknown",
        };
        viewOrders = orders.map(function (o) { return (__assign(__assign({}, o), { platformLabel: platformLabel[o.platform] || o.platform, totalFormatted: Number(o.total).toFixed(2), timeFormatted: new Date(o.receivedAt).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
            }), itemSummary: o.items.slice(0, 2).map(function (i) { return "".concat(i.name, " \u00D7").concat(i.quantity); }).join(", ") +
                (o.items.length > 2 ? " +".concat(o.items.length - 2, " more") : ""), isNew: o.status === "new" })); });
        return [2 /*return*/, reply.view("orders", {
                orders: viewOrders,
                todayCount: todayCount,
                hasOrders: orders.length > 0,
            })];
    });
}); });
// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", function (_req, reply) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, reply.send({
                status: "ok",
                service: "mock-pos-server",
                version: "4.2.1",
                uptime: process.uptime(),
            })];
    });
}); });
// ─── Start ────────────────────────────────────────────────────────────────────
var PORT = parseInt(process.env.PORT || "3100");
app.listen({ port: PORT, host: "0.0.0.0" }, function (err) {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    console.log("\n\uD83D\uDDA8  BridgePOS Mock Server running on http://localhost:".concat(PORT, "\n"));
    console.log("  OAuth authorize : http://localhost:".concat(PORT, "/oauth/authorize"));
    console.log("  OAuth token     : POST http://localhost:".concat(PORT, "/oauth/token"));
    console.log("  Inject order    : POST http://localhost:".concat(PORT, "/orders"));
    console.log("  Orders terminal : http://localhost:".concat(PORT, "/orders\n"));
});
