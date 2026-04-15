import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { registerForEvent, studentLogin, setStudentToken } from "../utils/api";
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
    <div className={`er-field${hasError?" er-field--error":""}${isValid?" er-field--valid":""}`}>
      <label htmlFor={name} className="er-label">{label}<span className="er-required">*</span></label>
      {children}
      {hasError && <span className="er-error-msg" role="alert">{errors[name]}</span>}
    </div>
  );
}

function StudentLoginPanel({ onSuccess }) {
  const [email, setEmail]     = useState("");
  const [code,  setCode]      = useState("");
  const [err,   setErr]       = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !code.trim()) { setErr("Email and confirmation code are required."); return; }
    setLoading(true); setErr("");
    try {
      const res = await studentLogin(email.trim().toLowerCase(), code.trim().toUpperCase());
      if (res.data?.token) setStudentToken(res.data.token); // ← store JWT
      onSuccess(res.data.data);
    } catch (e) {
      setErr(e.message || "Invalid credentials. Check your email and confirmation code.");
    } finally { setLoading(false); }
  };

  return (
    <div className="er-login-panel">
      <div className="er-login-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      </div>
      <h3 className="er-login-title">Already Registered?</h3>
      <p className="er-login-sub">Use your email &amp; confirmation code to resume</p>
      <form onSubmit={handleLogin} className="er-login-form" noValidate>
        <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}} placeholder="Registered email address" className="er-input" />
        <input type="text" value={code} maxLength={8} onChange={e=>{setCode(e.target.value.toUpperCase());setErr("");}} placeholder="Confirmation code (e.g. A3X9KL)" className="er-input" style={{textTransform:"uppercase",letterSpacing:"3px",fontWeight:700}} />
        {err && <p className="er-login-error">{err}</p>}
        <button type="submit" className="er-btn er-btn--login" disabled={loading}>
          {loading ? "Verifying…" : "Resume Quiz →"}
        </button>
      </form>
    </div>
  );
}

function StudentDashboard({ data, navigate }) {
  const { fullName, email, phone, dob, state, district, id, quizCompleted, quizStarted, confirmationCode } = data;
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" }) : "";

  return (
    <main className="er-main">
      <div className="er-card er-dashboard-card">
        <div className="er-dash-header">
          <div className="er-dash-avatar">{fullName.charAt(0).toUpperCase()}</div>
          <div>
            <h2 className="er-dash-name">Welcome, {fullName}!</h2>
            <p className="er-dash-email">{email}</p>
          </div>
          <div className="er-dash-code-badge">
            <span className="er-dash-code-label">Confirmation Code</span>
            <span className="er-dash-code-val">{confirmationCode}</span>
          </div>
        </div>
        <div className="er-dash-status-row">
          <div className={`er-status-pill ${quizCompleted?"er-status-pill--done":quizStarted?"er-status-pill--progress":"er-status-pill--pending"}`}>
            <span className="er-status-dot" />
            {quizCompleted ? "Quiz Completed" : quizStarted ? "Quiz In Progress" : "Quiz Not Started"}
          </div>
        </div>
        <div className="er-dash-grid">
          {[["Phone",phone],["Date of Birth",fmtDate(dob)],["State",state],["District",district]].map(([k,v])=>(
            <div key={k} className="er-dash-item"><span>{k}</span><strong>{v}</strong></div>
          ))}
        </div>
        {quizCompleted ? (
          <div className="er-dash-completed-msg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            You have already completed the quiz. Download your certificate below.
            <button className="er-start-quiz-btn" style={{marginTop:12}} onClick={()=>navigate("/quiz",{state:{registrationId:id,fullName,resumeResult:true}})}>
              View Result &amp; Download Certificate
            </button>
          </div>
        ) : (
          <button className="er-start-quiz-btn" onClick={()=>navigate("/quiz",{state:{registrationId:id,fullName}})}>
            {quizStarted ? "Resume Quiz →" : "Start Quiz Now →"}
          </button>
        )}
      </div>
    </main>
  );
}

