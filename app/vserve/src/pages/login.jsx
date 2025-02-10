import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig"; // Import Firebase auth
import { signInWithPopup, GoogleAuthProvider, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom"; // Import useNavigate from react-router-dom
import "./login.css";
import { doc, setDoc, getFirestore } from "firebase/firestore";

const db = getFirestore();


const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate(); // Initialize useNavigate hook

  // useEffect(() => {
  //   // Redirect to /chat if the user is already logged in
  //   const unsubscribe = onAuthStateChanged(auth, (user) => {
  //     if (user) {
  //       navigate("/chat");
  //     }
  //   });

  //   return () => unsubscribe(); // Cleanup the listener on component unmount
  // }, [navigate]);

  const toggleForm = () => {
    setIsSignUp(!isSignUp);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const signInWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => {
        console.log("Google Sign-In Successful");
        // Redirect to chat page after successful login
        navigate("/chat");
      })
      .catch((error) => console.error(error));
  };

  const handleAuth = async () => {
    try {
      let userCredential;
      if (isSignUp) {
        if (password !== confirmPassword) {
          alert("Passwords do not match!");
          return;
        }
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        // Save user ID and email to Firestore
        await setDoc(doc(db, "chat_saves", userCredential.user.uid), {
          email: userCredential.user.email,
          createdAt: new Date(),
          chats: [], // Initialize empty chats array
        });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }
  
      await userCredential.user.getIdToken();
      navigate("/chat");
    } catch (error) {
      alert(error.message);
    }
  };
  
  return (
    <div className="container">
      <div className="left-section">
        <h1>{isSignUp ? "Create an account" : "Welcome back"}</h1>
        <p className="subtitle">{isSignUp ? "Sign up to get started!" : "Please enter your details"}</p>

        <button className="google-btn" onClick={signInWithGoogle}>
          <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" className="google-icon" />
          {isSignUp ? "Sign up with Google" : "Sign in with Google"}
        </button>

        <div className="divider">or</div>

        <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {isSignUp && <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />}

        <button className="login-btn" onClick={handleAuth}>{isSignUp ? "Sign Up" : "Sign In"}</button>

        <p>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}  
          <button className="link-btn" onClick={toggleForm}>{isSignUp ? "Sign in" : "Sign up"}</button>
        </p>
      </div>

      <div className="right-section">
        <img src="/customer-service-representative-csr.png" alt="Welcome" className="banner-image" />
        <div className="overlay-text">
          <h2>{isSignUp ? "Join us today!" : "Bring your ideas to life."}</h2>
          <p>Sign up for free and enjoy access to all features for 30 days. No credit card required.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
