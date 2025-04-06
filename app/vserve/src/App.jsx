import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import Chat from "./pages/chat";
import AdminPage from "./pages/admin";
import { auth } from "./firebaseConfig";
import { doc, getDoc, getFirestore } from "firebase/firestore";

// Initialize Firestore
const db = getFirestore();

// ProtectedRoute component to handle role-based access
const ProtectedRoute = ({ user, role, allowedRole, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (role !== allowedRole) {
    return <Navigate to="/chat" replace />;
  }
  return children;
};

function App() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          const userDocRef = doc(db, "chat_saves", currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else {
            // Default to "user" if no document exists (consistent with Login)
            setRole("user");
          }
        } else {
          setUser(null);
          setRole(null);
        }
      } catch (err) {
        setError("Failed to fetch user role: " + err.message);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "2rem", color: "red" }}>
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/login"
          element={user ? <Navigate to={role === "admin" ? "/admin" : "/chat"} replace /> : <Login />}
        />
        <Route
          path="/"
          element={user ? <Navigate to={role === "admin" ? "/admin" : "/chat"} replace /> : <Login />}
        />

        {/* Protected Routes */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute user={user} role={role} allowedRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute user={user} role={role} allowedRole="user">
              <Chat />
            </ProtectedRoute>
          }
        />

        {/* Catch-all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;