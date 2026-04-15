const mongoose = require("mongoose");
const crypto   = require("crypto");

const quizAttemptSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: "EventRegistration", required: true },
    fullName:  { type: String, required: true },
    email:     { type: String, required: true },
    answers:   [{ questionIndex: Number, selectedIndex: Number }],
    score:     { type: Number, default: 0 },
    totalQuestions:   { type: Number },
    passingScore:     { type: Number },
    passed:    { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    completedAt:      { type: Date },
    timeTakenSeconds: { type: Number },
    status: {
      type: String,
      enum: ["in-progress", "completed", "timed-out"],
      default: "in-progress",
    },
    certificateType: {
      type: String,
      enum: ["achievement", "participation"],
      default: "participation",
    },
    emailSent: { type: Boolean, default: false },

    // ── Certificate anti-fraud fields ─────────────────────────────────────────
    /**
     * Unique human-readable certificate ID, e.g. "MHA-2024-A3X9KL"
     * Generated once on quiz completion, stored on both the attempt and returned
     * to the frontend so it can be rendered on the certificate PDF.
     */
    certificateId: {
      type: String,
      unique: true,
      sparse: true, // Only unique when present (in-progress attempts have none)
    },

    /**
     * Base64-encoded certificate PDF stored server-side.
     * Used so students can re-download their cert at any time without
     * re-generating it from the browser.
     */
    certPdfBase64: { type: String, select: false }, // exclude from normal queries
  },
  { timestamps: true }
);

/**
 * Generate a unique certificate ID before saving.
 * Format: MHA-<YEAR>-<6 random uppercase chars>
 * Called only when status transitions to "completed".
 */
quizAttemptSchema.methods.generateCertificateId = function () {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6 hex chars
  this.certificateId = `MHA-${year}-${rand}`;
};

// Index for fast certificate verification lookups


module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);