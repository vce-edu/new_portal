import './index.css'
import LoginForm from './pages/Login.jsx'
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Dashboard from "./pages/Dashboard.jsx";
import Students from './pages/Students.jsx';
import Transactions from './pages/Transactions.jsx';
import Revenue from './pages/Revenue.jsx';
import Exams from './pages/Exam.jsx';
import NavHistory from './components/NavHistory.jsx';
import ScholarshipApplicants from './pages/Scholarship.jsx';
import NavMenu from './components/NavMenu.jsx';
import UserAvatar from './components/UserAvatar.jsx';
import Branches from './pages/Branches.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return null; // or a spinner
  if (!user) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  return (
    <>
    <Routes>
      <Route path="/" element={<LoginForm />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <Transactions />
          </ProtectedRoute>
        }
      />
      <Route
        path='/revenue'
        element={
          <ProtectedRoute>
            <Revenue/>
          </ProtectedRoute>
        }
      />
      <Route
        path='/exam'
        element={
          <ProtectedRoute>
            <Exams/>
          </ProtectedRoute>
        }
        />
        <Route
        path='/scholarship'
        element={
          <ProtectedRoute>
            <ScholarshipApplicants/>
          </ProtectedRoute>
        }
      />
      <Route
        path='/branches'
        element={
          <ProtectedRoute>
            <Branches/>
          </ProtectedRoute>
        }
      />
    </Routes>
    <NavHistory/>
    <NavMenu/>
    <UserAvatar/>
    </>
  );
}