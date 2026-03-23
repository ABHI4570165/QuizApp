const express = require("express");
const router = express.Router();
const EventRegistration = require("../models/EventRegistration");
const QuizConfig = require("../models/QuizConfig");
const QuizAttempt = require("../models/QuizAttempt");
const { sendConfirmationEmail, sendQuizCompletionEmail } = require("../utils/emailService");
const { eventRegistrationRules, handleValidationErrors } = require("../middleware/validate");

// ─── Admin auth middleware ────────────────────────────────────────────────────
const adminAuth = (req, res, next) => {
  const password = req.headers["x-admin-password"];
  if (!password || password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  next();
};

// ════════════════════════════════════════════════════════════
// PUBLIC ROUTES
// ════════════════════════════════════════════════════════════

// POST /api/events/register
router.post("/register", eventRegistrationRules, handleValidationErrors, async (req, res) => {
  try {
    const { fullName, phone, email, gender, dob, state, district, qualification, address } = req.body;

    const existingUser = await EventRegistration.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email address already exists.",
        errors: { email: "Email address is already registered" },
      });
    }

    const registration = await EventRegistration.create({
      fullName, phone, email, gender, dob, state, district, qualification, address,
    });

    console.log(`✅ Registered: ${registration.email} — Code: ${registration.confirmationCode}`);

    let emailSent = false;
    try {
      emailSent = await sendConfirmationEmail(registration);
    } catch (emailError) {
      console.error("⚠️ Email send failed:", emailError.message);
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful! A confirmation email has been sent.",
      emailSent,
      data: {
        id: registration._id,
        confirmationCode: registration.confirmationCode,
        fullName: registration.fullName,
        email: registration.email,
        phone: registration.phone,
        gender: registration.gender,
        dob: registration.dob,
        state: registration.state,
        district: registration.district,
        qualification: registration.qualification,
        address: registration.address,
        registeredAt: registration.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: "An account with this email already exists.", errors: { email: "Email address is already registered" } });
    }
    console.error("Registration error:", err);
    return res.status(500).json({ success: false, message: "Server error. Please try again." });
  }
});

