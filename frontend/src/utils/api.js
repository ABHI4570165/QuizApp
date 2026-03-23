import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response) return Promise.reject(err.response.data);
    if (err.request) return Promise.reject({ success: false, message: "Unable to reach the server." });
    return Promise.reject({ success: false, message: "Unexpected error." });
  }
);

// ── Registration ──────────────────────────────────────────────────────────────
export const registerForEvent = (data) => api.post("/events/register", data);

// ── Quiz ──────────────────────────────────────────────────────────────────────
export const getQuizConfig    = ()     => api.get("/events/quiz-config");
export const startQuiz        = (registrationId) => api.post("/events/quiz/start", { registrationId });
export const submitQuiz       = (data) => api.post("/events/quiz/submit", data);

// ── Admin ─────────────────────────────────────────────────────────────────────
export const adminLogin = (password) => api.post("/events/admin/login", { password });

const adminHeaders = (pwd) => ({ headers: { "x-admin-password": pwd } });

export const fetchRegistrations = (pwd, params = {}) =>
  api.get("/events/admin/registrations", { ...adminHeaders(pwd), params });

export const fetchAttempts = (pwd, params = {}) =>
  api.get("/events/admin/attempts", { ...adminHeaders(pwd), params });

export const fetchAdminQuizConfig = (pwd) =>
  api.get("/events/admin/quiz-config", adminHeaders(pwd));

export const updateQuizSettings = (pwd, data) =>
  api.put("/events/admin/quiz-settings", data, adminHeaders(pwd));

export const addQuestion = (pwd, data) =>
  api.post("/events/admin/questions", data, adminHeaders(pwd));

export const updateQuestion = (pwd, qId, data) =>
  api.put(`/events/admin/questions/${qId}`, data, adminHeaders(pwd));

export const deleteQuestion = (pwd, qId) =>
  api.delete(`/events/admin/questions/${qId}`, adminHeaders(pwd));

export default api;
