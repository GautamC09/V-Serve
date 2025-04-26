import React, { useState } from 'react';
import emailjs from '@emailjs/browser';

// Initialize EmailJS - make sure this matches your EmailModal.jsx
emailjs.init("3P9BUEyrrKFSY9ZX9");

const EmailTest = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sendTestEmail = async () => {
    setLoading(true);
    setResult(null);
    setError(null);
    
    try {
      // Log all parameters for debugging
      console.log("Service ID:", 'service_c7ececq');
      console.log("Template ID:", 'template_ih3nt2o');
      
      const templateParams = {
        to_name: 'Test User',
        to_email: 'test@example.com', // Change this to a real email for testing
        ticket_id: 'TEST-123',
        message: 'This is a test email from V-Serve',
        from_name: 'V-Serve Test',
        reply_to: 'noreply@example.com'
      };
      
      console.log("Template params:", templateParams);
      
      // Send the email
      const response = await emailjs.send(
        'service_c7ececq',
        'template_ih3nt2o',
        templateParams
      );
      
      setResult(response);
      console.log("Email sent successfully:", response);
    } catch (err) {
      setError(err);
      console.error("Error sending email:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h2>EmailJS Test</h2>
      
      <button 
        onClick={sendTestEmail}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: loading ? '#ccc' : '#5c4db1',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Sending...' : 'Send Test Email'}
      </button>
      
      {result && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#e6ffe6', borderRadius: '4px' }}>
          <h3>Success!</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
      
      {error && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#ffe6e6', borderRadius: '4px' }}>
          <h3>Error</h3>
          <p><strong>Name:</strong> {error.name}</p>
          <p><strong>Message:</strong> {error.message}</p>
          <p><strong>Status:</strong> {error.status}</p>
          <p><strong>Text:</strong> {error.text}</p>
          <pre>{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}
      
      <div style={{ marginTop: '20px' }}>
        <h3>Debugging Information</h3>
        <p><strong>EmailJS Version:</strong> {emailjs.version}</p>
        <p><strong>Service ID:</strong> service_c7ececq</p>
        <p><strong>Template ID:</strong> template_ih3nt2o</p>
        <p><strong>Public Key:</strong> 3P9BUEyrrKFSY9ZX9</p>
      </div>
    </div>
  );
};

export default EmailTest; 