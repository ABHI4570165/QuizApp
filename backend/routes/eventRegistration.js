/**
 * routes/eventRegistration.js
 * Full security implementation:
 *  - JWT for admin (no raw password in every request)
 *  - JWT for students (session tied to registrationId)
 *  - Per-route rate limiting
 *  - Input sanitization via mongoose-sanitize + xss-clean (applied in server.js)
 *  - Brute-force protection on login routes
 *  - Idempotent quiz submit
 *  - Certificate fraud prevention via unique IDs
 */

const express     = require("express");
const router      = express.Router();
const rateLimit   = require("express-rate-limit");
const EventRegistration = require("../models/EventRegistration");
const QuizConfig        = require("../models/QuizConfig");
const QuizAttempt       = require("../models/QuizAttempt");
const { sendConfirmationEmail, sendQuizCompletionEmail } = require("../utils/emailService");
const { eventRegistrationRules, handleValidationErrors } = require("../middleware/validate");
const { signAdminToken, signStudentToken, adminAuth, studentAuth } = require("../middleware/auth");

// ─── Rate Limiters ────────────────────────────────────────────────────────────

/** Strict limiter for login attempts — prevents brute force */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 10,                      // 10 attempts per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts. Please wait 15 minutes." },
  skipSuccessfulRequests: true, // Only count failed attempts
});

/** Public endpoints — generous for event day concurrency */
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please wait a moment." },
  skip: (req) => {
    const trusted = process.env.TRUSTED_IPS ? process.env.TRUSTED_IPS.split(",") : [];
    return trusted.includes(req.ip);
  },
});

/** Quiz submit — prevent double submissions */
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many submissions. Please wait." },
});

/** Admin routes */
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

// ════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════

// POST /api/events/register
router.post(
  "/register",
  publicLimiter,
  eventRegistrationRules,
  handleValidationErrors,
  async (req, res) => {
    try {
      const { fullName, phone, email, gender, dob, state, district, qualification, address } = req.body;

      const existing = await EventRegistration.findOne({ email: email.toLowerCase().trim() });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered. Use your confirmation code to resume.",
          errors: { email: "Email already registered" },
        });
      }

      const registration = await EventRegistration.create({
        fullName, phone, email, gender, dob, state, district, qualification, address,
      });

      // Issue student JWT immediately on registration
      const token = signStudentToken(registration._id.toString(), registration.fullName);

      let emailSent = false;
      try { emailSent = await sendConfirmationEmail(registration); }
      catch (e) { console.error("Email error:", e.message); }

      console.log(`✅ Registered: ${registration.email} — Code: ${registration.confirmationCode}`);

      return res.status(201).json({
        success: true,
        message: "Registration successful!",
        token,                              // ← Student JWT
        emailSent,
        data: {
          id:               registration._id,
          confirmationCode: registration.confirmationCode,
          fullName:         registration.fullName,
          email:            registration.email,
          phone:            registration.phone,
          gender:           registration.gender,
          dob:              registration.dob,
          state:            registration.state,
          district:         registration.district,
          quizStarted:      registration.quizStarted,
          quizCompleted:    registration.quizCompleted,
        },
      });
    } catch (err) {
      if (err.code === 11000)
        return res.status(409).json({ success: false, message: "This email is already registered." });
      console.error("Registration error:", err);
      return res.status(500).json({ success: false, message: "Server error. Please try again." });
    }
  }
);

// POST /api/events/login — Student resume login
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, confirmationCode } = req.body;
    if (!email || !confirmationCode)
      return res.status(400).json({ success: false, message: "Email and confirmation code required." });

    const reg = await EventRegistration.findOne({
      email:            email.toLowerCase().trim(),
      confirmationCode: confirmationCode.toUpperCase().trim(),
    });

    if (!reg)
      return res.status(401).json({ success: false, message: "Invalid email or confirmation code." });

    // Issue student JWT
    const token = signStudentToken(reg._id.toString(), reg.fullName);

    const completedAttempt = await QuizAttempt.findOne({ registrationId: reg._id, status: "completed" });

    return res.json({
      success: true,
      message: "Login successful.",
      token,                               // ← Student JWT
      data: {
        id:               reg._id,
        confirmationCode: reg.confirmationCode,
        fullName:         reg.fullName,
        email:            reg.email,
        phone:            reg.phone,
        gender:           reg.gender,
        dob:              reg.dob,
        state:            reg.state,
        district:         reg.district,
        quizStarted:      reg.quizStarted,
        quizCompleted:    reg.quizCompleted,
        certificateId:    completedAttempt?.certificateId || null,
      },
    });
  } catch (err) {
    console.error("Student login error:", err);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});

