import React, { useState, useEffect, useRef } from "react";
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
  const [editingChatId, setEditingChatId] = useState(null);
  const [newChatName, setNewChatName] = useState("");
  const [menuOpen, setMenuOpen] = useState(null);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  const handleNewChat = async () => {
    const newChatId = Date.now().toString();
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
        const chatId = Date.now().toString();
        const chatTitle = message.slice(0, 20) || "Untitled Chat";

        const newChat = { id: chatId, title: chatTitle, messages: updatedMessages };
        updatedChats = [...userChats, newChat];
        setCurrentChatId(chatId);
      } else {
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

  const handleEditChatName = (chatId, title) => {
    setEditingChatId(chatId);
    setNewChatName(title);
    setMenuOpen(null);
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
      <div className="side-panel">
        <h3>Your Chats</h3>
        <button className="new-chat-btn" onClick={handleNewChat}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Chat
        </button>

        <div className="chat-list">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${chat.id === currentChatId ? "active" : ""}`}
            >
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
                <span
                  onClick={() => {
                    setCurrentChatId(chat.id);
                    setMessages(chat.messages);
                  }}
                >
                  {chat.title}
                </span>
              )}

              <div className="menu-container" ref={menuRef}>
                <button
                  className="menu-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(menuOpen === chat.id ? null : chat.id);
                  }}
                >
                  ⋮
                </button>

                {menuOpen === chat.id && (
                  <div className="dropdown-menu">
                    <button onClick={() => handleEditChatName(chat.id, chat.title)}>
                      Rename
                    </button>
                    <button onClick={() => handleDeleteChat(chat.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <button className="sign-out-btn" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      <div className="chat-area">
        <h2>Chat Assistant</h2>
        <div className="messages">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={msg.role === "user" ? "user-message" : "assistant-message"}
            >
              {msg.text}
            </div>
          ))}
        </div>

        <div className="input-container">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Type your message here..."
            rows="1"
          />
          <button onClick={handleSendMessage} disabled={loading || !message.trim()}>
            ⬆️
          </button>
          <button onClick={() => {}}>
            End
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chat;