// GET /api/events/quiz-config — returns quiz settings + questions (without correctIndex for security)
router.get("/quiz-config", async (req, res) => {
  try {
    const config = await QuizConfig.findOne({ isActive: true }).lean();
    if (!config) return res.status(404).json({ success: false, message: "No active quiz configured." });

    const safeQuestions = config.questions.map(({ _id, text, options, marks }) => ({
      _id, text, options, marks,
    }));

    return res.json({
      success: true,
      data: {
        passingScore: config.passingScore,
        timeLimitMinutes: config.timeLimitMinutes,
        totalQuestions: config.questions.length,
        questions: safeQuestions,
      },
    });
  } catch (err) {
    console.error("Quiz config error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/quiz/start
router.post("/quiz/start", async (req, res) => {
  try {
    const { registrationId } = req.body;
    if (!registrationId) return res.status(400).json({ success: false, message: "Registration ID required." });

    const reg = await EventRegistration.findById(registrationId);
    if (!reg) return res.status(404).json({ success: false, message: "Registration not found." });

    // Check for existing in-progress attempt
    const existingAttempt = await QuizAttempt.findOne({ registrationId, status: "in-progress" });
    if (existingAttempt) {
      return res.json({ success: true, message: "Resuming existing attempt.", attemptId: existingAttempt._id });
    }

    // Check if already completed
    const completedAttempt = await QuizAttempt.findOne({ registrationId, status: "completed" });
    if (completedAttempt) {
      return res.status(409).json({ success: false, message: "You have already completed this quiz.", alreadyCompleted: true, score: completedAttempt.score });
    }

    const config = await QuizConfig.findOne({ isActive: true });
    if (!config || config.questions.length === 0)
      return res.status(404).json({ success: false, message: "No active quiz available." });

    const attempt = await QuizAttempt.create({
      registrationId,
      fullName: reg.fullName,
      email: reg.email,
      totalQuestions: config.questions.length,
      passingScore: config.passingScore,
    });

    await EventRegistration.findByIdAndUpdate(registrationId, { quizStarted: true });

    return res.status(201).json({ success: true, message: "Quiz started.", attemptId: attempt._id });
  } catch (err) {
    console.error("Quiz start error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/quiz/submit
router.post("/quiz/submit", async (req, res) => {
  try {
    const { attemptId, answers, timeTakenSeconds, certBase64 } = req.body;
    if (!attemptId) return res.status(400).json({ success: false, message: "Attempt ID required." });

    const attempt = await QuizAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: "Attempt not found." });
    if (attempt.status === "completed") {
      return res.json({ success: true, message: "Already submitted.", score: attempt.score, passed: attempt.passed });
    }

    const config = await QuizConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ success: false, message: "Quiz config not found." });

    // Calculate score
    let score = 0;
    const processedAnswers = [];
    (answers || []).forEach(({ questionIndex, selectedIndex }) => {
      const q = config.questions[questionIndex];
      if (q && selectedIndex === q.correctIndex) score += (q.marks || 1);
      processedAnswers.push({ questionIndex, selectedIndex });
    });

    const passed = score >= config.passingScore;
    const certType = passed ? "achievement" : "participation";

    attempt.answers = processedAnswers;
    attempt.score = score;
    attempt.passed = passed;
    attempt.certificateType = certType;
    attempt.status = "completed";
    attempt.completedAt = new Date();
    attempt.timeTakenSeconds = timeTakenSeconds || 0;
    await attempt.save();

    await EventRegistration.findByIdAndUpdate(attempt.registrationId, { quizCompleted: true });

    // Send thank-you email with certificate
    let emailSent = false;
    try {
      emailSent = await sendQuizCompletionEmail(attempt, certBase64 || null);
      if (emailSent) { attempt.emailSent = true; await attempt.save(); }
    } catch (emailErr) {
      console.error("⚠️ Quiz email failed:", emailErr.message);
    }

    return res.json({
      success: true,
      message: "Quiz submitted successfully!",
      data: {
        score,
        totalQuestions: attempt.totalQuestions,
        passingScore: config.passingScore,
        passed,
        certificateType: certType,
        emailSent,
      },
    });
  } catch (err) {
    console.error("Quiz submit error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// ════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ════════════════════════════════════════════════════════════

// POST /api/events/admin/login
router.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, message: "Password required" });
  if (!process.env.ADMIN_PASSWORD) return res.status(500).json({ success: false, message: "ADMIN_PASSWORD not set in .env" });
  if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ success: false, message: "Incorrect password" });
  return res.json({ success: true, message: "Login successful" });
});

// GET /api/events/admin/registrations
router.get("/admin/registrations", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", gender = "", state = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { confirmationCode: { $regex: search, $options: "i" } },
        { district: { $regex: search, $options: "i" } },
      ];
    }
    if (gender) filter.gender = gender;
    if (state) filter.state = state;

    const [registrations, total] = await Promise.all([
      EventRegistration.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      EventRegistration.countDocuments(filter),
    ]);

    const stats = await EventRegistration.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, byGender: { $push: "$gender" }, byState: { $push: "$state" } } },
    ]);
    const genderCounts = {}, stateCounts = {};
    if (stats[0]) {
      stats[0].byGender.forEach((g) => { genderCounts[g] = (genderCounts[g] || 0) + 1; });
      stats[0].byState.forEach((s) => { stateCounts[s] = (stateCounts[s] || 0) + 1; });
    }

    // Count quiz started/completed
    const [quizStartedCount, quizCompletedCount] = await Promise.all([
      EventRegistration.countDocuments({ quizStarted: true }),
      EventRegistration.countDocuments({ quizCompleted: true }),
    ]);

    return res.json({
      success: true,
      data: registrations,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: {
        totalRegistrations: stats[0]?.total || 0,
        quizStarted: quizStartedCount,
        quizCompleted: quizCompletedCount,
        byGender: genderCounts,
        byState: stateCounts,
      },
    });
  } catch (err) {
    console.error("Admin fetch error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/attempts — all quiz attempts
router.get("/admin/attempts", adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "", status = "", passed = "" } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {};
    if (search) filter.$or = [{ fullName: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    if (status) filter.status = status;
    if (passed !== "") filter.passed = passed === "true";

    const [attempts, total] = await Promise.all([
      QuizAttempt.find(filter).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      QuizAttempt.countDocuments(filter),
    ]);

    const stats = await QuizAttempt.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, passed: { $sum: { $cond: ["$passed", 1, 0] } }, avgScore: { $avg: "$score" } } },
    ]);

    return res.json({
      success: true,
      data: attempts,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      stats: {
        totalAttempts: stats[0]?.total || 0,
        passed: stats[0]?.passed || 0,
        failed: (stats[0]?.total || 0) - (stats[0]?.passed || 0),
        avgScore: stats[0]?.avgScore ? Math.round(stats[0].avgScore * 10) / 10 : 0,
      },
    });
  } catch (err) {
    console.error("Admin attempts error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/events/admin/quiz-config
router.get("/admin/quiz-config", adminAuth, async (req, res) => {
  try {
    const config = await QuizConfig.findOne({ isActive: true });
    return res.json({ success: true, data: config });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/events/admin/quiz-settings — update timer & passing score
router.put("/admin/quiz-settings", adminAuth, async (req, res) => {
  try {
    const { passingScore, timeLimitMinutes } = req.body;
    let config = await QuizConfig.findOne({ isActive: true });
    if (!config) config = new QuizConfig({});
    if (passingScore !== undefined) config.passingScore = Number(passingScore);
    if (timeLimitMinutes !== undefined) config.timeLimitMinutes = Number(timeLimitMinutes);
    await config.save();
    return res.json({ success: true, message: "Settings updated.", data: config });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/events/admin/questions — add a question
router.post("/admin/questions", adminAuth, async (req, res) => {
  try {
    const { text, options, correctIndex, marks } = req.body;
    if (!text || !options || options.length !== 4 || correctIndex === undefined)
      return res.status(400).json({ success: false, message: "text, 4 options, and correctIndex are required." });

    let config = await QuizConfig.findOne({ isActive: true });
    if (!config) config = new QuizConfig({});
    config.questions.push({ text, options, correctIndex, marks: marks || 1 });
    await config.save();
    return res.status(201).json({ success: true, message: "Question added.", data: config.questions[config.questions.length - 1] });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/events/admin/questions/:qId — edit a question
router.put("/admin/questions/:qId", adminAuth, async (req, res) => {
  try {
    const { text, options, correctIndex, marks } = req.body;
    const config = await QuizConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ success: false, message: "Config not found." });

    const q = config.questions.id(req.params.qId);
    if (!q) return res.status(404).json({ success: false, message: "Question not found." });

    if (text !== undefined) q.text = text;
    if (options !== undefined) q.options = options;
    if (correctIndex !== undefined) q.correctIndex = correctIndex;
    if (marks !== undefined) q.marks = marks;
    await config.save();
    return res.json({ success: true, message: "Question updated.", data: q });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/events/admin/questions/:qId — delete a question
router.delete("/admin/questions/:qId", adminAuth, async (req, res) => {
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
