const { body, validationResult } = require("express-validator");

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
];

const eventRegistrationRules = [
  body("fullName").trim().notEmpty().withMessage("Full name is required")
    .isLength({ min: 2, max: 100 }).withMessage("Name must be between 2 and 100 characters")
    .matches(/^[a-zA-Z\s'.,-]+$/).withMessage("Name contains invalid characters"),
  body("phone").trim().notEmpty().withMessage("Phone number is required")
    .matches(/^[+]?[\d\s\-().]{7,15}$/).withMessage("Please enter a valid phone number"),
  body("email").trim().notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Please enter a valid email address")
    .normalizeEmail().isLength({ max: 254 }).withMessage("Email address is too long"),
  body("gender").notEmpty().withMessage("Gender is required")
    .isIn(["Male", "Female", "Non-binary", "Prefer not to say"]).withMessage("Please select a valid gender"),
  body("dob").notEmpty().withMessage("Date of birth is required")
    .isISO8601().withMessage("Invalid date format")
    .custom((value) => {
      const birth = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - birth.getFullYear();
      if (birth > today) throw new Error("Date of birth cannot be in the future");
      if (age > 120) throw new Error("Please enter a valid date of birth");
      if (age < 13) throw new Error("You must be at least 13 years old to register");
      return true;
    }),
  body("state").notEmpty().withMessage("State is required").isIn(INDIAN_STATES).withMessage("Please select a valid state"),
  body("district").trim().notEmpty().withMessage("District is required")
    .isLength({ min: 2, max: 100 }).withMessage("District must be between 2 and 100 characters"),
  body("qualification").trim().notEmpty().withMessage("Qualification is required")
    .isLength({ max: 150 }).withMessage("Qualification cannot exceed 150 characters"),
  body("address").trim().notEmpty().withMessage("Complete address is required")
    .isLength({ min: 10, max: 500 }).withMessage("Please enter a complete address (at least 10 characters)"),
];

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formatted = {};
    errors.array().forEach((err) => { if (!formatted[err.path]) formatted[err.path] = err.msg; });
    return res.status(422).json({ success: false, message: "Validation failed. Please check the highlighted fields.", errors: formatted });
  }
  next();
};

module.exports = { eventRegistrationRules, handleValidationErrors };
