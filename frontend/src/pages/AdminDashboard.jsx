import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import {
  adminLogin, fetchRegistrations, fetchAttempts,
  fetchAdminQuizConfig, updateQuizSettings,
  addQuestion, updateQuestion, deleteQuestion,
  deleteRegistration, verifyCertificate, clearAdminToken,
} from "../utils/api";
import "./AdminDashboard.css";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate     = (d) => new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
const fmtTime     = (d) => new Date(d).toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" });
const fmtDOB      = (d) => new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" });
const getAge      = (dob) => { const t=new Date(),b=new Date(dob); let a=t.getFullYear()-b.getFullYear(); const m=t.getMonth()-b.getMonth(); if(m<0||(m===0&&t.getDate()<b.getDate())) a--; return a; };
const fmtSecs     = (s) => { if(!s) return "—"; const m=Math.floor(s/60); return `${m}m ${s%60}s`; };
const fmtDateTime = (d) => d ? `${fmtDate(d)} ${fmtTime(d)}` : "—";
const GENDER_COLORS = { Male:"ad-badge--blue", Female:"ad-badge--purple", "Non-binary":"ad-badge--amber", "Prefer not to say":"ad-badge--gray" };

// ── Excel Export ──────────────────────────────────────────────────────────────
function exportToExcel(rows, columns, sheetName, fileName) {
  const header = columns.map(c => c.label);
  const data   = rows.map(row => columns.map(c => c.value(row)));
  const ws     = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws["!cols"]  = columns.map(c => ({ wch: c.width || 18 }));
  const wb     = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName);
}

function ExportButton({ onClick, loading, label = "Export to Excel" }) {
  return (
    <button className="ad-btn ad-btn--export" onClick={onClick} disabled={loading}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      {loading ? "Exporting…" : label}
    </button>
  );
}

