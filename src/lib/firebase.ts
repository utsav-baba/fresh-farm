import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use initializeFirestore with experimentalForceLongPolling for better stability in iframe/proxy environments
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId || "(default)");

const googleProvider = new GoogleAuthProvider();

const signInWithGoogle = () => signInWithPopup(auth, googleProvider);
const logout = () => signOut(auth);

// CRITICAL CONSTRAINT: Test connection on boot
import { doc, getDocFromServer } from 'firebase/firestore';
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Firestore connection successful.");
  } catch (error) {
    if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
      console.error("Please check your Firebase configuration or connection. Firestore is unavailable.");
    } else {
      console.warn("Initial connection test result:", error);
    }
  }
}
testConnection();

export { auth, db, googleProvider, signInWithGoogle, logout };
