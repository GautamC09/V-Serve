import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { auth } from "../firebaseConfig";
import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  getFirestore,
  setDoc,
} from "firebase/firestore";
import "./chat.css";

const db = getFirestore();

const Chat = () => {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [chats, setChats] = useState([]);
  const [userId, setUserId] = useState(null);
  const [currentChatId, setCurrentChatId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        navigate("/login");
        return;
      }
      setUserId(user.uid);
      fetchChatHistory(user.uid);
    });

    return () => unsubscribe();
  }, [navigate]);

  // Fetch user chat history
  const fetchChatHistory = async (uid) => {
    try {
      const docRef = doc(db, "chat_saves", uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const userChats = docSnap.data().chats || [];
        setChats(userChats);
        if (userChats.length > 0) {
          setCurrentChatId(userChats[0].id);
          setMessages(userChats[0].messages);
        }
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  // Start a new chat session
  const handleNewChat = async () => {
    const newChatId = Date.now().toString(); // Unique chat ID (timestamp)
    setCurrentChatId(newChatId);
    setMessages([]);

    try {
      const docRef = doc(db, "chat_saves", userId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        await setDoc(docRef, { chats: [] });
      }

      await updateDoc(docRef, {
        chats: arrayUnion({ id: newChatId, title: "New Chat", messages: [] }),
      });

      fetchChatHistory(userId);
    } catch (error) {
      console.error("Error creating new chat:", error);
    }
  };

  // Send user message & get AI response
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
  
      const userMessage = { text: message, role: "user" };
      const botResponse = { text: response.data.response, role: "assistant" };
      const updatedMessages = [...messages, userMessage, botResponse];
  
      setMessages(updatedMessages);
  
      const docRef = doc(db, "chat_saves", userId);
      const docSnap = await getDoc(docRef);
      const userChats = docSnap.exists() ? docSnap.data().chats : [];
  
      let updatedChats = [];
  
      if (!currentChatId) {
        // Create a new chat with a title based on the first message
        const chatId = Date.now().toString();
        const chatTitle = message.slice(0, 20) || "Untitled Chat";
  
        const newChat = { id: chatId, title: chatTitle, messages: updatedMessages };
        updatedChats = [...userChats, newChat];
        setCurrentChatId(chatId);
      } else {
        // Update an existing chat
        updatedChats = userChats.map((chat) =>
          chat.id === currentChatId ? { ...chat, messages: updatedMessages } : chat
        );
      }
  
      await updateDoc(docRef, { chats: updatedChats });
      setChats(updatedChats);
      setMessage("");
    } catch (error) {
      console.error("Message send error:", error);
    } finally {
      setLoading(false);
    }
  };
  

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      console.error("Sign out failed:", error);
    }
  };

  const handleDeleteChat = async (chatId) => {
    try {
      const docRef = doc(db, "chat_saves", userId);
      const docSnap = await getDoc(docRef);
  
      if (docSnap.exists()) {
        const updatedChats = docSnap.data().chats.filter((chat) => chat.id !== chatId);
  
        await updateDoc(docRef, { chats: updatedChats });
        setChats(updatedChats);
  
        if (currentChatId === chatId) {
          setCurrentChatId(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };
  
const [editingChatId, setEditingChatId] = useState(null);
const [newChatName, setNewChatName] = useState("");
const [menuOpen, setMenuOpen] = useState(null); // Track menu open state

const handleEditChatName = (chatId, title) => {
  setEditingChatId(chatId);
  setNewChatName(title);
  setMenuOpen(null); // Close menu after clicking edit
};

const saveChatName = async (chatId) => {
  const updatedChats = chats.map((chat) =>
    chat.id === chatId ? { ...chat, title: newChatName } : chat
  );

  await updateDoc(doc(db, "chat_saves", userId), { chats: updatedChats });
  setChats(updatedChats);
  setEditingChatId(null);
};
  
  return (
    <div className="chat-container">
      {/* Side Panel */}
      <div className="side-panel">
        <h3>Chats</h3>
        <button className="new-chat-btn" onClick={handleNewChat}>
          + New Chat
        </button>
        <button className="sign-out-btn" onClick={handleSignOut}>
          Sign Out
        </button>
        <div className="chat-list">
    {chats.map((chat) => (
      <div key={chat.id} className={`chat-item ${chat.id === currentChatId ? "active" : ""}`}>
        {/* Chat Name (Editable if selected) */}
        {editingChatId === chat.id ? (
          <input
            type="text"
            value={newChatName}
            onChange={(e) => setNewChatName(e.target.value)}
            onBlur={() => saveChatName(chat.id)}
            onKeyDown={(e) => e.key === "Enter" && saveChatName(chat.id)}
            autoFocus
            className="chat-input"
          />
        ) : (
          <span onClick={() => {
            setCurrentChatId(chat.id);
            setMessages(chat.messages);
          }}>
            {chat.title}
          </span>
        )}

        {/* 3-dot Menu */}
        <div className="menu-container">
          <button className="menu-button" onClick={() => setMenuOpen(menuOpen === chat.id ? null : chat.id)}>
            ⋮
          </button>

          {menuOpen === chat.id && (
            <div className="dropdown-menu">
              <button onClick={() => handleEditChatName(chat.id, chat.title)}>Edit Name</button>
              <button onClick={() => handleDeleteChat(chat.id)}>Delete Chat</button>
            </div>
          )}
        </div>
      </div>
    ))}
  </div>
</div>

      {/* Main Chat Area */}
      <div className="chat-area">
        <h2>Chat with Assistant</h2>
        <div className="messages">
          {messages.map((msg, index) => (
            <div key={index} className={msg.role === "user" ? "user-message" : "assistant-message"}>
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input Container */}
        <div className="input-container">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
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
