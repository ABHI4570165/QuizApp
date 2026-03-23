import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import EventRegistrationForm from "./pages/EventRegistrationForm";
import QuizPage from "./pages/QuizPage";
import AdminDashboard from "./pages/AdminDashboard";

export default function App() {
  return (
    <>
      <ToastContainer position="top-right" autoClose={4000} hideProgressBar={false} theme="colored" />
      <Routes>
        <Route path="/"        element={<EventRegistrationForm />} />
        <Route path="/quiz"    element={<QuizPage />} />
        <Route path="/admin"   element={<AdminDashboard />} />
        <Route path="*"        element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
