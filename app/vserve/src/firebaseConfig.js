// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, onAuthStateChanged } from "firebase/auth"; 
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCGTngsUzr9W88MpGHa-_LSY-DdiS5O7R0",
  authDomain: "v-serve-ad718.firebaseapp.com",
  projectId: "v-serve-ad718",
  storageBucket: "v-serve-ad718.firebasestorage.app",
  messagingSenderId: "1079109954883",
  appId: "1:1079109954883:web:0dc52f2d78fa7ab7cfd3f6",
  measurementId: "G-7G280FEJC3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

const auth = getAuth(app);
export { auth };