// GET /api/events/quiz-config — public (no auth needed, answers not exposed)
router.get("/quiz-config", publicLimiter, async (req, res) => {
  try {
    const config = await QuizConfig.findOne({ isActive: true }).lean();
    if (!config) return res.status(404).json({ success: false, message: "No active quiz found." });

    return res.json({
      success: true,
      data: {
        passingScore:     config.passingScore,
        timeLimitMinutes: config.timeLimitMinutes,
        totalQuestions:   config.questions.length,
        // correctIndex intentionally excluded from public response
        questions: config.questions.map(({ _id, text, options, marks }) => ({ _id, text, options, marks })),
      },
    });
  } catch (err) {
    console.error("Quiz config error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/quiz/start — requires student JWT
router.post("/quiz/start", publicLimiter, studentAuth, async (req, res) => {
  try {
    const registrationId = req.student.registrationId;

    const reg = await EventRegistration.findById(registrationId);
    if (!reg) return res.status(404).json({ success: false, message: "Registration not found." });

    // Already completed
    const completed = await QuizAttempt.findOne({ registrationId, status: "completed" });
    if (completed) {
      return res.status(409).json({
        success: false,
        alreadyCompleted: true,
        message:          `Quiz already completed. Score: ${completed.score}/${completed.totalQuestions}`,
        score:            completed.score,
        totalQuestions:   completed.totalQuestions,
        passingScore:     completed.passingScore,
        passed:           completed.passed,
        certificateType:  completed.certificateType,
        certificateId:    completed.certificateId,
      });
    }

    // Resume in-progress
    const inProgress = await QuizAttempt.findOne({ registrationId, status: "in-progress" });
    if (inProgress)
      return res.json({ success: true, message: "Resuming.", attemptId: inProgress._id });

    const config = await QuizConfig.findOne({ isActive: true });
    if (!config || !config.questions.length)
      return res.status(404).json({ success: false, message: "No active quiz available." });

    const attempt = await QuizAttempt.create({
      registrationId,
      fullName:       reg.fullName,
      email:          reg.email,
      totalQuestions: config.questions.length,
      passingScore:   config.passingScore,
    });

    await EventRegistration.findByIdAndUpdate(registrationId, { quizStarted: true });
    return res.status(201).json({ success: true, message: "Quiz started.", attemptId: attempt._id });
  } catch (err) {
    console.error("Quiz start error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/quiz/submit — requires student JWT
router.post("/quiz/submit", submitLimiter, studentAuth, async (req, res) => {
  try {
    const { attemptId, answers, timeTakenSeconds, certBase64 } = req.body;
    const registrationId = req.student.registrationId;

    if (!attemptId) return res.status(400).json({ success: false, message: "Attempt ID required." });

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found." });

    // Verify this attempt belongs to the authenticated student
    if (attempt.registrationId.toString() !== registrationId) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    // Idempotent — already submitted
    if (attempt.status === "completed") {
      return res.json({
        success: true,
        message: "Already submitted.",
        data: {
          score:           attempt.score,
          totalQuestions:  attempt.totalQuestions,
          passingScore:    attempt.passingScore,
          passed:          attempt.passed,
          certificateType: attempt.certificateType,
          certificateId:   attempt.certificateId,
          emailSent:       attempt.emailSent,
        },
      });
    }

    const config = await QuizConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ success: false, message: "Quiz config not found." });

    // Score calculation
    let score = 0;
    const processed = [];
    (answers || []).forEach(({ questionIndex, selectedIndex }) => {
      const q = config.questions[questionIndex];
      if (q && selectedIndex === q.correctIndex) score += (q.marks || 1);
      processed.push({ questionIndex, selectedIndex });
    });

    const passed   = score >= config.passingScore;
    const certType = passed ? "achievement" : "participation";

    attempt.answers          = processed;
    attempt.score            = score;
    attempt.passed           = passed;
    attempt.certificateType  = certType;
    attempt.status           = "completed";
    attempt.completedAt      = new Date();
    attempt.timeTakenSeconds = timeTakenSeconds || 0;
    attempt.generateCertificateId();

    if (certBase64) attempt.certPdfBase64 = certBase64;

    await attempt.save();
    await EventRegistration.findByIdAndUpdate(attempt.registrationId, { quizCompleted: true, quizStarted: true });

    let emailSent = false;
    try {
      emailSent = await sendQuizCompletionEmail(attempt, certBase64 || null);
      if (emailSent) { attempt.emailSent = true; await attempt.save(); }
    } catch (e) { console.error("Email error:", e.message); }

    return res.json({
      success: true,
      message: "Quiz submitted!",
      data: {
        score,
        totalQuestions:  attempt.totalQuestions,
        passingScore:    config.passingScore,
        passed,
        certificateType: certType,
        certificateId:   attempt.certificateId,
        emailSent,
      },
    });
  } catch (err) {
    console.error("Quiz submit error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/certificate/:registrationId — requires student JWT
router.get("/certificate/:registrationId", publicLimiter, studentAuth, async (req, res) => {
  try {
    // Verify student can only access their own cert
    if (req.params.registrationId !== req.student.registrationId)
      return res.status(403).json({ success: false, message: "Access denied." });

    const attempt = await QuizAttempt.findOne({
      registrationId: req.params.registrationId,
      status: "completed",
    }).select("+certPdfBase64");

    if (!attempt) return res.status(404).json({ success: false, message: "No completed attempt found." });

    return res.json({
      success: true,
      data: {
        certificateId:   attempt.certificateId,
        certificateType: attempt.certificateType,
        passed:          attempt.passed,
        score:           attempt.score,
        passingScore:    attempt.passingScore,
        totalQuestions:  attempt.totalQuestions,
        completedAt:     attempt.completedAt,
        certPdfBase64:   attempt.certPdfBase64 || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/certificate/verify/:certId — PUBLIC verification (no auth)
router.get("/certificate/verify/:certId", publicLimiter, async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({
      certificateId: req.params.certId.toUpperCase(),
    });
    if (!attempt)
      return res.status(404).json({ success: false, valid: false, message: "Certificate not found or invalid." });

    const reg = await EventRegistration.findById(attempt.registrationId).lean();

    return res.json({
      success: true, valid: true,
      data: {
        certificateId:   attempt.certificateId,
        fullName:        attempt.fullName,
        certificateType: attempt.certificateType,
        passed:          attempt.passed,
        score:           attempt.score,
        totalQuestions:  attempt.totalQuestions,
        completedAt:     attempt.completedAt,
        state:           reg?.state    || "",
        district:        reg?.district || "",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN ROUTES — all protected by JWT adminAuth
// ════════════════════════════════════════════════════════════

// POST /api/events/admin/login — only route that uses raw password
router.post("/admin/login", loginLimiter, async (req, res) => {
  try {
    const password = req.body?.password;
    if (!password)
      return res.status(400).json({ success: false, message: "Password required." });
    if (!process.env.ADMIN_PASSWORD)
      return res.status(500).json({ success: false, message: "ADMIN_PASSWORD not configured." });
    if (password !== process.env.ADMIN_PASSWORD)
      return res.status(401).json({ success: false, message: "Incorrect password." });

    // Issue admin JWT — password never travels again after this
    const token = signAdminToken();
    return res.json({ success: true, message: "Authenticated.", token });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/registrations
router.get("/admin/registrations", adminLimiter, adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "", gender = "", state = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (search) {
      filter.$or = [
        { fullName:         { $regex: search, $options: "i" } },
        { email:            { $regex: search, $options: "i" } },
        { phone:            { $regex: search, $options: "i" } },
        { confirmationCode: { $regex: search, $options: "i" } },
        { district:         { $regex: search, $options: "i" } },
      ];
    }
    if (gender) filter.gender = gender;
    if (state)  filter.state  = state;

    const [registrations, total] = await Promise.all([
      EventRegistration.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      EventRegistration.countDocuments(filter),
    ]);

    const regIds   = registrations.map(r => r._id);
    const attempts = await QuizAttempt.find(
      { registrationId: { $in: regIds }, status: "completed" },
      { registrationId: 1, score: 1, totalQuestions: 1, passed: 1, certificateId: 1, certificateType: 1 }
    ).lean();

    const attemptMap = {};
    attempts.forEach(a => { attemptMap[String(a.registrationId)] = a; });

    const enriched = registrations.map(r => {
      const a = attemptMap[String(r._id)];
      return { ...r, score: a?.score ?? null, totalQuestions: a?.totalQuestions ?? null, passed: a?.passed ?? null, certificateId: a?.certificateId ?? null, certificateType: a?.certificateType ?? null };
    });

    const [stats, quizStartedCount, quizCompletedCount] = await Promise.all([
      EventRegistration.aggregate([{ $group: { _id: null, total: { $sum: 1 }, byGender: { $push: "$gender" }, byState: { $push: "$state" } } }]),
      EventRegistration.countDocuments({ quizStarted: true }),
      EventRegistration.countDocuments({ quizCompleted: true }),
    ]);

    const genderCounts = {}, stateCounts = {};
    if (stats[0]) {
      stats[0].byGender.forEach(g => { genderCounts[g] = (genderCounts[g] || 0) + 1; });
      stats[0].byState.forEach(s  => { stateCounts[s]  = (stateCounts[s]  || 0) + 1; });
    }

    return res.json({
      success: true,
      data: enriched,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: { totalRegistrations: stats[0]?.total || 0, quizStarted: quizStartedCount, quizCompleted: quizCompletedCount, byGender: genderCounts, byState: stateCounts },
    });
  } catch (err) {
    console.error("Admin registrations error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/events/admin/registrations/:id
router.delete("/admin/registrations/:id", adminLimiter, adminAuth, async (req, res) => {
  try {
    const deleted = await EventRegistration.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Not found" });
    await QuizAttempt.deleteMany({ registrationId: req.params.id });
    return res.json({ success: true, message: "Student deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/attempts
router.get("/admin/attempts", adminLimiter, adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 15, search = "", status = "", passed = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (search) filter.$or = [
      { fullName:      { $regex: search, $options: "i" } },
      { email:         { $regex: search, $options: "i" } },
      { certificateId: { $regex: search, $options: "i" } },
    ];
    if (status) filter.status = status;
    if (passed !== "") filter.passed = passed === "true";

    const [attempts, total] = await Promise.all([
      QuizAttempt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      QuizAttempt.countDocuments(filter),
    ]);

    const stats = await QuizAttempt.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, passed: { $sum: { $cond: ["$passed", 1, 0] } }, avgScore: { $avg: "$score" } } },
    ]);

    return res.json({
      success: true,
      data: attempts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: { totalAttempts: stats[0]?.total || 0, passed: stats[0]?.passed || 0, failed: (stats[0]?.total || 0) - (stats[0]?.passed || 0), avgScore: stats[0]?.avgScore ? Math.round(stats[0].avgScore * 10) / 10 : 0 },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/certificate/verify/:certId
router.get("/admin/certificate/verify/:certId", adminLimiter, adminAuth, async (req, res) => {
  try {
    const attempt = await QuizAttempt.findOne({ certificateId: req.params.certId.toUpperCase() });
    if (!attempt) return res.status(404).json({ success: false, valid: false, message: "Certificate not found." });
    const reg = await EventRegistration.findById(attempt.registrationId).lean();
    return res.json({
      success: true, valid: true,
      data: {
        certificateId:    attempt.certificateId,
        fullName:         attempt.fullName,
        email:            attempt.email,
        certificateType:  attempt.certificateType,
        passed:           attempt.passed,
        score:            attempt.score,
        totalQuestions:   attempt.totalQuestions,
        completedAt:      attempt.completedAt,
        timeTakenSeconds: attempt.timeTakenSeconds,
        emailSent:        attempt.emailSent,
        state:            reg?.state         || "",
        district:         reg?.district      || "",
        qualification:    reg?.qualification || "",
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/quiz-config
router.get("/admin/quiz-config", adminLimiter, adminAuth, async (req, res) => {
  try {
    const config = await QuizConfig.findOne({ isActive: true });
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/events/admin/quiz-settings
router.put("/admin/quiz-settings", adminLimiter, adminAuth, async (req, res) => {
  try {
    const { passingScore, timeLimitMinutes } = req.body;
    let config = await QuizConfig.findOne({ isActive: true });
    if (!config) config = new QuizConfig({});
    if (passingScore     !== undefined) config.passingScore     = Number(passingScore);
    if (timeLimitMinutes !== undefined) config.timeLimitMinutes = Number(timeLimitMinutes);
    await config.save();
    return res.json({ success: true, message: "Settings updated.", data: config });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/admin/questions
router.post("/admin/questions", adminLimiter, adminAuth, async (req, res) => {
  try {
    const { text, options, correctIndex, marks } = req.body;
    if (!text || !options || options.length !== 4 || correctIndex === undefined)
      return res.status(400).json({ success: false, message: "text, 4 options, correctIndex required." });
    let config = await QuizConfig.findOne({ isActive: true });
    if (!config) config = new QuizConfig({});
    config.questions.push({ text, options, correctIndex, marks: marks || 1 });
    await config.save();
    return res.status(201).json({ success: true, message: "Question added.", data: config.questions[config.questions.length - 1] });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/events/admin/questions/:qId
router.put("/admin/questions/:qId", adminLimiter, adminAuth, async (req, res) => {
  try {
    const { text, options, correctIndex, marks } = req.body;
    const config = await QuizConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });
    const q = config.questions.id(req.params.qId);
    if (!q) return res.status(404).json({ success: false, message: "Question not found." });
    if (text         !== undefined) q.text         = text;
    if (options      !== undefined) q.options       = options;
    if (correctIndex !== undefined) q.correctIndex  = correctIndex;
    if (marks        !== undefined) q.marks         = marks;
    await config.save();
    return res.json({ success: true, message: "Question updated.", data: q });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/events/admin/questions/:qId
router.delete("/admin/questions/:qId", adminLimiter, adminAuth, async (req, res) => {
  try {
    const config = await QuizConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });
    config.questions.pull({ _id: req.params.qId });
    await config.save();
    return res.json({ success: true, message: "Question deleted." });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;