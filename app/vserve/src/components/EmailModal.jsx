import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import './EmailModal.css';

const EmailModalPortal = ({ children }) => {
  const modalRoot = document.getElementById('modal-root');
  const elRef = useRef(null);
  
  if (!elRef.current) {
    elRef.current = document.createElement('div');
  }
  
  useEffect(() => {
    if (!modalRoot) {
      const root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    
    const target = modalRoot || document.getElementById('modal-root');
    target.appendChild(elRef.current);
    
    return () => {
      target.removeChild(elRef.current);
    };
  }, [modalRoot]);
  
  return createPortal(children, elRef.current);
};

const EmailModal = ({ isOpen, onClose, ticket, onSend }) => {
  const [emailContent, setEmailContent] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef(null);

  const handleOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  }, [onClose, loading]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !loading) {
      onClose();
    }
  }, [onClose, loading]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      
      const timer = setTimeout(() => {
        if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 100);
      
      return () => {
        clearTimeout(timer);
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'auto';
      };
    }
  }, [isOpen, handleKeyDown]);

  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  useEffect(() => {
    const fetchUserEmail = async () => {
      if (!ticket?.user_id) {
        setError('User ID not found in ticket. Please enter the email manually.');
        return;
      }
      
      setFetching(true);
      try {
        const userDoc = await getDoc(doc(db, 'chat_saves', ticket.user_id));
        if (userDoc.exists()) {
          const email = userDoc.data().email;
          if (email && isValidEmail(email)) {
            setCustomerEmail(email);
            setError('');
          } else {
            setError('No valid email found for this user. Please enter the email manually.');
          }
        } else {
          setError('User profile not found. Please enter the email manually.');
        }
      } catch (error) {
        console.error('Error fetching user email:', error);
        setError('Failed to fetch user email. Please enter the email manually.');
      } finally {
        setFetching(false);
      }
    };

    if (isOpen && ticket?.user_id) {
      fetchUserEmail();
      
      setEmailContent(
`Dear ${ticket?.first_name || 'Customer'},

We are pleased to inform you that your service request has been approved. Our team has reviewed your issue regarding "${ticket?.issue_description || 'your request'}" with the issue title "${ticket?.issue_title || 'N/A'}", and we will proceed with the necessary actions.

Your ticket details:
- Ticket ID: ${ticket?.id || 'N/A'}
- Issue: ${ticket?.issue_description || 'N/A'}
- Issue Title: ${ticket?.issue_title || 'N/A'}
- Scheduled Time: ${ticket?.scheduled_time || 'To be confirmed'}

We will contact you shortly with further details about the service appointment.

Thank you for choosing our services.

Best regards,
Customer Service Team`
      );
      
      setSuccess(false);
      setError('');
    }
  }, [isOpen, ticket]);

  const handleSend = async (e) => {
    e.preventDefault();
    
    if (!customerEmail) {
      setError('Customer email is required. Please enter a valid email address.');
      return;
    }
  
    if (!isValidEmail(customerEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    
    setLoading(true);
    setError('');
  
    const API_KEY = process.env.REACT_APP_SENDINBLUE_API_KEY; // ✅ move process.env into a variable
  
    try {
      const emailSubject = "Service Request Approval - V-Serve";
      const emailBody = `
        <h1 style="font-size: 28px; color: #213448; text-align: center;">Service Request Approval</h1>
        <p style="font-size: 18px; color: #333;">Dear <strong>${ticket?.first_name || 'Customer'}</strong>,</p>
        <p style="font-size: 16px; color: #555;">
          We are pleased to inform you that your service request has been approved. Our team has reviewed your issue regarding "<strong>${ticket?.issue_description || 'your request'}</strong>" with the issue title "<strong>${ticket?.issue_title || 'N/A'}</strong>", and we will proceed with the necessary actions.
        </p>
        <hr style="border: 1px solid #D3D8E0;">
        <p style="font-size: 18px; color: #547792;"><strong>Your ticket details:</strong></p>
        <ul style="font-size: 16px; color: #555;">
          <li><strong>Ticket ID:</strong> ${ticket?.id || 'N/A'}</li>
          <li><strong>Issue:</strong> ${ticket?.issue_description || 'N/A'}</li>
          <li><strong>Issue Title:</strong> ${ticket?.issue_title || 'N/A'}</li>
          <li><strong>Scheduled Time:</strong> ${ticket?.scheduled_time || 'To be confirmed'}</li>
        </ul>
        <hr style="border: 1px solid #D3D8E0;">
        <p style="font-size: 16px; color: #555;">
          We will contact you shortly with further details about the service appointment.
        </p>
        <p style="font-size: 16px; color: #555;">
          Thank you for choosing our services.
        </p>
        <p style="font-size: 18px; color: #333;"><strong>Best regards,</strong><br>
          <span style="font-size: 20px; color: #547792;"><strong>Customer Service Team, V-Serve</strong></span>
        </p>
      `;
  
      const data = {
        sender: { name: "Customer Service Team", email: "ushagpt1372@gmail.com" },
        to: [{ email: customerEmail, name: ticket?.first_name || 'Customer' }],
        subject: emailSubject,
        htmlContent: emailBody
      };
  
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "api-key": API_KEY  // ✅ use the variable here
        },
        body: JSON.stringify(data)
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send email');
      }
  
      setSuccess(true);
      
      await updateTicketStatus(ticket.id);
      setTimeout(() => {
        onClose();
        if (onSend) onSend();
      }, 1500);
    } catch (error) {
      console.error('Email error:', error.message);
      setError(error.message || 'Failed to send email');
      setLoading(false);
    }
  };
  

  const updateTicketStatus = async (ticketId) => {
    try {
      const ticketRef = doc(db, "tickets", ticketId);
      await updateDoc(ticketRef, {
        status: "In Progress",
        last_updated: new Date().toISOString()
      });
      return true;
    } catch (error) {
      console.error('Error updating ticket status:', error);
      throw error;
    }
  };

  if (!isOpen) return null;

  return (
    <EmailModalPortal>
      <div 
        className="email-modal-overlay" 
        onClick={handleOverlayClick}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={modalRef}
      >
        <div 
          className="email-modal"
          onClick={e => e.stopPropagation()}
        >
          <div className="email-modal-header">
            <h2>Send Approval Email</h2>
            <button 
              className="close-button" 
              onClick={onClose}
              type="button"
              aria-label="Close"
              disabled={loading}
            >
              ×
            </button>
          </div>
          
          {success ? (
            <div className="email-success">
              <div className="success-icon">✓</div>
              <h3>Email Sent Successfully!</h3>
              <p>The customer has been notified about their approved ticket.</p>
            </div>
          ) : (
            <form onSubmit={handleSend}>
              <div className="email-modal-content">
                <div className="email-field">
                  <label htmlFor="user_email">To:</label>
                  <div className="email-input-container">
                    <input 
                      id="user_email"
                      name="user_email"
                      type="email" 
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className={`email-input ${error ? 'input-error' : ''}`}
                      required
                      placeholder="Enter customer email"
                    />
                    {fetching && (
                      <div className="email-loading-indicator">
                        <span className="loading-spinner"></span>
                      </div>
                    )}
                  </div>
                  {error && <div className="email-field-error">{error}</div>}
                </div>
                
                <div className="email-field">
                  <label htmlFor="message">Message:</label>
                  <textarea
                    id="message"
                    name="message"
                    value={emailContent}
                    onChange={(e) => setEmailContent(e.target.value)}
                    className="email-textarea"
                    rows={12}
                    required
                  />
                </div>
              </div>
              
              <div className="email-modal-footer">
                <button 
                  type="button"
                  className="cancel-button" 
                  onClick={onClose}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="send-button"
                  disabled={loading || fetching}
                >
                  {loading ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </EmailModalPortal>
  );
};

export default EmailModal;