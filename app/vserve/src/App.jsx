
import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Login from "./pages/login"; // Adjust path based on your file structure
import Chat from "./pages/chat"; // Adjust path based on your file structure

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} /> {/* Ensure /login route exists */}
        <Route path="/chat" element={<Chat />} />
      </Routes>
    </Router>
  );
}

export default App;
