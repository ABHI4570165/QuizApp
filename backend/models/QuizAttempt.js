const mongoose = require("mongoose");

const quizAttemptSchema = new mongoose.Schema(
  {
    registrationId: { type: mongoose.Schema.Types.ObjectId, ref: "EventRegistration", required: true },
    fullName:  { type: String, required: true },
    email:     { type: String, required: true },
    answers:   [{ questionIndex: Number, selectedIndex: Number }],
    score:     { type: Number, default: 0 },
    totalQuestions: { type: Number },
    passingScore:   { type: Number },
    passed:    { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    timeTakenSeconds: { type: Number },
    status: { type: String, enum: ["in-progress", "completed", "timed-out"], default: "in-progress" },
    certificateType: { type: String, enum: ["achievement", "participation"], default: "participation" },
    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizAttempt", quizAttemptSchema);
