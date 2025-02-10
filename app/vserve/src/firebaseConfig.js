// Import Firebase functions
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; 

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCGTngsUzr9W88MpGHa-_LSY-DdiS5O7R0",
  authDomain: "v-serve-ad718.firebaseapp.com",
  projectId: "v-serve-ad718",
  storageBucket: "v-serve-ad718.appspot.com",
  messagingSenderId: "1079109954883",
  appId: "1:1079109954883:web:0dc52f2d78fa7ab7cfd3f6",
  measurementId: "G-7G280FEJC3"  // Optional, remove if not using analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);  // Firestore added

// Export Firebase services
export { auth, db };
