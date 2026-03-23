const mongoose = require("mongoose");

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
];

const eventRegistrationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
      match: [/^[+]?[\d\s\-().]{7,15}$/, "Please enter a valid phone number"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
    },
    gender: {
      type: String,
      required: [true, "Gender is required"],
      enum: { values: ["Male", "Female", "Non-binary", "Prefer not to say"], message: "Please select a valid gender option" },
    },
    dob: {
      type: Date,
      required: [true, "Date of birth is required"],
      validate: {
        validator: function (value) {
          const today = new Date();
          const minAge = new Date(today.getFullYear() - 120, today.getMonth(), today.getDate());
          const maxAge = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
          return value >= minAge && value <= maxAge;
        },
        message: "Age must be between 13 and 120 years",
      },
    },
    state: {
      type: String,
      required: [true, "State is required"],
      enum: { values: INDIAN_STATES, message: "Please select a valid state" },
    },
    district: {
      type: String,
      required: [true, "District is required"],
      trim: true,
      minlength: [2, "District must be at least 2 characters"],
      maxlength: [100, "District cannot exceed 100 characters"],
    },
    qualification: {
      type: String,
      required: [true, "Qualification is required"],
      trim: true,
      maxlength: [150, "Qualification cannot exceed 150 characters"],
    },
    address: {
      type: String,
      required: [true, "Complete address is required"],
      trim: true,
      minlength: [10, "Please enter a complete address"],
      maxlength: [500, "Address cannot exceed 500 characters"],
    },
    confirmationCode: {
      type: String,
      default: () => Math.random().toString(36).substring(2, 8).toUpperCase(),
    },
    // Quiz tracking
    quizStarted: { type: Boolean, default: false },
    quizCompleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("EventRegistration", eventRegistrationSchema);
