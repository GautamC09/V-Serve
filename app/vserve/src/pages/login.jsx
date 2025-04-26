import React, { useState, useEffect } from "react";
import { auth } from "../firebaseConfig";
import {
  signInWithPopup,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import "./login.css";
import { doc, setDoc, getDoc, getFirestore } from "firebase/firestore";

const db = getFirestore();

const Login = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Reset form fields when toggling
  const toggleForm = () => {
    setIsSignUp(!isSignUp);
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setAddress("");
    setContactNo("");
    setError(null);
  };

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      setError(null);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const userRef = doc(db, "chat_saves", result.user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email: result.user.email,
          role: "user",
          createdAt: new Date(),
        });
      }

      const userRole = (await getDoc(userRef)).data().role;
      navigate(userRole === "admin" ? "/admin" : "/chat");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      let userCredential;
      if (isSignUp) {
        if (password !== confirmPassword) {
          setError("Passwords do not match!");
          return;
        }
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "chat_saves", userCredential.user.uid), {
          email: userCredential.user.email,
          firstName: firstName,
          lastName: lastName,
          address: address,
          contactNo: contactNo,
          role: "user",
          createdAt: new Date(),
        });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }

      const userDoc = await getDoc(doc(db, "chat_saves", userCredential.user.uid));
      const userRole = userDoc.exists() ? userDoc.data().role : "user";

      navigate(userRole === "admin" ? "/admin" : "/chat");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="left-section">
        <h1>{isSignUp ? "Create an account" : "Welcome back"}</h1>
        <p className="subtitle">
          {isSignUp ? "Sign up to get started!" : "Please enter your details"}
        </p>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {loading && <p>Loading...</p>}

        <button className="google-btn" onClick={signInWithGoogle} disabled={loading}>
          <img
            src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg"
            className="google-icon"
            alt="Google"
          />
          {isSignUp ? "Sign up with Google" : "Sign in with Google"}
        </button>

        <div className="divider">or</div>

        {isSignUp ? (
          <>
            <div className="form-row">
              <input
                type="text"
                placeholder="First Name *"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
              />
            </div>
            <input
              type="email"
              placeholder="Email address *"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Password *"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Confirm Password *"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
            <input
              type="text"
              placeholder="Address *"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
            />
            <input
              type="tel"
              placeholder="Contact Number *"
              value={contactNo}
              onChange={(e) => setContactNo(e.target.value)}
              disabled={loading}
            />
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </>
        )}

        <button
          className="login-btn"
          onClick={handleAuth}
          disabled={loading || (isSignUp && (!email || !password || !confirmPassword || !firstName || !address || !contactNo))}
        >
          {isSignUp ? "Sign Up" : "Sign In"}
        </button>

        <p>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}
          <button className="link-btn" onClick={toggleForm} disabled={loading}>
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </p>
      </div>

      <div className="right-section">
        <img
          src="/customer-service-representative-csr.png"
          alt="Welcome"
          className="banner-image"
        />
        <div className="overlay-text">
          <h2>{isSignUp ? "Join us today!" : "Bring your ideas to life."}</h2>
          <p>Sign up for free and enjoy access to all features for 30 days. No credit card required.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;