// ── Question Form ─────────────────────────────────────────────────────────────
function QuestionForm({ initial, onSave, onCancel, saving }) {
  const [text, setText]     = useState(initial?.text || "");
  const [opts, setOpts]     = useState(initial?.options || ["","","",""]);
  const [correct, setCorrect] = useState(initial?.correctIndex ?? 0);
  const [marks, setMarks]   = useState(initial?.marks || 1);
  const [err, setErr]       = useState("");

  const save = () => {
    if (!text.trim()) { setErr("Question text is required."); return; }
    if (opts.some(o => !o.trim())) { setErr("All 4 options are required."); return; }
    onSave({ text: text.trim(), options: opts.map(o => o.trim()), correctIndex: correct, marks });
  };

  return (
    <div className="ad-q-form">
      <div className="ad-form-group">
        <label className="ad-form-label">Question Text</label>
        <textarea className="ad-form-input" rows={3} value={text} onChange={e=>{setText(e.target.value);setErr("");}} placeholder="Enter question..." />
      </div>
      <div className="ad-q-form-opts">
        {opts.map((o,i) => (
          <div key={i} className="ad-q-form-opt">
            <button type="button" className={`ad-q-radio ${correct===i?"ad-q-radio--active":""}`} onClick={()=>setCorrect(i)} title="Mark as correct">
              {correct===i?"✓":"○"}
            </button>
            <input className="ad-form-input" value={o} onChange={e=>{const n=[...opts];n[i]=e.target.value;setOpts(n);setErr("");}} placeholder={`Option ${i+1}`} />
          </div>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div className="ad-form-group" style={{flex:1}}>
          <label className="ad-form-label">Marks</label>
          <input type="number" className="ad-form-input" value={marks} min={1} style={{height:36}} onChange={e=>setMarks(Number(e.target.value))} />
        </div>
        <p style={{fontSize:12,color:"#64748b",alignSelf:"flex-end",marginBottom:4}}>Click ✓/○ to mark correct answer</p>
      </div>
      {err && <p style={{fontSize:12,color:"#ef4444",marginBottom:8}}>{err}</p>}
      <div style={{display:"flex",gap:8}}>
        <button className="ad-btn ad-btn--primary" style={{flex:1,height:38}} onClick={save} disabled={saving}>
          {saving?<><span className="ad-spinner"/>Saving…</>:initial?"Update Question":"Add Question"}
        </button>
        <button className="ad-btn ad-btn--refresh" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Delete Modal ──────────────────────────────────────────────────────────────
function DeleteConfirmModal({ student, onConfirm, onCancel, deleting }) {
  return (
    <div className="ad-modal-overlay" onClick={onCancel}>
      <div className="ad-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <div><h2 className="ad-modal-title" style={{ color: "#ef4444" }}>Delete Student?</h2><p className="ad-modal-sub">This action cannot be undone</p></div>
          <button className="ad-modal-close" onClick={onCancel}>×</button>
        </div>
        <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:10, padding:"14px 16px", marginBottom:18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div className="ad-avatar" style={{ background:"#ef4444", flexShrink:0 }}>{student.fullName.charAt(0).toUpperCase()}</div>
            <div>
              <div style={{ fontWeight:700, fontSize:14, color:"#1e293b" }}>{student.fullName}</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{student.email}</div>
            </div>
          </div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button className="ad-btn ad-btn--refresh" style={{ flex:1 }} onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="ad-btn ad-btn--danger" style={{ flex:1 }} onClick={onConfirm} disabled={deleting}>
            {deleting ? <><span className="ad-spinner"/>Deleting…</> : "Yes, Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Registration Modal ────────────────────────────────────────────────────────
function RegModal({ reg, onClose, onDelete }) {
  const certId = reg.certificateId;
  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <div><h2 className="ad-modal-title">{reg.fullName}</h2><p className="ad-modal-sub">{reg.email}</p></div>
          <button className="ad-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ad-modal-grid">
          {[
            ["Phone", reg.phone],["Gender", reg.gender],
            ["DOB", `${fmtDOB(reg.dob)} (Age ${getAge(reg.dob)})`],
            ["State", reg.state],["District", reg.district],
            ["Qualification", reg.qualification],
            ["Registered", fmtDateTime(reg.createdAt)],
            ["Confirmation Code", reg.confirmationCode],
          ].map(([k,v]) => (
            <div key={k} className="ad-modal-item"><span>{k}</span><strong>{v}</strong></div>
          ))}
          <div className="ad-modal-item" style={{gridColumn:"1/-1"}}><span>Address</span><strong>{reg.address}</strong></div>
        </div>
        {reg.quizCompleted && reg.score !== null && (
          <div className="ad-modal-quiz-result">
            <div className="ad-modal-quiz-score">
              <span className={`ad-big-badge ${reg.passed?"ad-big-badge--pass":"ad-big-badge--fail"}`}>{reg.passed?"Passed":"Not Passed"}</span>
              <strong className="ad-modal-quiz-num">{reg.score}/{reg.totalQuestions}</strong>
            </div>
            {certId && (
              <div className="ad-cert-id-row">
                <span className="ad-cert-id-label">Certificate ID</span>
                <span className="ad-cert-id-val">{certId}</span>
                <span className={`ad-badge ${reg.certificateType==="achievement"?"ad-badge--purple":"ad-badge--blue"}`}>{reg.certificateType==="achievement"?"Achievement":"Participation"}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ display:"flex", gap:8, marginTop:8 }}>
          <button className="ad-btn ad-btn--danger" style={{ flex:1 }} onClick={() => { onClose(); onDelete(reg); }}>Delete Student</button>
          <button className="ad-btn ad-btn--refresh" style={{ flex:1 }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Attempt Modal ─────────────────────────────────────────────────────────────
function AttemptModal({ a, onClose }) {
  return (
    <div className="ad-modal-overlay" onClick={onClose}>
      <div className="ad-modal" onClick={e => e.stopPropagation()}>
        <div className="ad-modal-header">
          <div><h2 className="ad-modal-title">{a.fullName}</h2><p className="ad-modal-sub">{a.email}</p></div>
          <button className="ad-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="ad-modal-grid">
          {[
            ["Score",`${a.score}/${a.totalQuestions}`],["Result",a.passed?"Passed":"Not Passed"],
            ["Certificate",a.certificateType==="achievement"?"Achievement":"Participation"],
            ["Time Taken",fmtSecs(a.timeTakenSeconds)],["Status",a.status],
            ["Email Sent",a.emailSent?"Yes":"No"],
            ["Started",fmtDateTime(a.startedAt)],
            ["Completed",a.completedAt?fmtDateTime(a.completedAt):"—"],
          ].map(([k,v]) => (
            <div key={k} className="ad-modal-item"><span>{k}</span><strong>{v}</strong></div>
          ))}
          {a.certificateId && (
            <div className="ad-modal-item" style={{gridColumn:"1/-1"}}>
              <span>Certificate ID</span>
              <strong style={{fontFamily:"monospace",letterSpacing:2,fontSize:"1rem"}}>{a.certificateId}</strong>
            </div>
          )}
        </div>
        <button className="ad-btn ad-btn--refresh" style={{ width:"100%",marginTop:8 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// ── Certificate Verification Panel ────────────────────────────────────────────
function CertVerifyPanel() {
  const [certId, setCertId] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [err, setErr]       = useState("");

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!certId.trim()) return;
    setStatus("loading"); setResult(null); setErr("");
    try {
      // JWT auto-attached by interceptor — no password param needed
      const res = await verifyCertificate(certId.trim().toUpperCase());
      setResult(res.data.data);
      setStatus("found");
    } catch (e) {
      if (e.status===404||e.message?.includes("not found")) { setStatus("notfound"); setErr("No certificate found with this ID. It may be invalid or fraudulent."); }
      else { setStatus("error"); setErr(e.message||"Verification failed."); }
    }
  };

  const fmtDate2 = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day:"numeric", month:"long", year:"numeric" }) : "—";

  return (
    <div className="ad-verify-panel">
      <div className="ad-verify-hero">
        <div className="ad-verify-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div>
          <h2 className="ad-verify-title">Certificate Verification</h2>
          <p className="ad-verify-sub">Verify the authenticity of any MHA certificate using its unique ID</p>
        </div>
      </div>
      <form className="ad-verify-form" onSubmit={handleVerify}>
        <input type="text" value={certId} onChange={e=>{setCertId(e.target.value.toUpperCase());setResult(null);setStatus("idle");setErr("");}} placeholder="e.g. MHA-2025-3F8A2C" className="ad-verify-input" maxLength={20} autoFocus />
        <button type="submit" className="ad-btn ad-btn--primary ad-verify-btn" disabled={status==="loading"||!certId.trim()}>
          {status==="loading"?<><span className="ad-spinner"/>Verifying…</>:<><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Verify Certificate</>}
        </button>
      </form>
      {status==="notfound"&&(<div className="ad-verify-result ad-verify-result--fail"><div className="ad-verify-result-icon ad-verify-result-icon--fail"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><h3>Invalid Certificate</h3><p>{err}</p></div>)}
      {status==="error"&&(<div className="ad-verify-result ad-verify-result--fail"><p>{err}</p></div>)}
      {status==="found"&&result&&(
        <div className="ad-verify-result ad-verify-result--pass">
          <div className="ad-verify-result-icon ad-verify-result-icon--pass"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h3 className="ad-verify-result-heading">Certificate Verified <span className={`ad-badge ${result.certificateType==="achievement"?"ad-badge--purple":"ad-badge--blue"} ad-verify-badge`}>{result.certificateType==="achievement"?"🏆 Achievement":"📜 Participation"}</span></h3>
          <div className="ad-verify-grid">
            {[["Certificate ID",result.certificateId],["Recipient Name",result.fullName],["Email",result.email],["Score",`${result.score}/${result.totalQuestions}`],["Result",result.passed?"Passed ✓":"Participated"],["State",result.state],["District",result.district],["Date of Issue",fmtDate2(result.completedAt)]].map(([k,v])=>(
              <div key={k} className="ad-verify-item"><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
        </div>
      )}
      <AllCertificatesTable />
    </div>
  );
}

function AllCertificatesTable() {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage]     = useState(1);
  const [pag, setPag]       = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // JWT auto-attached — no password param
      const res = await fetchAttempts({ page, limit: 20, search, status: "completed" });
      setData(res.data.data||[]); setPag(res.data.pagination||{});
    } catch (_) {}
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="ad-all-certs">
      <div className="ad-all-certs-header">
        <h3 className="ad-all-certs-title">All Issued Certificates</h3>
        <input type="text" value={search} placeholder="Search name, email or cert ID…" onChange={e=>{setSearch(e.target.value);setPage(1);}} className="ad-search-input" style={{maxWidth:280}} />
      </div>
      <div className="ad-table-wrap">
        {loading?<div className="ad-loading"><span className="ad-spinner ad-spinner--dark"/><span>Loading…</span></div>
        :data.length===0?<div className="ad-empty"><p>No completed certificates found.</p></div>
        :<table className="ad-table">
          <thead><tr><th>#</th><th>Name</th><th>Certificate ID</th><th>Type</th><th>Score</th><th>Result</th><th>Issued On</th></tr></thead>
          <tbody>
            {data.map((a,i)=>(
              <tr key={a._id}>
                <td className="ad-td-num">{(page-1)*20+i+1}</td>
                <td><div className="ad-td-name"><div className="ad-avatar">{a.fullName.charAt(0).toUpperCase()}</div>{a.fullName}</div></td>
                <td><span className="ad-cert-id-mono">{a.certificateId||"—"}</span></td>
                <td><span className={`ad-badge ${a.certificateType==="achievement"?"ad-badge--purple":"ad-badge--blue"}`}>{a.certificateType==="achievement"?"Achievement":"Participation"}</span></td>
                <td><strong>{a.score}/{a.totalQuestions}</strong></td>
                <td><span className={`ad-badge ${a.passed?"ad-badge--green":"ad-badge--amber"}`}>{a.passed?"Passed":"Not Passed"}</span></td>
                <td className="ad-td-date">{a.completedAt?fmtDate(a.completedAt):"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
      {pag.pages>1&&(<div className="ad-pagination"><span>Showing {(page-1)*20+1}–{Math.min(page*20,pag.total)} of {pag.total}</span><div className="ad-page-btns"><button className="ad-page-btn" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Prev</button>{Array.from({length:Math.min(pag.pages,7)},(_,i)=>i+1).map(p=>(<button key={p} className={`ad-page-btn ${p===page?"ad-page-btn--active":""}`} onClick={()=>setPage(p)}>{p}</button>))}<button className="ad-page-btn" disabled={page>=pag.pages} onClick={()=>setPage(p=>p+1)}>Next →</button></div></div>)}
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [pwd, setPwd]     = useState("");
  const [err, setErr]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pwd.trim()) { setErr("Password required"); return; }
    setLoading(true); setErr("");
    try {
      await adminLogin(pwd); // stores JWT internally via api.js
      onLogin();             // no password passed to Dashboard
    } catch (e) {
      setErr(e.message || "Incorrect password");
    } finally { setLoading(false); }
  };

  return (
    <div className="ad-login-page">
      <div className="ad-login-card">
        <div className="ad-login-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </div>
        <h1 className="ad-login-title">Admin Dashboard</h1>
        <p className="ad-login-sub">Mandi Hariyanna Academy</p>
        <form onSubmit={submit} className="ad-login-form">
          <div className="ad-input-wrap">
            <svg className="ad-input-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input type="password" value={pwd} onChange={e=>{setPwd(e.target.value);setErr("");}} placeholder="Admin password" className={`ad-input${err?" ad-input--error":""}`} autoFocus />
          </div>
          {err && <p className="ad-login-error">{err}</p>}
          <button type="submit" className="ad-btn ad-btn--primary" disabled={loading}>
            {loading?<><span className="ad-spinner"/>Verifying…</>:"Enter Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Dashboard — no password prop, JWT handles everything ─────────────────
function Dashboard({ onLogout }) {
  const [tab, setTab]         = useState("registrations");
  const [loading, setLoading] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [attempts,      setAttempts]      = useState([]);
  const [questions,     setQuestions]     = useState([]);
  const [regPag,   setRegPag]   = useState({});
  const [attPag,   setAttPag]   = useState({});
  const [regStats, setRegStats] = useState({});
  const [attStats, setAttStats] = useState({});
  const [regPage,  setRegPage]  = useState(1);
  const [attPage,  setAttPage]  = useState(1);
  const [regSearch, setRegSearch] = useState("");
  const [attSearch, setAttSearch] = useState("");
  const [regGender, setRegGender] = useState("");
  const [attStatus, setAttStatus] = useState("");
  const [attPassed, setAttPassed] = useState("");
  const [selectedReg, setSelectedReg] = useState(null);
  const [selectedAtt, setSelectedAtt] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]         = useState(false);
  const [showAddQ,  setShowAddQ]  = useState(false);
  const [editQ,     setEditQ]     = useState(null);
  const [qSaving,   setQSaving]   = useState(false);
  const [settingsPS, setSettingsPS] = useState("");
  const [settingsTL, setSettingsTL] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg,    setSettingsMsg]    = useState("");
  const [exportingRegs, setExportingRegs]   = useState(false);
  const [exportingAtts, setExportingAtts]   = useState(false);

  // JWT auto-attached — no password param in any call
  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchRegistrations({ page:regPage, limit:15, search:regSearch, gender:regGender });
      setRegistrations(res.data.data||[]); setRegPag(res.data.pagination||{}); setRegStats(res.data.stats||{});
    } catch (e) { if (e.message?.includes("session expired")||e.message?.includes("token")) onLogout(); }
    finally { setLoading(false); }
  }, [regPage, regSearch, regGender, onLogout]);

  const loadAttempts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchAttempts({ page:attPage, limit:15, search:attSearch, status:attStatus, passed:attPassed });
      setAttempts(res.data.data||[]); setAttPag(res.data.pagination||{}); setAttStats(res.data.stats||{});
    } catch (e) { if (e.message?.includes("session expired")||e.message?.includes("token")) onLogout(); }
    finally { setLoading(false); }
  }, [attPage, attSearch, attStatus, attPassed, onLogout]);

  const loadQuestions = useCallback(async () => {
    try {
      const res = await fetchAdminQuizConfig();
      setQuestions(res.data.data?.questions||[]); setSettingsPS(res.data.data?.passingScore??""); setSettingsTL(res.data.data?.timeLimitMinutes??"");
    } catch (_) {}
  }, []);

  useEffect(() => { if(tab==="registrations") loadRegistrations(); }, [tab, loadRegistrations]);
  useEffect(() => { if(tab==="attempts")      loadAttempts(); },      [tab, loadAttempts]);
  useEffect(() => { if(tab==="questions"||tab==="settings") loadQuestions(); }, [tab, loadQuestions]);

  const handleExportRegs = async () => {
    setExportingRegs(true);
    try {
      const res = await fetchRegistrations({ page:1, limit:10000, search:regSearch, gender:regGender });
      exportToExcel(res.data.data, [
        {label:"Full Name",value:r=>r.fullName,width:22},{label:"Phone",value:r=>r.phone,width:16},
        {label:"Email",value:r=>r.email,width:30},{label:"Gender",value:r=>r.gender,width:14},
        {label:"State",value:r=>r.state,width:20},{label:"District",value:r=>r.district,width:18},
        {label:"Qualification",value:r=>r.qualification,width:18},
        {label:"Quiz Started",value:r=>r.quizStarted?"Yes":"No",width:14},
        {label:"Quiz Done",value:r=>r.quizCompleted?"Yes":"No",width:12},
        {label:"Score",value:r=>r.score!=null?`${r.score}/${r.totalQuestions}`:"—",width:10},
        {label:"Cert ID",value:r=>r.certificateId||"—",width:20},
        {label:"Registered",value:r=>fmtDateTime(r.createdAt),width:22},
      ], "Registrations", "MHA_Registrations.xlsx");
    } catch (_) {}
    finally { setExportingRegs(false); }
  };

  const handleExportAtts = async () => {
    setExportingAtts(true);
    try {
      const res = await fetchAttempts({ page:1, limit:10000, search:attSearch });
      exportToExcel(res.data.data, [
        {label:"Name",value:a=>a.fullName,width:22},{label:"Email",value:a=>a.email,width:30},
        {label:"Score",value:a=>`${a.score}/${a.totalQuestions}`,width:10},
        {label:"Passed",value:a=>a.passed?"Yes":"No",width:10},
        {label:"Certificate",value:a=>a.certificateType,width:16},
        {label:"Certificate ID",value:a=>a.certificateId||"—",width:22},
        {label:"Time Taken",value:a=>fmtSecs(a.timeTakenSeconds),width:14},
        {label:"Status",value:a=>a.status,width:14},
        {label:"Email Sent",value:a=>a.emailSent?"Yes":"No",width:12},
        {label:"Completed",value:a=>a.completedAt?fmtDateTime(a.completedAt):"—",width:22},
      ], "Attempts", "MHA_Attempts.xlsx");
    } catch (_) {}
    finally { setExportingAtts(false); }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await deleteRegistration(deleteTarget._id); setDeleteTarget(null); loadRegistrations(); }
    catch (_) {}
    finally { setDeleting(false); }
  };

  const handleAddQuestion    = async (data) => { setQSaving(true); try { await addQuestion(data); setShowAddQ(false); loadQuestions(); } catch(_){} finally{setQSaving(false);} };
  const handleEditQuestion   = async (data) => { setQSaving(true); try { await updateQuestion(editQ._id, data); setEditQ(null); loadQuestions(); } catch(_){} finally{setQSaving(false);} };
  const handleDeleteQuestion = async (qId)  => { if(!window.confirm("Delete this question?")) return; try { await deleteQuestion(qId); loadQuestions(); } catch(_){} };
  const saveSettings = async () => {
    setSettingsSaving(true); setSettingsMsg("");
    try { await updateQuizSettings({ passingScore:Number(settingsPS), timeLimitMinutes:Number(settingsTL) }); setSettingsMsg("✅ Settings saved successfully!"); }
    catch(_) { setSettingsMsg("❌ Failed to save settings."); }
    finally { setSettingsSaving(false); setTimeout(()=>setSettingsMsg(""),3000); }
  };

  const TABS = [
    {id:"registrations",label:"Registrations",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>},
    {id:"attempts",label:"Quiz Attempts",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>},
    {id:"certificates",label:"Certificates",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>},
    {id:"questions",label:"Questions",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>},
    {id:"settings",label:"Settings",icon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>},
  ];

  return (
    <div className="ad-page">
      <div className="ad-topbar">
        <div className="ad-topbar-left">
          <div className="ad-topbar-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></div>
          <div><div className="ad-topbar-title">MHA Admin</div><div className="ad-topbar-sub">Mandi Hariyanna Academy</div></div>
        </div>
        <div className="ad-topbar-right">
          <button className="ad-btn ad-btn--refresh" onClick={()=>{if(tab==="registrations")loadRegistrations();else if(tab==="attempts")loadAttempts();}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Refresh
          </button>
          <button className="ad-btn ad-btn--logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {tab==="registrations"&&(<div className="ad-content" style={{paddingBottom:0}}><div className="ad-stats-row">{[{label:"Total Registered",value:regStats.totalRegistrations||0,color:"ad-stat--blue"},{label:"Quiz Started",value:regStats.quizStarted||0,color:"ad-stat--amber"},{label:"Quiz Completed",value:regStats.quizCompleted||0,color:"ad-stat--green"},{label:"Male",value:regStats.byGender?.Male||0,color:"ad-stat--blue"},{label:"Female",value:regStats.byGender?.Female||0,color:"ad-stat--purple"},{label:"Non-binary",value:(regStats.byGender?.["Non-binary"]||0)+(regStats.byGender?.["Prefer not to say"]||0),color:"ad-stat--gray"}].map(s=>(<div key={s.label} className={`ad-stat ${s.color}`}><div className="ad-stat-value">{s.value}</div><div className="ad-stat-label">{s.label}</div></div>))}</div></div>)}
      {tab==="attempts"&&(<div className="ad-content" style={{paddingBottom:0}}><div className="ad-stats-row" style={{gridTemplateColumns:"repeat(4,1fr)"}}>{[{label:"Total Attempts",value:attStats.totalAttempts||0,color:"ad-stat--blue"},{label:"Passed",value:attStats.passed||0,color:"ad-stat--green"},{label:"Not Passed",value:attStats.failed||0,color:"ad-stat--amber"},{label:"Avg Score",value:attStats.avgScore||0,color:"ad-stat--purple"}].map(s=>(<div key={s.label} className={`ad-stat ${s.color}`}><div className="ad-stat-value">{s.value}</div><div className="ad-stat-label">{s.label}</div></div>))}</div></div>)}

      <div className="ad-tabs">{TABS.map(t=>(<button key={t.id} className={`ad-tab ${tab===t.id?"ad-tab--active":""}`} onClick={()=>setTab(t.id)}>{t.icon}{t.label}</button>))}</div>

      <div className="ad-content">
        {tab==="registrations"&&(
          <>
            <div className="ad-toolbar">
              <input type="text" placeholder="Search name, email, phone, code…" value={regSearch} onChange={e=>{setRegSearch(e.target.value);setRegPage(1);}} className="ad-search-input" />
              <select value={regGender} onChange={e=>{setRegGender(e.target.value);setRegPage(1);}} className="ad-select"><option value="">All Genders</option>{["Male","Female","Non-binary","Prefer not to say"].map(g=><option key={g} value={g}>{g}</option>)}</select>
              <ExportButton onClick={handleExportRegs} loading={exportingRegs} label={`Export${regPag.total?` (${regPag.total})`:""} to Excel`} />
            </div>
            <div className="ad-table-wrap">
              {loading?<div className="ad-loading"><span className="ad-spinner ad-spinner--dark"/><span>Loading…</span></div>
              :registrations.length===0?<div className="ad-empty"><p>No registrations found.</p></div>
              :<table className="ad-table">
                <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Gender</th><th>State</th><th>Quiz</th><th>Score</th><th>Cert ID</th><th>Registered</th><th></th></tr></thead>
                <tbody>{registrations.map((r,i)=>(<tr key={r._id} className="ad-tr--click" onClick={()=>setSelectedReg(r)}><td className="ad-td-num">{(regPage-1)*15+i+1}</td><td><div className="ad-td-name"><div className="ad-avatar">{r.fullName.charAt(0).toUpperCase()}</div>{r.fullName}</div></td><td className="ad-td-email">{r.email}</td><td><span className={`ad-badge ${GENDER_COLORS[r.gender]||"ad-badge--gray"}`}>{r.gender}</span></td><td className="ad-td-state">{r.state}</td><td><span className={`ad-badge ${r.quizCompleted?"ad-badge--green":r.quizStarted?"ad-badge--amber":"ad-badge--gray"}`}>{r.quizCompleted?"Completed":r.quizStarted?"In Progress":"Not Started"}</span></td><td>{r.score!=null?<strong>{r.score}/{r.totalQuestions}</strong>:"—"}</td><td>{r.certificateId?<span className="ad-cert-id-mono">{r.certificateId}</span>:"—"}</td><td className="ad-td-date">{fmtDate(r.createdAt)}</td><td><button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={e=>{e.stopPropagation();setSelectedReg(r);}}>View</button></td></tr>))}</tbody>
              </table>}
            </div>
            {regPag.pages>1&&(<div className="ad-pagination"><span>Showing {(regPage-1)*15+1}–{Math.min(regPage*15,regPag.total)} of {regPag.total}</span><div className="ad-page-btns"><button className="ad-page-btn" disabled={regPage<=1} onClick={()=>setRegPage(p=>p-1)}>← Prev</button>{Array.from({length:regPag.pages},(_,i)=>i+1).map(p=>(<button key={p} className={`ad-page-btn ${p===regPage?"ad-page-btn--active":""}`} onClick={()=>setRegPage(p)}>{p}</button>))}<button className="ad-page-btn" disabled={regPage>=regPag.pages} onClick={()=>setRegPage(p=>p+1)}>Next →</button></div></div>)}
          </>
        )}

        {tab==="attempts"&&(
          <>
            <div className="ad-toolbar">
              <input type="text" placeholder="Search name, email or cert ID…" value={attSearch} onChange={e=>{setAttSearch(e.target.value);setAttPage(1);}} className="ad-search-input" />
              <select value={attStatus} onChange={e=>{setAttStatus(e.target.value);setAttPage(1);}} className="ad-select"><option value="">All Status</option><option value="completed">Completed</option><option value="in-progress">In Progress</option><option value="timed-out">Timed Out</option></select>
              <select value={attPassed} onChange={e=>{setAttPassed(e.target.value);setAttPage(1);}} className="ad-select"><option value="">All Results</option><option value="true">Passed</option><option value="false">Not Passed</option></select>
              <ExportButton onClick={handleExportAtts} loading={exportingAtts} label={`Export${attPag.total?` (${attPag.total})`:""} to Excel`} />
            </div>
            <div className="ad-table-wrap">
              {loading?<div className="ad-loading"><span className="ad-spinner ad-spinner--dark"/><span>Loading…</span></div>
              :attempts.length===0?<div className="ad-empty"><p>No quiz attempts found.</p></div>
              :<table className="ad-table">
                <thead><tr><th>#</th><th>Name</th><th>Certificate ID</th><th>Score</th><th>Result</th><th>Certificate</th><th>Time</th><th>Status</th><th>Email</th><th>Completed</th><th></th></tr></thead>
                <tbody>{attempts.map((a,i)=>(<tr key={a._id} className="ad-tr--click" onClick={()=>setSelectedAtt(a)}><td className="ad-td-num">{(attPage-1)*15+i+1}</td><td><div className="ad-td-name"><div className="ad-avatar">{a.fullName.charAt(0).toUpperCase()}</div>{a.fullName}</div></td><td><span className="ad-cert-id-mono">{a.certificateId||"—"}</span></td><td><strong>{a.score}/{a.totalQuestions}</strong></td><td><span className={`ad-badge ${a.passed?"ad-badge--green":"ad-badge--amber"}`}>{a.passed?"Passed":"Not Passed"}</span></td><td><span className={`ad-badge ${a.certificateType==="achievement"?"ad-badge--purple":"ad-badge--blue"}`}>{a.certificateType==="achievement"?"Achievement":"Participation"}</span></td><td>{fmtSecs(a.timeTakenSeconds)}</td><td><span className={`ad-badge ${a.status==="completed"?"ad-badge--green":a.status==="in-progress"?"ad-badge--amber":"ad-badge--gray"}`}>{a.status}</span></td><td><span className={`ad-badge ${a.emailSent?"ad-badge--green":"ad-badge--gray"}`}>{a.emailSent?"Sent":"Pending"}</span></td><td className="ad-td-date">{a.completedAt?fmtDate(a.completedAt):"—"}</td><td><button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={e=>{e.stopPropagation();setSelectedAtt(a);}}>View</button></td></tr>))}</tbody>
              </table>}
            </div>
            {attPag.pages>1&&(<div className="ad-pagination"><span>Showing {(attPage-1)*15+1}–{Math.min(attPage*15,attPag.total)} of {attPag.total}</span><div className="ad-page-btns"><button className="ad-page-btn" disabled={attPage<=1} onClick={()=>setAttPage(p=>p-1)}>← Prev</button>{Array.from({length:attPag.pages},(_,i)=>i+1).map(p=>(<button key={p} className={`ad-page-btn ${p===attPage?"ad-page-btn--active":""}`} onClick={()=>setAttPage(p)}>{p}</button>))}<button className="ad-page-btn" disabled={attPage>=attPag.pages} onClick={()=>setAttPage(p=>p+1)}>Next →</button></div></div>)}
          </>
        )}

        {tab==="certificates"&&<CertVerifyPanel />}

        {tab==="questions"&&(
          <>
            <div className="ad-qm-header"><div className="ad-qm-title">Quiz Questions ({questions.length})</div>{!showAddQ&&!editQ&&(<button className="ad-btn ad-btn--primary" style={{height:36}} onClick={()=>setShowAddQ(true)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add Question</button>)}</div>
            {showAddQ&&<div style={{marginBottom:16}}><QuestionForm onSave={handleAddQuestion} onCancel={()=>setShowAddQ(false)} saving={qSaving} /></div>}
            {questions.length===0&&!showAddQ&&<div className="ad-empty"><p>No questions yet.</p></div>}
            <div className="ad-qm-list">{questions.map((q,i)=>(<div key={q._id}>{editQ?._id===q._id?<QuestionForm initial={q} onSave={handleEditQuestion} onCancel={()=>setEditQ(null)} saving={qSaving} />:<div className="ad-q-card"><div className="ad-q-card-head"><span className="ad-q-num-badge">Q{i+1} · {q.marks}M</span><span className="ad-q-text">{q.text}</span><div className="ad-q-card-acts"><button className="ad-btn ad-btn--sm ad-btn--refresh" onClick={()=>setEditQ(q)}>Edit</button><button className="ad-btn ad-btn--sm ad-btn--danger" onClick={()=>handleDeleteQuestion(q._id)}>Delete</button></div></div><div className="ad-q-opts">{(q.options||[]).map((opt,oi)=>(<div key={oi} className={`ad-q-opt ${oi===q.correctIndex?"ad-q-opt--correct":""}`}>{oi===q.correctIndex?"✓ ":""}{opt}</div>))}</div></div>}</div>))}</div>
          </>
        )}

        {tab==="settings"&&(
          <div className="ad-settings-card">
            <div className="ad-settings-title">Quiz Settings</div>
            <div className="ad-settings-grid" style={{marginBottom:20}}>
              <div className="ad-form-group"><label className="ad-form-label">Passing Score (marks)</label><input type="number" className="ad-form-input" value={settingsPS} min={1} onChange={e=>setSettingsPS(e.target.value)} /><span className="ad-form-hint">Students scoring ≥ this value get Certificate of Achievement</span></div>
              <div className="ad-form-group"><label className="ad-form-label">Time Limit (minutes)</label><input type="number" className="ad-form-input" value={settingsTL} min={1} max={180} onChange={e=>setSettingsTL(e.target.value)} /><span className="ad-form-hint">Quiz will auto-submit when time runs out</span></div>
            </div>
            {settingsMsg&&<p style={{fontSize:13,marginBottom:14,fontWeight:600,color:settingsMsg.startsWith("✅")?"#059669":"#ef4444"}}>{settingsMsg}</p>}
            <button className="ad-btn ad-btn--primary" style={{width:"auto",height:40,paddingLeft:32,paddingRight:32}} onClick={saveSettings} disabled={settingsSaving}>
              {settingsSaving?<><span className="ad-spinner"/>Saving…</>:"Save Settings"}
            </button>
          </div>
        )}
      </div>

      {selectedReg&&<RegModal reg={selectedReg} onClose={()=>setSelectedReg(null)} onDelete={r=>setDeleteTarget(r)} />}
      {selectedAtt&&<AttemptModal a={selectedAtt} onClose={()=>setSelectedAtt(null)} />}
      {deleteTarget&&<DeleteConfirmModal student={deleteTarget} onConfirm={handleDeleteStudent} onCancel={()=>setDeleteTarget(null)} deleting={deleting} />}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [loggedIn, setLoggedIn] = useState(
    () => !!sessionStorage.getItem("adminToken") // check if JWT exists
  );

  const login  = () => setLoggedIn(true);
  const logout = () => {
    clearAdminToken();
    sessionStorage.removeItem("adminToken");
    setLoggedIn(false);
  };

  if (!loggedIn) return <LoginScreen onLogin={login} />;
  return <Dashboard onLogout={logout} />;
}