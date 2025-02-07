import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebaseConfig"; // Import Firebase auth
import { onAuthStateChanged } from "firebase/auth"; // Import onAuthStateChanged from Firebase
import "./chat.css";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState([]); // To store the list of previous chats
  const [messages, setMessages] = useState([]); // To store current chat messages
  const navigate = useNavigate();

  useEffect(() => {
    // Check if the user is authenticated
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login");  // Redirect to login if not authenticated
      }
    });

    // Fetch chat history when the component loads
    const fetchChatHistory = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const response = await axios.get("http://localhost:5000/history", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setChats(response.data.history); // Update with chat list
      } catch (error) {
        console.error(error);
      }
    };

    fetchChatHistory();

    return () => unsubscribe(); // Cleanup the listener on component unmount
  }, [navigate]);

  // Function to load previous chats
  const loadChat = (chat) => {
    setMessages(chat.messages);
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await axios.post(
        "http://127.0.0.1:5000/chat",
        { query: message },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages((prevMessages) => [
        ...prevMessages,
        { text: message, role: "user" },
        { text: response.data.response, role: "assistant" },
      ]);
      setMessage(""); // Clear the input field after sending message
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-container">
      {/* Side Panel */}
      <div className="side-panel">
        <h3>Chats</h3>
        <div className="chat-list">
          {chats.map((chat, index) => (
            <div key={index} className="chat-item" onClick={() => loadChat(chat)}>
              {chat.title}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="chat-area">
        <h2>Chat with Assistant</h2>
        <div className="messages">
          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "user-message" : "assistant-message"}>
              {message.text}
            </div>
          ))}
        </div>

        {/* Input Container */}
        <div className="input-container">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message"
          />
          <button onClick={handleSendMessage} disabled={loading}>
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;
