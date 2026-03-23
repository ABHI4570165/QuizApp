const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  options: {
    type: [String],
    validate: { validator: (v) => v.length === 4, message: "Each question must have exactly 4 options" },
  },
  correctIndex: { type: Number, required: true, min: 0, max: 3 },
  marks: { type: Number, default: 1 },
});

const quizConfigSchema = new mongoose.Schema(
  {
    passingScore: { type: Number, default: 15 },
    timeLimitMinutes: { type: Number, default: 20 },
    questions: [questionSchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizConfig", quizConfigSchema);