export default function EventRegistrationForm() {
  const navigate = useNavigate();
  const [mode,       setMode]       = useState("register");
  const [form,       setForm]       = useState(initialForm);
  const [errors,     setErrors]     = useState({});
  const [touched,    setTouched]    = useState({});
  const [status,     setStatus]     = useState("idle");
  const [serverMsg,  setServerMsg]  = useState("");
  const [successData, setSuccessData] = useState(null);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(p=>({...p,[name]:value})); setErrors(p=>({...p,[name]:""}));
  }, []);
  const handleBlur = useCallback((e) => {
    const { name, value } = e.target;
    setTouched(p=>({...p,[name]:true})); setErrors(p=>({...p,[name]:validateField(name,value)}));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const allTouched = Object.keys(initialForm).reduce((a,k)=>({...a,[k]:true}),{});
    setTouched(allTouched);
    const formErrors = validateForm(form);
    if (Object.keys(formErrors).length) { setErrors(formErrors); toast.warn("Please complete all required fields."); return; }
    setStatus("submitting");
    try {
      const res = await registerForEvent(form);
      if (res.data?.token) setStudentToken(res.data.token); // ← store JWT
      setSuccessData(res.data.data);
      setStatus("success");
      toast.success("Registration Successful!");
    } catch (err) {
      if (err.status===409||err.message?.includes("already registered")) {
        setServerMsg("This email is already registered. Please use the login option below.");
        setMode("login");
      } else { setServerMsg(err.message||"Registration failed."); }
      setStatus("error");
      toast.error(err.message||"Registration failed.");
    }
  };

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

      {successData ? (
        <StudentDashboard data={successData} navigate={navigate} />
      ) : (
        <>
          <div className="er-hero">
            <h1 className="er-hero-title">Data Science &amp; <span>Employability</span> Skills</h1>
            <p className="er-hero-sub">Register to participate in the quiz and earn your certificate</p>
            <div className="er-tab-row">
              <button className={`er-tab ${mode==="register"?"er-tab--active":""}`} onClick={()=>{setMode("register");setServerMsg("");}}>New Registration</button>
              <button className={`er-tab ${mode==="login"?"er-tab--active":""}`} onClick={()=>{setMode("login");setServerMsg("");}}>Already Registered</button>
            </div>
          </div>
          <main className="er-main">
            {mode === "login" ? (
              <div className="er-card">
                <StudentLoginPanel onSuccess={(data)=>{setSuccessData(data);toast.success(`Welcome back, ${data.fullName}!`);}} />
              </div>
            ) : (
              <form className="er-card" onSubmit={handleSubmit} noValidate>
                {status==="error" && <div className="er-banner er-banner--error">{serverMsg}</div>}
                <div className="er-section-label">Participant Details</div>
                <div className="er-grid er-grid--2">
                  <Field name="fullName" label="Full Name" touched={touched} errors={errors}><input type="text" name="fullName" value={form.fullName} onChange={handleChange} onBlur={handleBlur} placeholder="Enter full name" className="er-input" /></Field>
                  <Field name="phone" label="Phone Number" touched={touched} errors={errors}><input type="tel" name="phone" value={form.phone} onChange={handleChange} onBlur={handleBlur} placeholder="+91 XXXXX XXXXX" className="er-input" /></Field>
                  <Field name="email" label="Email Address" touched={touched} errors={errors}><input type="email" name="email" value={form.email} onChange={handleChange} onBlur={handleBlur} placeholder="name@domain.com" className="er-input" /></Field>
                  <Field name="gender" label="Gender" touched={touched} errors={errors}>
                    <select name="gender" value={form.gender} onChange={handleChange} onBlur={handleBlur} className="er-input">
                      <option value="" disabled>-- Select --</option>
                      {GENDER_OPTIONS.map(g=><option key={g} value={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field name="dob" label="Date of Birth" touched={touched} errors={errors}><input type="date" name="dob" value={form.dob} onChange={handleChange} onBlur={handleBlur} min={getMinDOB()} max={getMaxDOB()} className="er-input" /></Field>
                  <Field name="state" label="State" touched={touched} errors={errors}>
                    <select name="state" value={form.state} onChange={handleChange} onBlur={handleBlur} className="er-input">
                      <option value="" disabled>-- Select --</option>
                      {INDIAN_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field name="district" label="District" touched={touched} errors={errors}><input type="text" name="district" value={form.district} onChange={handleChange} onBlur={handleBlur} placeholder="Enter district" className="er-input" /></Field>
                  <Field name="qualification" label="Qualification" touched={touched} errors={errors}><input type="text" name="qualification" value={form.qualification} onChange={handleChange} onBlur={handleBlur} placeholder="e.g. B.Tech, MBA" className="er-input" /></Field>
                </div>
                <div style={{marginTop:16}}>
                  <Field name="address" label="Complete Address" touched={touched} errors={errors}><textarea name="address" value={form.address} onChange={handleChange} onBlur={handleBlur} placeholder="Full address with pincode" className="er-input er-input--textarea" /></Field>
                </div>
                <div className="er-submit-wrap">
                  <button type="submit" className="er-btn er-btn--primary" disabled={status==="submitting"}>
                    {status==="submitting" ? "Registering..." : "Register & Proceed to Quiz"}
                  </button>
                </div>
                <p className="er-login-hint">Already registered? <button type="button" className="er-link-btn" onClick={()=>setMode("login")}>Login here to resume</button></p>
              </form>
            )}
          </main>
        </>
      )}
    </div>
  );
}