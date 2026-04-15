/**
 * middleware/auth.js
 * 
 * JWT-based authentication for admin and student routes.
 * 
 * INSTALL: npm install jsonwebtoken
 * 
 * Add to .env:
 *   JWT_ADMIN_SECRET=your_very_long_random_admin_secret_here_64chars
 *   JWT_STUDENT_SECRET=your_very_long_random_student_secret_here_64chars
 *   JWT_ADMIN_EXPIRES=8h
 *   JWT_STUDENT_EXPIRES=4h
 */

const jwt = require("jsonwebtoken");

// ── Token generators ──────────────────────────────────────────────────────────

/**
 * Issue a signed JWT for admin session.
 * Called once on successful password verify.
 */
const signAdminToken = () => {
  if (!process.env.JWT_ADMIN_SECRET)
    throw new Error("JWT_ADMIN_SECRET not set in .env");
  return jwt.sign(
    { role: "admin", iat: Math.floor(Date.now() / 1000) },
    process.env.JWT_ADMIN_SECRET,
    { expiresIn: process.env.JWT_ADMIN_EXPIRES || "8h" }
  );
};

/**
 * Issue a signed JWT for a student session tied to their registrationId.
 */
const signStudentToken = (registrationId, fullName) => {
  if (!process.env.JWT_STUDENT_SECRET)
    throw new Error("JWT_STUDENT_SECRET not set in .env");
  return jwt.sign(
    { role: "student", registrationId, fullName },
    process.env.JWT_STUDENT_SECRET,
    { expiresIn: process.env.JWT_STUDENT_EXPIRES || "4h" }
  );
};

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * adminAuth — protects all /admin/* routes.
 * Expects:  Authorization: Bearer <adminJWT>
 */
const adminAuth = (req, res, next) => {
  try {
    const header = req.headers["authorization"] || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token)
      return res.status(401).json({ success: false, message: "Admin token required." });

    const payload = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
    if (payload.role !== "admin")
      return res.status(403).json({ success: false, message: "Not an admin token." });

    req.admin = payload;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ success: false, message: "Admin session expired. Please log in again." });
    return res.status(401).json({ success: false, message: "Invalid admin token." });
  }
};

/**
 * studentAuth — protects quiz routes.
 * Expects:  Authorization: Bearer <studentJWT>
 * Also accepts registrationId from token payload so frontend
 * doesn't need to pass it separately.
 */
const studentAuth = (req, res, next) => {
  try {
    const header = req.headers["authorization"] || "";
    const token  = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token)
      return res.status(401).json({ success: false, message: "Student session required. Please register or log in." });

    const payload = jwt.verify(token, process.env.JWT_STUDENT_SECRET);
    if (payload.role !== "student")
      return res.status(403).json({ success: false, message: "Not a student token." });

    // Attach to request so route handlers can use it
    req.student = payload;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError")
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    return res.status(401).json({ success: false, message: "Invalid session token." });
  }
};

module.exports = { signAdminToken, signStudentToken, adminAuth, studentAuth };