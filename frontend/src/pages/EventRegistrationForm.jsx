import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { registerForEvent } from "../utils/api";
import { validateField, validateForm, getMaxDOB, getMinDOB, INDIAN_STATES } from "../utils/validation";
import mhaLogo from "../assets/logo2.png";
import "./EventRegistrationForm.css";

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const initialForm = {
  fullName: "", phone: "", email: "", gender: "",
  dob: "", state: "", district: "", qualification: "", address: "",
};

function Field({ name, label, touched, errors, children }) {
  const hasError = touched[name] && errors[name];
  const isValid  = touched[name] && !errors[name];
  return (
    <div className={`er-field${hasError ? " er-field--error" : ""}${isValid ? " er-field--valid" : ""}`}>
      <label htmlFor={name} className="er-label">{label}<span className="er-required">*</span></label>
      {children}
      {hasError && (
        <span className="er-error-msg" role="alert">
          {errors[name]}
        </span>
      )}
    </div>
  );
}

export default function EventRegistrationForm() {
  const navigate = useNavigate();
  const [form, setForm]           = useState(initialForm);
  const [errors, setErrors]       = useState({});
  const [touched, setTouched]     = useState({});
  const [status, setStatus]       = useState("idle");
  const [serverMsg, setServerMsg] = useState("");
  const [successData, setSuccessData] = useState(null);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(p => ({ ...p, [name]: value }));
    setErrors(p => ({ ...p, [name]: "" }));
  }, []);

  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    setTouched(p => ({ ...p, [name]: true }));
    setErrors(p => ({ ...p, [name]: validateField(name, value) }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const allTouched = Object.keys(initialForm).reduce((a, k) => ({ ...a, [k]: true }), {});
    setTouched(allTouched);
    const formErrors = validateForm(form);
    
    if (Object.keys(formErrors).length) { 
        setErrors(formErrors); 
        toast.warn("Please complete all required fields."); 
        return; 
    }

    setStatus("submitting");
    try {
      const res = await registerForEvent(form);
      setStatus("success");
      setSuccessData(res.data.data);
      setServerMsg(res.data.message || "Registration Successful!");
      toast.success("Registration Successful!");
    } catch (err) {
      setStatus("error");
      const msg = err.response?.data?.message || "Registration failed.";
      setServerMsg(msg);
      toast.error(msg);
    }
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "";

  return (
    <div className="er-page">
      <nav className="er-navbar">
        <div className="er-navbar-brand">
          <div className="er-navbar-logo"><img src={mhaLogo} alt="MHA" /></div>
          <div>
            <div className="er-navbar-name">Mandi Hariyanna Academy</div>
            <div className="er-navbar-sub">MANDI HARISH FOUNDATION ®</div>
          </div>
        </div>
      </nav>

      {status === "success" && successData ? (
        <main className="er-main">
          <div className="er-card er-success-card">
            <div className="er-success-burst">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 className="er-success-title">Registration Successful!</h2>
            <p className="er-success-sub">A confirmation email has been sent to {successData.email}</p>
            
            <div className="er-success-grid">
              <div className="er-success-item"><span>Full Name</span><strong>{successData.fullName}</strong></div>
              <div className="er-success-item"><span>Phone</span><strong>{successData.phone}</strong></div>
              <div className="er-success-item"><span>Email</span><strong>{successData.email}</strong></div>
              <div className="er-success-item"><span>DOB</span><strong>{fmtDate(successData.dob)}</strong></div>
              <div className="er-success-item"><span>State</span><strong>{successData.state}</strong></div>
              <div className="er-success-item"><span>District</span><strong>{successData.district}</strong></div>
            </div>

            <button className="er-start-quiz-btn" onClick={() => navigate("/quiz", { state: { registrationId: successData.id, fullName: successData.fullName } })}>
               Start Quiz Now
            </button>
          </div>
        </main>
      ) : (
        <>
          <div className="er-hero">
            <h1 className="er-hero-title">Data Science &amp; <span>Employability</span> Skills</h1>
            <p className="er-hero-sub">Fill in your details to register and start the quiz</p>
          </div>

          <main className="er-main">
            <form className="er-card" onSubmit={handleSubmit} noValidate>
              {status === "error" && <div className="er-banner er-banner--error">{serverMsg}</div>}
              <div className="er-section-label">Participant Details</div>

              <div className="er-grid er-grid--2">
                <Field name="fullName" label="Full Name" touched={touched} errors={errors}>
                  <input type="text" name="fullName" value={form.fullName} onChange={handleChange} onBlur={handleBlur} placeholder="Enter full name" className="er-input" />
                </Field>
                <Field name="phone" label="Phone Number" touched={touched} errors={errors}>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} onBlur={handleBlur} placeholder="+91 XXXXX XXXXX" className="er-input" />
                </Field>
                <Field name="email" label="Email Address" touched={touched} errors={errors}>
                  <input type="email" name="email" value={form.email} onChange={handleChange} onBlur={handleBlur} placeholder="name@domain.com" className="er-input" />
                </Field>
                <Field name="gender" label="Gender" touched={touched} errors={errors}>
                  <select name="gender" value={form.gender} onChange={handleChange} onBlur={handleBlur} className="er-input">
                    <option value="" disabled>-- Select --</option>
                    {GENDER_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Field>
                <Field name="dob" label="Date of Birth" touched={touched} errors={errors}>
                  <input type="date" name="dob" value={form.dob} onChange={handleChange} onBlur={handleBlur} min={getMinDOB()} max={getMaxDOB()} className="er-input" />
                </Field>
                <Field name="state" label="State" touched={touched} errors={errors}>
                  <select name="state" value={form.state} onChange={handleChange} onBlur={handleBlur} className="er-input">
                    <option value="" disabled>-- Select --</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field name="district" label="District" touched={touched} errors={errors}>
                  <input type="text" name="district" value={form.district} onChange={handleChange} onBlur={handleBlur} placeholder="Enter district" className="er-input" />
                </Field>
                <Field name="qualification" label="Qualification" touched={touched} errors={errors}>
                  <input type="text" name="qualification" value={form.qualification} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. B.Tech, MBA" className="er-input" />
                </Field>
              </div>

              <div style={{ marginTop: 16 }}>
                <Field name="address" label="Complete Address" touched={touched} errors={errors}>
                  <textarea name="address" value={form.address} onChange={handleChange} onBlur={handleBlur} placeholder="Full address with pincode" className="er-input er-input--textarea" />
                </Field>
              </div>

              <div className="er-submit-wrap">
                <button type="submit" className="er-btn er-btn--primary" disabled={status === "submitting"}>
                  {status === "submitting" ? "Registering..." : "Register & Proceed to Quiz"}
                </button>
              </div>
            </form>
          </main>
        </>
      )}
    </div>
  );
}