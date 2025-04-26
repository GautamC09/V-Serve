import React, { useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";
import { collection, query, onSnapshot } from "firebase/firestore";
import "./Admin.css";
import IssueCard from "../components/IssueCard";

const Admin = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  // Fetch tickets from Firestore
  useEffect(() => {
    const q = query(collection(db, "tickets"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const ticketList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          priority: Math.floor(Math.random() * 3) + 1, // Simulating priority for demo
        }));
        setTickets(ticketList);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching tickets:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Auth check
  useEffect(() => {
    const checkAuth = () => {
      if (!auth.currentUser) {
        navigate("/login");
      }
    };
    
    checkAuth();
    const authListener = auth.onAuthStateChanged(checkAuth);
    
    return () => authListener();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleTicketDelete = (ticketId) => {
    setTickets(prevTickets => prevTickets.filter(ticket => ticket.id !== ticketId));
  };

  // Filter tickets based on status
  const filteredTickets = filter === "all" 
    ? tickets 
    : tickets.filter(ticket => ticket.status && ticket.status.toLowerCase() === filter);

  // Calculate statistics
  const openTickets = tickets.filter(t => t.status === "Open").length;
  const inProgressTickets = tickets.filter(t => t.status === "In Progress").length;
  const closedTickets = tickets.filter(t => t.status === "Closed").length;
  const overdueTickets = tickets.filter(t => {
    if (!t.deadline) return false;
    const deadlineDate = new Date(t.deadline);
    const now = new Date();
    return deadlineDate < now && t.status !== "Closed";
  }).length;

  return (
    <div className="admin-container">
      <div className="header-section">
        <div className="header-left">
          <span className="header-emoji">🎫</span>
          <h1>Ticket Dashboard</h1>
        </div>
        <button className="logout-button" onClick={handleLogout}>
          Logout
        </button>
      </div>

      <div className="welcome-section">
        <p className="welcome-message">
          Hello, <span className="welcome-highlight">{auth.currentUser?.email?.split('@')[0] || 'Admin'}</span>! 
          You're viewing all support tickets.
        </p>
        <div className="stats-row">
          <div className="stat-pill stat-open">
            <span>{openTickets}</span>
            <span>Open</span>
          </div>
          <div className="stat-pill stat-progress">
            <span>{inProgressTickets}</span>
            <span>In Progress</span>
          </div>
          <div className="stat-pill stat-closed">
            <span>{closedTickets}</span>
            <span>Closed</span>
          </div>
          <div className="stat-pill stat-overdue">
            <span>{overdueTickets}</span>
            <span>Overdue</span>
          </div>
        </div>
      </div>

      <div className="filter-section">
        <span className="filter-label">Filter by:</span>
        <div className="filter-controls">
          <button 
            className={`filter-button ${filter === 'all' ? 'active' : ''}`} 
            onClick={() => setFilter('all')}
          >
            All Tickets
          </button>
          <button 
            className={`filter-button ${filter === 'open' ? 'active' : ''}`} 
            onClick={() => setFilter('open')}
          >
            Open
          </button>
          <button 
            className={`filter-button ${filter === 'in progress' ? 'active' : ''}`} 
            onClick={() => setFilter('in progress')}
          >
            In Progress
          </button>
          <button 
            className={`filter-button ${filter === 'closed' ? 'active' : ''}`} 
            onClick={() => setFilter('closed')}
          >
            Closed
          </button>
        </div>
      </div>
      
      <div className="tickets-container">
        {loading ? (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="no-tickets-message">
            <div className="empty-icon">📪</div>
            <p>No tickets found in this category</p>
          </div>
        ) : (
          <div className="ticket-grid">
            {filteredTickets.map((ticket) => (
              <IssueCard 
                key={ticket.id} 
                ticket={ticket} 
                onDelete={handleTicketDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Admin;