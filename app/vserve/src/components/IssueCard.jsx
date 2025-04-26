import React, { useState, useEffect, useCallback } from "react";
import { doc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebaseConfig";
import EmailModal from "./EmailModal";

// Format date function
const formatDate = (dateString) => {
  if (!dateString) return "No date";
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Format remaining time
const formatRemainingTime = (deadline) => {
  if (!deadline) return { text: "No deadline", isOverdue: false };

  const now = new Date();
  const deadlineDate = new Date(deadline);
  const timeDiff = deadlineDate - now; // Difference in milliseconds

  if (timeDiff <= 0) {
    return { text: "Overdue", isOverdue: true };
  }

  const hours = Math.floor(timeDiff / (1000 * 60 * 60));
  const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
  return { text: `${hours}h ${minutes}m remaining`, isOverdue: false };
};

// Priority labels
const getPriorityLabel = (priority) => {
  switch(priority) {
    case 1: return "High";
    case 2: return "Medium";
    case 3: return "Low";
    default: return "Normal";
  }
};

const IssueCard = ({ ticket, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [remainingTime, setRemainingTime] = useState(
    formatRemainingTime(ticket.deadline)
  );

  // Update remaining time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingTime(formatRemainingTime(ticket.deadline));
    }, 60000); // Update every 60 seconds

    return () => clearInterval(interval);
  }, [ticket.deadline]);

  const toggleDescription = () => {
    setExpanded(prev => !prev);
  };

  const handleModalClose = useCallback(() => {
    setShowEmailModal(false);
  }, []);

  const handleDisapprove = async () => {
    if (!ticket.id || isDeleting) return;
    
    // Check if user is authenticated
    const currentUser = auth.currentUser;
    if (!currentUser) {
      alert("You must be logged in to delete tickets.");
      return;
    }

    setIsDeleting(true);
    try {
      const ticketRef = doc(db, "tickets", ticket.id);
      await deleteDoc(ticketRef);
      if (onDelete) {
        onDelete(ticket.id);
      }
    } catch (error) {
      console.error("Error deleting ticket:", error);
      if (error.code === "permission-denied") {
        alert("You don't have permission to delete this ticket. Only ticket owners and admins can delete tickets.");
      } else {
        alert("Failed to delete ticket. Please try again.");
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApprove = () => {
    setShowEmailModal(true);
  };

  return (
    <>
      <div className="ticket-card">
        <div 
          className={`card-status-indicator ${
            ticket.status === "Open" 
              ? "status-indicator-open" 
              : ticket.status === "In Progress"
                ? "status-indicator-progress"
                : "status-indicator-closed"
          }`}
        ></div>
        
        <div className="card-header">
          <span className="ticket-date">{formatDate(ticket.created_at)}</span>
          <h3 className="ticket-title">{ticket.issue_title}</h3>
        </div>
        
        <div className="card-content">
          <div className="ticket-field">
            <div className="field-label">Name:</div>
            <div className="field-content">{ticket.first_name || "Anonymous"}</div>
          </div>
          
          <div className="ticket-field">
            <div className="field-label">Address:</div>
            <div className="field-content">{ticket.address || "Not provided"}</div>
          </div>
          
          <div className="ticket-field">
            <div className="field-label">Issue:</div>
            <div className={`field-content expandable-content ${expanded ? 'expanded' : ''}`}>
              {ticket.issue_description}
            </div>
            {ticket.issue_description && ticket.issue_description.length > 80 && (
              <button className="expand-button" onClick={toggleDescription}>
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
          
          <div className="ticket-field">
            <div className="field-label">Status:</div>
            <div className="field-content">
              <span
                className={`status-badge ${
                  ticket.status === "Open" 
                    ? "status-open" 
                    : ticket.status === "In Progress"
                      ? "status-in-progress"
                      : "status-closed"
                }`}
              >
                {ticket.status || "Open"}
              </span>
            </div>
          </div>
          
          {ticket.scheduled_time && (
            <div className="ticket-field">
              <div className="field-label">Scheduled:</div>
              <div className="field-content">{ticket.scheduled_time}</div>
            </div>
          )}
          
          <div className="ticket-field">
            <div className="field-label">Deadline:</div>
            <div className="field-content">
              <span
                className={`deadline-text ${remainingTime.isOverdue ? "deadline-overdue" : "deadline-pending"}`}
              >
                {remainingTime.text}
              </span>
            </div>
          </div>
        </div>
        
        <div className="card-footer">
          <button 
            className="action-button approve-button" 
            onClick={handleApprove}
            disabled={isDeleting || ticket.status !== "Open"}
          >
            Approve
          </button>
          <button 
            className="action-button disapprove-button" 
            onClick={handleDisapprove}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Disapprove'}
          </button>
        </div>
      </div>

      {showEmailModal && (
        <EmailModal 
          isOpen={showEmailModal}
          onClose={handleModalClose}
          ticket={ticket}
          onSend={() => {
            // After successful email, refresh tickets
            if (onDelete) {
              onDelete(ticket.id);
            }
          }}
        />
      )}
    </>
  );
};

export default IssueCard;