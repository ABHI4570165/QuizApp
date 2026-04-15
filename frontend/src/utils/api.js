import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5001/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ── Request Interceptor — auto-inject JWT ─────────────────────────────────────
api.interceptors.request.use((config) => {
  if (config.url?.includes("/admin/")) {
    const token = sessionStorage.getItem("adminToken");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
  } else {
    const token = sessionStorage.getItem("studentToken");
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ── Response Interceptor — handle token expiry ────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) {
      if (err.response.status === 401) {
        if (err.response.config?.url?.includes("/admin/"))
          sessionStorage.removeItem("adminToken");
        else
          sessionStorage.removeItem("studentToken");
      }
      return Promise.reject(err.response.data);
    }
    if (err.request)
      return Promise.reject({ success: false, message: "Unable to reach the server." });
    return Promise.reject({ success: false, message: "Unexpected error." });
  }
);

// ── Token helpers ─────────────────────────────────────────────────────────────
export const setStudentToken   = (t) => sessionStorage.setItem("studentToken", t);
export const setAdminToken     = (t) => sessionStorage.setItem("adminToken", t);
export const clearStudentToken = ()  => sessionStorage.removeItem("studentToken");
export const clearAdminToken   = ()  => sessionStorage.removeItem("adminToken");
export const getStudentToken   = ()  => sessionStorage.getItem("studentToken");

// ── Registration & Student Login ──────────────────────────────────────────────
export const registerForEvent = (data) => api.post("/events/register", data);
export const studentLogin = (email, confirmationCode) =>
  api.post("/events/login", { email, confirmationCode });

// ── Quiz (student JWT auto-attached by interceptor) ───────────────────────────
export const getQuizConfig  = ()     => api.get("/events/quiz-config");
export const startQuiz      = ()     => api.post("/events/quiz/start", {});
export const submitQuiz     = (data) => api.post("/events/quiz/submit", data);
export const getCertificate = (registrationId) =>
  api.get(`/events/certificate/${registrationId}`);
export const publicVerifyCertificate = (certId) =>
  api.get(`/events/certificate/verify/${certId}`);

// ── Admin (admin JWT auto-attached by interceptor) ────────────────────────────
export const adminLogin = async (password) => {
  const res = await api.post("/events/admin/login", { password });
  if (res.data?.token) setAdminToken(res.data.token);
  return res;
};

// Note: password param removed — JWT handles auth via interceptor
export const fetchRegistrations  = (params = {}) => api.get("/events/admin/registrations", { params });
export const fetchAttempts       = (params = {}) => api.get("/events/admin/attempts", { params });
export const fetchAdminQuizConfig = ()           => api.get("/events/admin/quiz-config");
export const updateQuizSettings  = (data)        => api.put("/events/admin/quiz-settings", data);
export const addQuestion         = (data)        => api.post("/events/admin/questions", data);
export const updateQuestion      = (qId, data)   => api.put(`/events/admin/questions/${qId}`, data);
export const deleteQuestion      = (qId)         => api.delete(`/events/admin/questions/${qId}`);
export const deleteRegistration  = (id)          => api.delete(`/events/admin/registrations/${id}`);
export const verifyCertificate   = (certId)      => api.get(`/events/admin/certificate/verify/${certId}`);

export default api;