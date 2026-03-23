export const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh",
  "Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka",
  "Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram",
  "Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"
];

export const validateField = (name, value) => {
  switch (name) {
    case "fullName":
      if (!value.trim()) return "Full name is required";
      if (value.trim().length < 2) return "At least 2 characters required";
      if (!/^[a-zA-Z\s'.,-]+$/.test(value.trim())) return "Name contains invalid characters";
      return "";
    case "phone":
      if (!value.trim()) return "Phone number is required";
      if (!/^[+]?[\d\s\-().]{7,15}$/.test(value.trim())) return "Please enter a valid phone number";
      return "";
    case "email":
      if (!value.trim()) return "Email address is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Please enter a valid email address";
      return "";
    case "gender":
      if (!value) return "Please select your gender";
      return "";
    case "dob": {
      if (!value) return "Date of birth is required";
      const birth = new Date(value);
      const today = new Date();
      if (birth > today) return "Date of birth cannot be in the future";
      const age = today.getFullYear() - birth.getFullYear();
      if (age < 13) return "You must be at least 13 years old";
      if (age > 120) return "Please enter a valid date of birth";
      return "";
    }
    case "state":
      if (!value) return "Please select your state";
      return "";
    case "district":
      if (!value.trim()) return "District is required";
      if (value.trim().length < 2) return "At least 2 characters required";
      return "";
    case "qualification":
      if (!value.trim()) return "Qualification is required";
      return "";
    case "address":
      if (!value.trim()) return "Complete address is required";
      if (value.trim().length < 10) return "Please enter a complete address";
      return "";
    default:
      return "";
  }
};

export const validateForm = (form) => {
  const errors = {};
  ["fullName","phone","email","gender","dob","state","district","qualification","address"].forEach((key) => {
    const err = validateField(key, form[key]);
    if (err) errors[key] = err;
  });
  return errors;
};

export const getMaxDOB = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return d.toISOString().split("T")[0];
};

export const getMinDOB = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return d.toISOString().split("T")[0];
};
