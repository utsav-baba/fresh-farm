import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  signOut, 
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail
} from 'firebase/auth';
import { initializeFirestore } from "firebase/firestore";
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use initializeFirestore with experimentalForceLongPolling for better stability in iframe/proxy environments
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, (firebaseConfig as any).firestoreDatabaseId || "(default)");

const googleProvider = new GoogleAuthProvider();

const signInWithGoogle = () => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // Detection for iPadOS 13+
  
  if (isIOS) {
    return signInWithRedirect(auth, googleProvider);
  } else {
    return signInWithPopup(auth, googleProvider);
  }
};

const loginAnonymously = () => signInAnonymously(auth);

const registerWithPhone = (phone: string, password: string) => {
  const email = `${phone}@farm.com`;
  return createUserWithEmailAndPassword(auth, email, password);
};

const loginWithPhone = (phone: string, password: string) => {
  const email = `${phone}@farm.com`;
  return signInWithEmailAndPassword(auth, email, password);
};

const checkUserExists = async (phone: string) => {
  const email = `${phone}@farm.com`;
  try {
    console.log("Checking existence for:", email);
    const methods = await fetchSignInMethodsForEmail(auth, email);
    console.log("Found methods:", methods);
    if (methods.length > 0) return true;

    // Fallback: Check Firestore profiles collection
    const { collection, query, where, getDocs, limit } = await import('firebase/firestore');
    const q = query(
      collection(db, 'profiles'), 
      where('phone', '==', phone),
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (err: any) {
    console.error("Existence check error", err);
    // Handle specific codes if needed
    if (err.code === 'auth/invalid-email') return false;
    return false;
  }
};

const logout = () => signOut(auth);

// CRITICAL CONSTRAINT: Test connection on boot
import { doc, getDocFromServer } from 'firebase/firestore';
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'settings', 'global'));
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

export { auth, db, googleProvider, signInWithGoogle, loginAnonymously, registerWithPhone, loginWithPhone, checkUserExists, logout };
