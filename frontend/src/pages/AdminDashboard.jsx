import React, { useState, useEffect, useCallback } from "react";
import {
  adminLogin, fetchRegistrations, fetchAttempts,
  fetchAdminQuizConfig, updateQuizSettings,
  addQuestion, updateQuestion, deleteQuestion,
} from "../utils/api";
import "./AdminDashboard.css";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (d) => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const fmtDOB  = (d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
const getAge  = (dob) => { const t = new Date(), b = new Date(dob); let a = t.getFullYear()-b.getFullYear(); const m=t.getMonth()-b.getMonth(); if(m<0||(m===0&&t.getDate()<b.getDate())) a--; return a; };
const fmtSecs = (s) => { if(!s) return "—"; const m=Math.floor(s/60); return `${m}m ${s%60}s`; };

const GENDER_COLORS = { Male:"ad-badge--blue", Female:"ad-badge--purple", "Non-binary":"ad-badge--amber", "Prefer not to say":"ad-badge--gray" };

// ── Login ─────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pwd, setPwd] = useState(""); const [err, setErr] = useState(""); const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); if (!pwd.trim()) { setErr("Password required"); return; }
    setLoading(true); setErr("");
    try { await adminLogin(pwd); onLogin(pwd); }
    catch (e) { setErr(e.message || "Incorrect password"); }
    finally { setLoading(false); }
  };
  return (
    <div className="ad-login-page">
      <div className="ad-login-card">
        <div className="ad-login-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h1 className="ad-login-title">Admin Dashboard</h1>
        <p className="ad-login-sub">Enter your admin password to continue</p>
        <form onSubmit={submit} className="ad-login-form">
          <div className="ad-input-wrap">
            <svg className="ad-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="Admin password" className={`ad-input${err?" ad-input--error":""}`} autoFocus />
          </div>
          {err && <p className="ad-login-error">{err}</p>}
          <button type="submit" className="ad-btn ad-btn--primary" disabled={loading}>
            {loading ? <><span className="ad-spinner"/>Verifying…</> : "Enter Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }) => (
  <div className={`ad-stat ${color}`}><div className="ad-stat-value">{value}</div><div className="ad-stat-label">{label}</div></div>
);

// ── Registration Detail Modal ─────────────────────────────────────────────────
function RegModal({ reg, onClose }) {
  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e=>e.stopPropagation()}>
        <div className="ad-modal-header">
          <div><h2 className="ad-modal-title">{reg.fullName}</h2><p className="ad-modal-sub">{reg.email}</p></div>
          <button className="ad-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ad-modal-grid">
          {[
            ["Full Name", reg.fullName], ["Phone", reg.phone], ["Email", reg.email],
            ["Gender", reg.gender], ["DOB", `${fmtDOB(reg.dob)} (Age: ${getAge(reg.dob)})`],
            ["State", reg.state], ["District", reg.district], ["Qualification", reg.qualification],
            ["Quiz Started", reg.quizStarted?"Yes":"No"], ["Quiz Completed", reg.quizCompleted?"Yes":"No"],
            ["Registered", `${fmtDate(reg.createdAt)} ${fmtTime(reg.createdAt)}`],
            ["Address", reg.address], ["ID", reg._id],
          ].map(([lbl, val]) => (
            <div key={lbl} className={`ad-modal-row ${["Address","ID"].includes(lbl)?"ad-modal-row--full":""}`}>
              <span className="ad-modal-label">{lbl}</span>
              <span className={`ad-modal-value ${lbl==="ID"?"ad-modal-value--mono":""}`}>{val}</span>
            </div>
          ))}
        </div>
        <button className="ad-btn ad-btn--primary" style={{width:"100%"}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Attempt Detail Modal ──────────────────────────────────────────────────────
function AttemptModal({ a, onClose }) {
  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e=>e.stopPropagation()}>
        <div className="ad-modal-header">
          <div><h2 className="ad-modal-title">{a.fullName}</h2><p className="ad-modal-sub">{a.email}</p></div>
          <button className="ad-modal-close" onClick={onClose}>×</button>
        </div>
        <div style={{textAlign:"center",marginBottom:16}}>
          <span className={`ad-badge ${a.passed?"ad-badge--green":"ad-badge--amber"}`} style={{fontSize:13,padding:"6px 16px"}}>
            {a.passed?"✅ Passed":"⚠️ Not Passed"} — Score: {a.score}/{a.totalQuestions}
          </span>
        </div>
        <div className="ad-modal-grid">
          {[
            ["Certificate", a.certificateType==="achievement"?"Achievement":"Participation"],
            ["Status", a.status], ["Time Taken", fmtSecs(a.timeTakenSeconds)],
            ["Email Sent", a.emailSent?"Yes":"No"],
            ["Started At", a.startedAt?`${fmtDate(a.startedAt)} ${fmtTime(a.startedAt)}`:"—"],
            ["Completed At", a.completedAt?`${fmtDate(a.completedAt)} ${fmtTime(a.completedAt)}`:"—"],
          ].map(([lbl,val])=>(
            <div key={lbl} className="ad-modal-row"><span className="ad-modal-label">{lbl}</span><span className="ad-modal-value">{val}</span></div>
          ))}
        </div>
        <button className="ad-btn ad-btn--primary" style={{width:"100%"}} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Question Form ─────────────────────────────────────────────────────────────
function QuestionForm({ initial, onSave, onCancel, saving }) {
  const [text, setText]         = useState(initial?.text || "");
  const [opts, setOpts]         = useState(initial?.options || ["","","",""]);
  const [correct, setCorrect]   = useState(initial?.correctIndex ?? 0);
  const [marks, setMarks]       = useState(initial?.marks ?? 1);

  const setOpt = (i, v) => { const o=[...opts]; o[i]=v; setOpts(o); };

  const submit = () => {
    if (!text.trim()) return alert("Question text required");
    if (opts.some(o=>!o.trim())) return alert("All 4 options required");
    onSave({ text: text.trim(), options: opts.map(o=>o.trim()), correctIndex: correct, marks });
  };

  return (
    <div className="ad-settings-card" style={{marginBottom:0}}>
      <div className="ad-form-group" style={{marginBottom:14}}>
        <label className="ad-form-label">Question Text *</label>
        <textarea className="ad-form-textarea" value={text} onChange={e=>setText(e.target.value)} placeholder="Enter question..." />
      </div>
      <div className="ad-form-group" style={{marginBottom:14}}>
        <label className="ad-form-label">Options (select the correct answer)</label>
        <div className="ad-q-opt-inputs">
          {opts.map((o,i) => (
            <div key={i} className="ad-q-opt-row">
              <input type="radio" name="correct" checked={correct===i} onChange={()=>setCorrect(i)} />
              <input type="text" value={o} onChange={e=>setOpt(i,e.target.value)} placeholder={`Option ${i+1}`} />
              <span className="ad-correct-lbl">{correct===i?"✓ Correct":""}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ad-form-group" style={{marginBottom:16}}>
        <label className="ad-form-label">Marks</label>
        <input type="number" className="ad-form-input" style={{maxWidth:100}} value={marks} min={1} max={10} onChange={e=>setMarks(Number(e.target.value))} />
      </div>
      <div style={{display:"flex",gap:10}}>
        <button className="ad-btn ad-btn--primary" style={{flex:1}} onClick={submit} disabled={saving}>
          {saving?<><span className="ad-spinner"/>Saving…</>:"Save Question"}
        </button>
        <button className="ad-btn ad-btn--refresh" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ password, onLogout }) {
  const [tab, setTab]           = useState("registrations");
  const [regs, setRegs]         = useState([]);
  const [regStats, setRegStats] = useState(null);
  const [regPage, setRegPage]   = useState(1);
  const [regPag, setRegPag]     = useState({ total:0, pages:1 });
  const [regSearch, setRegSearch] = useState("");
  const [regGender, setRegGender] = useState("");
  const [selectedReg, setSelectedReg] = useState(null);

  const [attempts, setAttempts] = useState([]);
  const [attStats, setAttStats] = useState(null);
  const [attPage, setAttPage]   = useState(1);
  const [attPag, setAttPag]     = useState({ total:0, pages:1 });
  const [attSearch, setAttSearch] = useState("");
  const [attStatus, setAttStatus] = useState("");
  const [attPassed, setAttPassed] = useState("");
  const [selectedAtt, setSelectedAtt] = useState(null);

  const [quizCfg, setQuizCfg]   = useState(null);
  const [settingsPS, setSettingsPS] = useState("");
  const [settingsTL, setSettingsTL] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");

  const [questions, setQuestions] = useState([]);
  const [showAddQ, setShowAddQ]   = useState(false);
  const [editQ, setEditQ]         = useState(null);
  const [qSaving, setQSaving]     = useState(false);

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  // Load Registrations
  const loadRegs = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetchRegistrations(password, { page: regPage, limit: 15, search: regSearch, gender: regGender });
      setRegs(r.data.data); setRegStats(r.data.stats); setRegPag(r.data.pagination);
    } catch(e) { if(e.message==="Unauthorized"){onLogout();return;} setError(e.message||"Failed"); }
    finally { setLoading(false); }
  }, [password, regPage, regSearch, regGender, onLogout]);

  // Load Attempts
  const loadAttempts = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetchAttempts(password, { page: attPage, limit: 15, search: attSearch, status: attStatus, passed: attPassed });
      setAttempts(r.data.data); setAttStats(r.data.stats); setAttPag(r.data.pagination);
    } catch(e) { setError(e.message||"Failed"); }
    finally { setLoading(false); }
  }, [password, attPage, attSearch, attStatus, attPassed]);

  // Load Quiz Config
  const loadQuizCfg = useCallback(async () => {
    try {
      const r = await fetchAdminQuizConfig(password);
      const cfg = r.data.data;
      setQuizCfg(cfg);
      setQuestions(cfg?.questions || []);
      setSettingsPS(String(cfg?.passingScore || 15));
      setSettingsTL(String(cfg?.timeLimitMinutes || 20));
    } catch(e) { console.error(e); }
  }, [password]);

  useEffect(() => { if (tab==="registrations") loadRegs(); }, [tab, loadRegs]);
  useEffect(() => { setRegPage(1); }, [regSearch, regGender]);
  useEffect(() => { if (tab==="attempts") loadAttempts(); }, [tab, loadAttempts]);
  useEffect(() => { setAttPage(1); }, [attSearch, attStatus, attPassed]);
  useEffect(() => { if (tab==="questions" || tab==="settings") loadQuizCfg(); }, [tab, loadQuizCfg]);

  const saveSettings = async () => {
    setSettingsSaving(true); setSettingsMsg("");
    try {
      await updateQuizSettings(password, { passingScore: Number(settingsPS), timeLimitMinutes: Number(settingsTL) });
      setSettingsMsg("✅ Settings saved successfully!");
    } catch(e) { setSettingsMsg("❌ "+( e.message||"Failed")); }
    finally { setSettingsSaving(false); }
  };

  const handleAddQuestion = async (data) => {
    setQSaving(true);
    try { await addQuestion(password, data); await loadQuizCfg(); setShowAddQ(false); }
    catch(e) { alert(e.message||"Failed to add question"); }
    finally { setQSaving(false); }
  };

  const handleEditQuestion = async (data) => {
    setQSaving(true);
    try { await updateQuestion(password, editQ._id, data); await loadQuizCfg(); setEditQ(null); }
    catch(e) { alert(e.message||"Failed to update question"); }
    finally { setQSaving(false); }
  };

  const handleDeleteQuestion = async (qId) => {
    if (!window.confirm("Delete this question?")) return;
    try { await deleteQuestion(password, qId); await loadQuizCfg(); }
    catch(e) { alert(e.message||"Failed to delete"); }
  };

  const TABS = [
    { id:"registrations", label:"Registrations", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { id:"attempts",      label:"Quiz Attempts", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },
    { id:"questions",     label:"Questions",     icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
    { id:"settings",      label:"Quiz Settings", icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg> },
  ];

  return (
    <div className="ad-page">
      {/* Topbar */}
      <div className="ad-topbar">
        <div className="ad-topbar-left">
          <div className="ad-topbar-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
          <div><div className="ad-topbar-title">MH Academy Admin</div><div className="ad-topbar-sub">Quiz Management Dashboard</div></div>
        </div>
        <div className="ad-topbar-right">
          <button className="ad-btn ad-btn--refresh" onClick={()=>{if(tab==="registrations")loadRegs(); else if(tab==="attempts")loadAttempts(); else loadQuizCfg();}} disabled={loading}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={loading?"ad-spin":""}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            Refresh
          </button>
          <button className="ad-btn ad-btn--logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="ad-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`ad-tab ${tab===t.id?"ad-tab--active":""}`} onClick={()=>setTab(t.id)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="ad-content">
        {error && <div className="ad-error-banner">{error}</div>}

        {/* ── REGISTRATIONS TAB ── */}
        {tab === "registrations" && (
          <>
            {regStats && (
              <div className="ad-stats-row">
                <StatCard label="Total Registered" value={regStats.totalRegistrations} color="ad-stat--blue" />
                <StatCard label="Quiz Started"      value={regStats.quizStarted}        color="ad-stat--amber" />
                <StatCard label="Quiz Completed"    value={regStats.quizCompleted}      color="ad-stat--green" />
                <StatCard label="Male"              value={regStats.byGender?.Male||0}  color="ad-stat--teal" />
                <StatCard label="Female"            value={regStats.byGender?.Female||0} color="ad-stat--purple" />
                <StatCard label="Other"             value={(regStats.byGender?.["Non-binary"]||0)+(regStats.byGender?.["Prefer not to say"]||0)} color="ad-stat--gray" />
              </div>
            )}
            <div className="ad-filters">
              <div className="ad-search-wrap">
                <svg className="ad-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="ad-search" placeholder="Search name, email, phone, code…" value={regSearch} onChange={e=>setRegSearch(e.target.value)} />
                {regSearch && <button className="ad-search-clear" onClick={()=>setRegSearch("")}>×</button>}
              </div>
              <select className="ad-filter-select" value={regGender} onChange={e=>setRegGender(e.target.value)}>
                <option value="">All Genders</option>
                {["Male","Female","Non-binary","Prefer not to say"].map(g=><option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="ad-table-wrap">
              {loading ? <div className="ad-loading"><span className="ad-spinner ad-spinner--dark"/><span>Loading…</span></div>
              : regs.length===0 ? <div className="ad-empty"><p>No registrations found.</p></div>
              : <table className="ad-table">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Phone</th><th>Gender</th><th>State</th><th>Quiz</th><th>Code</th><th>Registered</th><th></th></tr></thead>
                  <tbody>
                    {regs.map((r,i)=>(
                      <tr key={r._id} className="ad-tr--click" onClick={()=>setSelectedReg(r)}>
                        <td className="ad-td-num">{(regPage-1)*15+i+1}</td>
                        <td><div className="ad-td-name"><div className="ad-avatar">{r.fullName.charAt(0).toUpperCase()}</div>{r.fullName}</div></td>
                        <td className="ad-td-email">{r.email}</td>
                        <td>{r.phone}</td>
                        <td><span className={`ad-badge ${GENDER_COLORS[r.gender]||""}`}>{r.gender}</span></td>
                        <td>{r.state}</td>
                        <td>
                          {r.quizCompleted ? <span className="ad-badge ad-badge--green">Completed</span>
                          : r.quizStarted  ? <span className="ad-badge ad-badge--amber">Started</span>
                          :                  <span className="ad-badge ad-badge--gray">Not Started</span>}
                        </td>
                        <td><span className="ad-code">{r.confirmationCode}</span></td>
                        <td className="ad-td-date">{fmtDate(r.createdAt)}<br/><span className="ad-td-time">{fmtTime(r.createdAt)}</span></td>
                        <td><button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={e=>{e.stopPropagation();setSelectedReg(r);}}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            </div>
            {regPag.pages > 1 && (
              <div className="ad-pagination">
                <span>Showing {(regPage-1)*15+1}–{Math.min(regPage*15,regPag.total)} of {regPag.total}</span>
                <div className="ad-page-btns">
                  <button className="ad-page-btn" disabled={regPage<=1} onClick={()=>setRegPage(p=>p-1)}>← Prev</button>
                  {Array.from({length:regPag.pages},(_,i)=>i+1).map(p=>(
                    <button key={p} className={`ad-page-btn ${p===regPage?"ad-page-btn--active":""}`} onClick={()=>setRegPage(p)}>{p}</button>
                  ))}
                  <button className="ad-page-btn" disabled={regPage>=regPag.pages} onClick={()=>setRegPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── ATTEMPTS TAB ── */}
        {tab === "attempts" && (
          <>
            {attStats && (
              <div className="ad-stats-row">
                <StatCard label="Total Attempts" value={attStats.totalAttempts} color="ad-stat--blue" />
                <StatCard label="Passed"         value={attStats.passed}        color="ad-stat--green" />
                <StatCard label="Not Passed"     value={attStats.failed}        color="ad-stat--amber" />
                <StatCard label="Avg Score"      value={attStats.avgScore}      color="ad-stat--purple" />
              </div>
            )}
            <div className="ad-filters">
              <div className="ad-search-wrap">
                <svg className="ad-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input className="ad-search" placeholder="Search name or email…" value={attSearch} onChange={e=>setAttSearch(e.target.value)} />
                {attSearch && <button className="ad-search-clear" onClick={()=>setAttSearch("")}>×</button>}
              </div>
              <select className="ad-filter-select" value={attStatus} onChange={e=>setAttStatus(e.target.value)}>
                <option value="">All Statuses</option>
                {["in-progress","completed","timed-out"].map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select className="ad-filter-select" value={attPassed} onChange={e=>setAttPassed(e.target.value)}>
                <option value="">Pass / Fail</option>
                <option value="true">Passed</option>
                <option value="false">Not Passed</option>
              </select>
            </div>
            <div className="ad-table-wrap">
              {loading ? <div className="ad-loading"><span className="ad-spinner ad-spinner--dark"/><span>Loading…</span></div>
              : attempts.length===0 ? <div className="ad-empty"><p>No quiz attempts found.</p></div>
              : <table className="ad-table">
                  <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Score</th><th>Result</th><th>Certificate</th><th>Time Taken</th><th>Status</th><th>Email Sent</th><th>Completed</th><th></th></tr></thead>
                  <tbody>
                    {attempts.map((a,i)=>(
                      <tr key={a._id} className="ad-tr--click" onClick={()=>setSelectedAtt(a)}>
                        <td className="ad-td-num">{(attPage-1)*15+i+1}</td>
                        <td><div className="ad-td-name"><div className="ad-avatar">{a.fullName.charAt(0).toUpperCase()}</div>{a.fullName}</div></td>
                        <td className="ad-td-email">{a.email}</td>
                        <td><strong>{a.score}/{a.totalQuestions}</strong></td>
                        <td><span className={`ad-badge ${a.passed?"ad-badge--green":"ad-badge--amber"}`}>{a.passed?"Passed":"Not Passed"}</span></td>
                        <td><span className={`ad-badge ${a.certificateType==="achievement"?"ad-badge--purple":"ad-badge--blue"}`}>{a.certificateType==="achievement"?"Achievement":"Participation"}</span></td>
                        <td>{fmtSecs(a.timeTakenSeconds)}</td>
                        <td><span className={`ad-badge ${a.status==="completed"?"ad-badge--green":a.status==="in-progress"?"ad-badge--amber":"ad-badge--gray"}`}>{a.status}</span></td>
                        <td><span className={`ad-badge ${a.emailSent?"ad-badge--green":"ad-badge--gray"}`}>{a.emailSent?"Sent":"Pending"}</span></td>
                        <td className="ad-td-date">{a.completedAt?<>{fmtDate(a.completedAt)}<br/><span className="ad-td-time">{fmtTime(a.completedAt)}</span></>:"—"}</td>
                        <td><button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={e=>{e.stopPropagation();setSelectedAtt(a);}}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              }
            </div>
            {attPag.pages > 1 && (
              <div className="ad-pagination">
                <span>Showing {(attPage-1)*15+1}–{Math.min(attPage*15,attPag.total)} of {attPag.total}</span>
                <div className="ad-page-btns">
                  <button className="ad-page-btn" disabled={attPage<=1} onClick={()=>setAttPage(p=>p-1)}>← Prev</button>
                  {Array.from({length:attPag.pages},(_,i)=>i+1).map(p=>(
                    <button key={p} className={`ad-page-btn ${p===attPage?"ad-page-btn--active":""}`} onClick={()=>setAttPage(p)}>{p}</button>
                  ))}
                  <button className="ad-page-btn" disabled={attPage>=attPag.pages} onClick={()=>setAttPage(p=>p+1)}>Next →</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── QUESTIONS TAB ── */}
        {tab === "questions" && (
          <>
            <div className="ad-qm-header">
              <div className="ad-qm-title">Quiz Questions ({questions.length})</div>
              {!showAddQ && !editQ && (
                <button className="ad-btn ad-btn--primary" style={{height:36}} onClick={()=>setShowAddQ(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Question
                </button>
              )}
            </div>
            {showAddQ && (
              <div style={{marginBottom:16}}>
                <QuestionForm onSave={handleAddQuestion} onCancel={()=>setShowAddQ(false)} saving={qSaving} />
              </div>
            )}
            {questions.length === 0 && !showAddQ && (
              <div className="ad-empty"><p>No questions yet. Add your first question above.</p></div>
            )}
            <div className="ad-qm-list">
              {questions.map((q,i) => (
                <div key={q._id}>
                  {editQ?._id === q._id
                    ? <QuestionForm initial={q} onSave={handleEditQuestion} onCancel={()=>setEditQ(null)} saving={qSaving} />
                    : <div className="ad-q-card">
                        <div className="ad-q-card-head">
                          <span className="ad-q-num-badge">Q{i+1} · {q.marks}M</span>
                          <span className="ad-q-text">{q.text}</span>
                          <div className="ad-q-card-acts">
                            <button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={()=>setEditQ(q)}>Edit</button>
                            <button className="ad-btn ad-btn--sm ad-btn--danger" onClick={()=>handleDeleteQuestion(q._id)}>Delete</button>
                          </div>
                        </div>
                        <div className="ad-q-opts">
                          {(q.options||[]).map((opt,oi)=>(
                            <div key={oi} className={`ad-q-opt ${oi===q.correctIndex?"ad-q-opt--correct":""}`}>
                              {oi===q.correctIndex?"✓ ":""}{opt}
                            </div>
                          ))}
                        </div>
                      </div>
                  }
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className="ad-settings-card">
            <div className="ad-settings-title">Quiz Settings</div>
            <div className="ad-settings-grid" style={{marginBottom:20}}>
              <div className="ad-form-group">
                <label className="ad-form-label">Passing Score (marks)</label>
                <input type="number" className="ad-form-input" value={settingsPS} min={1} onChange={e=>setSettingsPS(e.target.value)} />
                <span className="ad-form-hint">Students scoring ≥ this value get Certificate of Achievement</span>
              </div>
              <div className="ad-form-group">
                <label className="ad-form-label">Time Limit (minutes)</label>
                <input type="number" className="ad-form-input" value={settingsTL} min={1} max={180} onChange={e=>setSettingsTL(e.target.value)} />
                <span className="ad-form-hint">Quiz will auto-submit when time runs out</span>
              </div>
            </div>
            {settingsMsg && <p style={{fontSize:13,marginBottom:14,fontWeight:600,color:settingsMsg.startsWith("✅")?"#059669":"#ef4444"}}>{settingsMsg}</p>}
            <button className="ad-btn ad-btn--primary" style={{width:"auto",height:40,paddingLeft:32,paddingRight:32}} onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving?<><span className="ad-spinner"/>Saving…</>:"Save Settings"}
            </button>
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedReg && <RegModal reg={selectedReg} onClose={()=>setSelectedReg(null)} />}
      {selectedAtt && <AttemptModal a={selectedAtt} onClose={()=>setSelectedAtt(null)} />}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [pwd, setPwd] = useState(() => sessionStorage.getItem("adminPwd") || "");
  const login  = (p) => { sessionStorage.setItem("adminPwd", p); setPwd(p); };
  const logout = ()  => { sessionStorage.removeItem("adminPwd"); setPwd(""); window.location.href="/"; };
  if (!pwd) return <LoginScreen onLogin={login} />;
  return <Dashboard password={pwd} onLogout={logout} />;
}
