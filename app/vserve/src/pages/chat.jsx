import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebaseConfig";
import { onAuthStateChanged, signOut } from "firebase/auth"; // Import signOut
import "./chat.css";

const Chat = () => {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        navigate("/login");
      }
    });

    const fetchChatHistory = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;

        const response = await axios.get("http://localhost:5000/history", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setChats(response.data.history);
      } catch (error) {
        console.error(error);
      }
    };

    fetchChatHistory();

    return () => unsubscribe();
  }, [navigate]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/login"); // Redirect to login after signing out
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

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
      setMessage("");
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
        <button className="sign-out-btn" onClick={handleSignOut}>
          Sign Out
        </button>
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
