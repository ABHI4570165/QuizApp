/**
 * server.js — Production-ready Express server
 *
 * Security features:
 *  - Helmet (HTTP security headers)
 *  - CORS locked to FRONTEND_URL
 *  - Rate limiting per route group
 *  - Body size limits
 *  - Node.js cluster (load balancing)
 *  - Trust proxy for accurate IP rate limiting
 *  - Graceful shutdown
 *
 * INSTALL:
 *   npm install express-rate-limit compression helmet jsonwebtoken express-mongo-sanitize xss-clean hpp
 *
 * .env additions needed:
 *   JWT_ADMIN_SECRET=<64+ random chars>
 *   JWT_STUDENT_SECRET=<64+ random chars>
 *   JWT_ADMIN_EXPIRES=8h
 *   JWT_STUDENT_EXPIRES=4h
 */

require("dotenv").config();

const cluster = require("cluster");
const os      = require("os");

const NUM_WORKERS = process.env.WEB_CONCURRENCY || os.cpus().length;

// ── Cluster Master ────────────────────────────────────────────────────────────
if (cluster.isMaster) {
  console.log(`🚀 Master ${process.pid} spawning ${NUM_WORKERS} workers…`);
  for (let i = 0; i < NUM_WORKERS; i++) cluster.fork();
  cluster.on("exit", (worker, code) => {
    console.warn(`⚠️  Worker ${worker.process.pid} died (${code}). Restarting…`);
    cluster.fork();
  });
  return;
}

// ── Worker ────────────────────────────────────────────────────────────────────
require("dotenv").config(); // workers need their own dotenv load

const express         = require("express");
const mongoose        = require("mongoose");
const cors            = require("cors");
const helmet          = require("helmet");
const compression     = require("compression");
const mongoSanitize   = require("express-mongo-sanitize");
const xssClean        = require("xss-clean");
const hpp             = require("hpp");
const eventRoutes     = require("./routes/eventRegistration");

const app  = express();
const PORT = process.env.PORT || 5001;

// ── Trust proxy (required for rate limiter behind Nginx/ALB) ─────────────────
app.set("trust proxy", 1);

// ── Security Headers (Helmet) ─────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // Adjust if you serve HTML from Express
}));

// ── CORS — locked to frontend URL only ───────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, mobile apps) only in dev
    if (!origin && process.env.NODE_ENV !== "production") return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400, // Cache preflight for 24h
}));

// ── Compression ───────────────────────────────────────────────────────────────
app.use(compression());

// ── Body Parsing — 5MB limit for cert PDF base64 ─────────────────────────────
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// ── NoSQL Injection Prevention ────────────────────────────────────────────────
// Strips $-prefixed keys from req.body, req.params, req.query
app.use(mongoSanitize());

// ── XSS Prevention ────────────────────────────────────────────────────────────
// Sanitizes user input in req.body, req.query, req.params
app.use(xssClean());

// ── HTTP Parameter Pollution Prevention ──────────────────────────────────────
app.use(hpp());

// ── Security Headers (extra) ──────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({ status: "ok", worker: process.pid, uptime: process.uptime() })
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/events", eventRoutes);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" })
);

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== "production";
  console.error("Unhandled error:", isDev ? err : err.message);
  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : "Internal server error",
  });
});

// ── Connect MongoDB + Start ───────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5001,
    socketTimeoutMS: 45000,
  })
  .then(() => {
    console.log(`✅ Worker ${process.pid} — MongoDB connected`);
    app.listen(PORT, () =>
      console.log(`✅ Worker ${process.pid} listening on :${PORT}`)
    );
  })
  .catch(err => {
    console.error("DB connection failed:", err.message);
    process.exit(1);
  });

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`Worker ${process.pid} received ${signal}. Shutting down…`);
  await mongoose.connection.close();
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));