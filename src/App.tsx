import React, { useState, useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { auth, db } from './lib/firebase';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  getDocFromServer,
  collection,
  query,
  getDocs,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { UserProfile, Vegetable, AppSettings, OperationType } from './types';
import { Language, translations } from './i18n';
import { formatINR } from './lib/utils';
import { Home } from './pages/Home';
import { AdminPanel } from './pages/AdminPanel';
import { MyOrders } from './pages/MyOrders';
import { Chatbot } from './components/Chatbot';
import { CartDrawer } from './components/CartDrawer';
import { RollingVeg } from './components/RollingVeg';
import { CartProvider, useCart } from './context/CartContext';
import { LogIn, LogOut, ShieldCheck, ShoppingBasket, MessageCircle, AlertTriangle, ShoppingCart, User as UserIcon, MapPin, Save, Loader2, CheckCircle, ShoppingBag, Mail, Phone, ChevronRight, Package, X, Settings } from 'lucide-react';
import { motion } from 'motion/react';

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4 text-center">
          <div className="max-w-md">
            <AlertTriangle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-800 mb-2">કંઈક ભૂલ થઈ છે</h2>
            <p className="text-red-600">કૃપા કરીને પેજ રીફ્રેશ કરો અથવા થોડીવાર પછી પ્રયત્ન કરો.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [isVegLoading, setIsVegLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('preferred_language');
    return (saved as Language) || 'gu';
  });
  const [showLanguageSelection, setShowLanguageSelection] = useState(() => {
    return !localStorage.getItem('preferred_language');
  });

  const t = translations[language];

  const isProfileIncomplete = profile && (!profile.firstName || !profile.phone || !profile.address);

  useEffect(() => {
    // Test connection as required by instructions
    const testConnection = async () => {
      try {
        if (db) {
          await getDocFromServer(doc(db, 'test', 'connection'));
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const fetchVegetables = async () => {
    try {
      const q = query(collection(db, 'vegetables'), orderBy('name'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
      
      if (data) {
        setVegetables(data.map(v => ({
          id: v.id,
          name: v.name,
          name_gu: v.name_gu || v.name,
          name_hi: v.name_hi,
          name_en: v.name_en || v.english_name || v.englishName,
          englishName: v.name_en || v.english_name || v.englishName,
          description: v.description,
          description_gu: v.description_gu || v.description,
          description_hi: v.description_hi,
          description_en: v.description_en,
          imageUrl: v.image_url || v.imageUrl,
          category: v.category || 'vegetable',
          pricingOptions: v.pricing_options || v.pricingOptions,
          totalStock: (v as any).total_stock ?? (v as any).totalStock ?? (( (v.pricing_options || v.pricingOptions || []).length > 0) ? ((v.pricing_options || v.pricingOptions)[0].stock || 0) : 0),
          inStock: (v as any).in_stock ?? (v as any).inStock ?? true,
          createdAt: v.created_at || v.createdAt,
          updatedAt: v.updated_at || v.updatedAt
        } as Vegetable)));
      }
    } catch (err) {
      console.error('Error fetching vegetables:', err);
    } finally {
      setIsVegLoading(false);
    }
  };

  useEffect(() => {
    // Fetch initial settings and vegetables from Firestore
    const fetchInitialData = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'global');
        const settingsSnap = await getDoc(settingsRef);
        
        if (settingsSnap.exists()) {
          const settingsData = settingsSnap.data();
          setSettings({
            freeDeliveryDistance: settingsData.free_delivery_distance || settingsData.freeDeliveryDistance || 0,
            freeDeliveryThreshold: settingsData.free_delivery_threshold || settingsData.freeDeliveryThreshold || 0,
            deliveryCharge: settingsData.delivery_charge || settingsData.deliveryCharge || 0,
            whatsappNumber: settingsData.whatsapp_number || settingsData.whatsappNumber,
            isShopOpen: settingsData.is_shop_open ?? settingsData.isShopOpen ?? true,
            warehouseAddress: settingsData.warehouse_address || settingsData.warehouseAddress,
            warehouseLat: settingsData.warehouse_lat || settingsData.warehouseLat,
            warehouseLng: settingsData.warehouse_lng || settingsData.warehouseLng,
            deliverySlots: settingsData.delivery_slots || settingsData.deliverySlots || [],
            updatedAt: settingsData.updated_at || settingsData.updatedAt
          } as AppSettings);
        } else {
          // Initialize default settings if they don't exist
          const defaultSettings: AppSettings = {
            freeDeliveryDistance: 5,
            freeDeliveryThreshold: 500,
            deliveryCharge: 30,
            whatsappNumber: '919876543210',
            isShopOpen: true,
            deliverySlots: ["09:00 AM - 11:00 AM", "12:00 PM - 02:00 PM", "05:00 PM - 07:00 PM"]
          };
          setSettings(defaultSettings);
        }
      } catch (err) {
        console.warn('Error fetching settings (falling back to defaults):', err);
        // Fallback defaults on ANY error (including offline)
        if (!settings) {
          setSettings({
            freeDeliveryDistance: 5,
            freeDeliveryThreshold: 399,
            deliveryCharge: 40,
            whatsappNumber: '919876543210',
            isShopOpen: true,
            deliverySlots: ["09:00 AM - 11:00 AM", "12:00 PM - 02:00 PM", "05:00 PM - 07:00 PM"]
          });
        }
      }
      
      await fetchVegetables();
    };

    fetchInitialData();
    
    // Handle redirect result for iOS login
    getRedirectResult(auth).catch((error) => {
      console.error('Redirect result error:', error);
      setAuthError('Login failed during redirect. Please try again.');
    });

    // Minimum splash screen time
    const splashTimer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

    // Realtime settings subscription via Firestore
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings({
          freeDeliveryDistance: data.free_delivery_distance || data.freeDeliveryDistance || 0,
          freeDeliveryThreshold: data.free_delivery_threshold || data.freeDeliveryThreshold || 0,
          deliveryCharge: data.delivery_charge || data.deliveryCharge || 0,
          whatsappNumber: data.whatsapp_number || data.whatsappNumber,
          isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
          warehouseAddress: data.warehouse_address || data.warehouseAddress,
          warehouseLat: data.warehouse_lat || data.warehouseLat,
          warehouseLng: data.warehouse_lng || data.warehouseLng,
          deliverySlots: data.delivery_slots || data.deliverySlots || [],
          updatedAt: data.updated_at || data.updatedAt
        } as AppSettings);
      }
    });

    // Realtime vegetables subscription via Firestore
    const unsubVeg = onSnapshot(collection(db, 'vegetables'), () => {
      fetchVegetables();
    });

    return () => {
      unsubSettings();
      unsubVeg();
      clearTimeout(splashTimer);
    };
  }, []);

  useEffect(() => {
    // Safety timeout: if auth doesn't ready in 3 seconds, proceed anyway
    const timeout = setTimeout(() => {
      if (!isAuthReady) {
        console.warn('Auth initialization timed out, proceeding...');
        setIsAuthReady(true);
      }
    }, 3000);

    if (!auth) {
      setIsAuthReady(true);
      clearTimeout(timeout);
      return;
    }

    // Listen for Firebase Auth changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Sync with Firestore profiles (Prefer Firestore over Supabase now)
        try {
          const profileRef = doc(db, 'profiles', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          const isAdmin = firebaseUser.email === 'patelb393@gmail.com' || firebaseUser.email === 'peacockverse@gmail.com' || firebaseUser.phoneNumber === '+919876543210';

          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            // Force admin role if criteria matches
            if (isAdmin && profileData.role !== 'admin') {
              await updateDoc(profileRef, { role: 'admin' });
              profileData.role = 'admin';
            }
            
            setProfile({ 
              uid: firebaseUser.uid,
              email: profileData.email,
              role: profileData.role,
              firstName: profileData.first_name,
              lastName: profileData.last_name,
              gender: profileData.gender,
              phone: profileData.phone,
              address: profileData.address,
              age: profileData.age,
              lat: profileData.lat,
              lng: profileData.lng,
              createdAt: profileData.created_at
            } as any);
          } else {
            // Create new profile in Firestore
            const newProfile = {
              email: firebaseUser.email || '',
              role: isAdmin ? 'admin' : 'user',
              created_at: serverTimestamp()
            };
            await setDoc(profileRef, newProfile);
            setProfile({ 
              uid: firebaseUser.uid,
              ...newProfile,
              createdAt: new Date().toISOString()
            } as any);
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `profiles/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setIsAuthReady(true);
      clearTimeout(timeout);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const [loginInProgress, setLoginInProgress] = useState(false);
  const loginRef = useRef(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = async () => {
    if (loginInProgress || loginRef.current) return;
    setIsAuthReady(false); // Reset auth ready to show splash if needed
    setLoginInProgress(true);
    loginRef.current = true;
    setAuthError(null);
    const { signInWithGoogle } = await import('./lib/firebase');
    try {
      await signInWithGoogle();
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/cancelled-popup-request') {
        setAuthError('Another login request is in progress. Please wait.');
      } else if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('Login window was closed. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('Login popup was blocked by your browser. Please allow popups for this site.');
      } else {
        setAuthError('Login failed. Please try again.');
      }
    } finally {
      setLoginInProgress(false);
      loginRef.current = false;
      setIsAuthReady(true);
    }
  };

  const logout = async () => {
    const { logout: firebaseLogout } = await import('./lib/firebase');
    try {
      await firebaseLogout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <Router>
      <ErrorBoundary>
        <CartProvider>
          <AppContent 
             user={user}
             profile={profile}
             setProfile={setProfile}
             isAuthReady={isAuthReady}
             showSplash={showSplash}
             showLanguageSelection={showLanguageSelection}
             setShowLanguageSelection={setShowLanguageSelection}
             language={language}
             setLanguage={setLanguage}
             settings={settings}
             vegetables={vegetables}
             isVegLoading={isVegLoading}
             login={login}
             logout={logout}
             loginInProgress={loginInProgress}
             authError={authError}
             t={t}
             isProfileIncomplete={isProfileIncomplete}
          />
        </CartProvider>
      </ErrorBoundary>
    </Router>
  );
}

function AppContent({ 
  user, 
  profile, 
  setProfile,
  isAuthReady, 
  showSplash, 
  showLanguageSelection, 
  setShowLanguageSelection, 
  language,
  setLanguage,
  settings,
  vegetables,
  isVegLoading,
  login,
  logout,
  loginInProgress,
  authError,
  t,
  isProfileIncomplete
}: any) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!isAuthReady || showSplash) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-farm-g1 text-farm-s2 p-6 overflow-hidden relative">
        <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full bg-farm-g4 opacity-[0.08]" />
        <div className="absolute bottom-[-60px] left-[-60px] w-[200px] h-[200px] rounded-full bg-farm-g4 opacity-[0.08]" />
        
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="text-center relative z-10"
        >
          <div className="mb-6 flex justify-center">
             <div className="bg-farm-g2/50 p-6 rounded-[32px] border border-farm-g3/30 backdrop-blur-sm shadow-2xl animate-float">
                <ShoppingBasket className="h-16 w-16 text-farm-s2" />
             </div>
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight mb-2 text-white">
            Fresh <span className="text-farm-s2">Farm</span>
          </h1>
          
          <p className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/40 mb-8">
            GUJARAT'S FINEST
          </p>

          <div className="flex flex-col items-center gap-6">
            <div className="h-1.5 w-32 bg-farm-g2 rounded-full overflow-hidden border border-farm-g3/20">
              <motion.div 
                initial={{ x: "-100%" }}
                animate={{ x: "100%" }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                className="h-full w-full bg-farm-s2"
              />
            </div>
            
            <p className="gu text-farm-s2/60 text-sm font-bold tracking-wide">
              સૌથી તાજા શાકભાજી તમારા દ્વારે
            </p>
          </div>
        </motion.div>
        
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="fixed bottom-12 text-farm-muted/60 text-[10px] font-bold tracking-widest uppercase text-center"
        >
          An Eternal Farm Company
        </motion.div>
      </div>
    );
  }

  if (showLanguageSelection) {
    return (
      <div className="min-h-screen bg-farm-cream flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <RollingVeg />
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="w-full max-w-sm space-y-8 relative z-10"
        >
          <div className="text-center">
            <div className="bg-white w-20 h-20 rounded-[24px] flex items-center justify-center mx-auto mb-6 shadow-farm-card border-2 border-farm-border">
              <ShoppingBasket className="h-10 w-10 text-farm-g2" />
            </div>
            <h2 className="text-4xl font-black text-farm-g1 tracking-tight mb-2 font-syne italic">Selection</h2>
            <p className="gu text-farm-muted font-bold text-sm">તમારી પસંદગીની ભાષા પસંદ કરો</p>
          </div>

          <div className="space-y-3">
            {(['en', 'gu', 'hi'] as Language[]).map((lang) => (
              <motion.button
                key={lang}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setLanguage(lang);
                  localStorage.setItem('preferred_language', lang);
                  setShowLanguageSelection(false);
                }}
                className={`w-full p-5 rounded-[20px] border-2 flex items-center justify-between transition-all group ${
                  language === lang 
                    ? 'border-farm-g3 bg-farm-g1 text-white shadow-xl shadow-farm-green/20' 
                    : 'border-farm-border bg-white hover:border-farm-g4 hover:bg-slate-50'
                }`}
              >
                <div className="flex flex-col items-start">
                  <span className={`text-lg font-black gu ${language === lang ? 'text-farm-s2' : 'text-farm-g1 group-hover:text-farm-g2'}`}>
                    {translations[lang].languageNames[lang]}
                  </span>
                  <span className={`text-[10px] uppercase font-bold tracking-widest ${language === lang ? 'text-white/40' : 'text-farm-muted'}`}>
                    {lang === 'en' ? 'English' : lang === 'gu' ? 'Gujarati' : 'Hindi'}
                  </span>
                </div>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  language === lang ? 'border-farm-s2 bg-farm-s2' : 'border-farm-border bg-transparent'
                }`}>
                  {language === lang && <CheckCircle className="h-4 w-4 text-farm-g1" />}
                </div>
              </motion.button>
            ))}
          </div>
          
          <div className="pt-8 text-center text-farm-muted/30 text-[10px] font-bold tracking-tighter uppercase">
            Fresh Farm Multi-Lingual Experience
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col overflow-hidden relative">
        <RollingVeg />
        
        {/* Top Image Section */}
        <div className="relative h-[48vh] sm:h-[55vh] overflow-hidden">
          <motion.img 
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            src="https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&q=80&w=1200" 
            alt="Fresh Farm" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-farm-g1 via-farm-g1/20 to-transparent" />
          
          <div className="absolute bottom-12 left-0 right-0 p-8 text-center">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="text-farm-s2 text-sm font-black uppercase tracking-[0.3em] mb-2 font-syne">
                {t.gujaratFinest}
              </h2>
              <h1 className="text-5xl font-extrabold text-white tracking-tight drop-shadow-2xl">
                Fresh <span className="text-farm-s2">Farm</span>
              </h1>
            </motion.div>
          </div>
        </div>

        {/* Login Section */}
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex-1 bg-farm-cream px-8 pb-12 flex flex-col items-center justify-center -mt-10 relative z-10 rounded-t-[32px] shadow-2xl"
        >
          <div className="max-w-xs w-full space-y-8 text-center">
            <div className="space-y-4">
              <motion.button 
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={login}
                disabled={loginInProgress}
                className={`w-full bg-farm-g1 text-white py-4.5 rounded-2xl font-bold text-base shadow-xl flex items-center justify-center gap-3 transition-all hover:bg-farm-g2 group border border-farm-g3/20 ${loginInProgress ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div className="w-7 h-7 p-1.5 bg-white rounded-full flex items-center justify-center transition-transform">
                  {loginInProgress ? (
                    <Loader2 className="h-4 w-4 text-farm-g1 animate-spin" />
                  ) : (
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-full h-full" />
                  )}
                </div>
                <span className="gu text-farm-s2 font-bold">
                  {loginInProgress ? 'Logging in...' : t.loginWithGoogle}
                </span>
              </motion.button>
              
              {authError && (
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider animate-bounce">
                  {authError}
                </p>
              )}
              
              <p className="text-[10px] text-farm-muted font-medium uppercase tracking-[0.1em] opacity-60">
                {t.loginSub}
              </p>
            </div>
            
            <button 
              onClick={() => setShowLanguageSelection(true)}
              className="mt-4 text-xs font-bold text-farm-g2 hover:text-farm-g3 flex items-center justify-center gap-2 mx-auto bg-white/50 px-5 py-2 rounded-full border border-farm-border"
            >
              Change Language / ભાષા બદલો
            </button>
          </div>

          <div className="absolute bottom-8 text-center w-full px-8">
            <p className="text-[10px] text-farm-muted font-bold tracking-tight opacity-40">
              {t.privacyTerms}
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-farm-cream text-farm-text font-sans selection:bg-farm-s2 selection:text-farm-g1">
      <RollingVeg />
      {(isProfileIncomplete || isEditingProfile) && (
        <ProfileSetupModal 
          profile={profile} 
          onSave={(updatedProfile) => {
            setProfile(updatedProfile);
            if (isEditingProfile) {
              setIsEditingProfile(false);
            } else {
              window.location.hash = '/';
              navigate('/', { replace: true });
            }
          }} 
          t={t} 
          language={language}
        />
      )}
      
      {/* Notice Strip / Offer Strip */}
      <div className="bg-farm-g1 text-farm-s2 text-[10px] font-bold py-1.5 relative z-50 overflow-hidden border-b border-farm-g3/20">
        <div className="flex animate-marquee whitespace-nowrap">
          <span className="px-4">
            {t.marqueeFreeAbove.replace('{{threshold}}', formatINR(settings?.freeDeliveryThreshold || 249))} &nbsp;·&nbsp; 
            {t.marqueeFreeTill.replace('{{distance}}', (settings?.freeDeliveryDistance || 10).toString())} &nbsp;·&nbsp; 
            {t.marqueeFreshEveryMorning} &nbsp;·&nbsp; 
            {t.marqueeGujFreshest} &nbsp;·&nbsp; 
            {t.marqueeRating} &nbsp;·&nbsp;
          </span>
          <span className="px-4">
            {t.marqueeFreeAbove.replace('{{threshold}}', formatINR(settings?.freeDeliveryThreshold || 249))} &nbsp;·&nbsp; 
            {t.marqueeFreeTill.replace('{{distance}}', (settings?.freeDeliveryDistance || 10).toString())} &nbsp;·&nbsp; 
            {t.marqueeFreshEveryMorning} &nbsp;·&nbsp; 
            {t.marqueeGujFreshest} &nbsp;·&nbsp; 
            {t.marqueeRating} &nbsp;·&nbsp;
          </span>
        </div>
      </div>

      <nav className="bg-farm-g1/95 backdrop-blur-xl border-b border-white/5 sticky top-0 z-40 px-4 h-16 flex items-center">
        <div className="max-w-7xl mx-auto w-full flex justify-between items-center">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="bg-farm-g2 p-1.5 rounded-xl border border-farm-g3/20 transition-transform group-hover:rotate-6">
              <ShoppingBasket className="h-5.5 w-5.5 text-farm-s2" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight group-hover:text-farm-s2 transition-colors">
              {t.freshFarm.split(' ')[0]} <span className="text-farm-s2">{t.freshFarm.split(' ')[1] || ''}</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-4">
            {profile && (
              <Link
                to="/my-orders"
                className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-white/5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-all border border-white/5 uppercase tracking-widest"
              >
                <ShoppingBag className="h-3.5 w-3.5 text-farm-s2" />
                <span className="hidden xs:inline">{t.myOrders}</span>
              </Link>
            )}
            {profile?.role === 'admin' && (
              <Link
                to="/admin-portal"
                className="flex items-center gap-1.5 text-[10px] font-bold text-white bg-farm-g3/40 px-2.5 py-1.5 rounded-lg hover:bg-farm-g3 transition-all border border-farm-g4/20 uppercase tracking-widest"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-farm-s2" />
                <span className="hidden xs:inline">{t.admin}</span>
              </Link>
            )}
            
            <button
              onClick={() => setIsCartOpen(true)}
              disabled={settings?.isShopOpen === false && profile?.role !== 'admin'}
              className="relative p-2 text-white/70 hover:text-farm-s2 transition-all hover:scale-105 disabled:opacity-30"
            >
              <ShoppingCart className="h-5.5 w-5.5" />
              {totalItems > 0 && (
                <span className="absolute top-0.5 right-0.5 bg-farm-s1 text-farm-g1 text-[9px] font-bold h-4.5 w-4.5 rounded-full flex items-center justify-center border-2 border-farm-g1 shadow-lg">
                  {totalItems}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2 sm:gap-3">
                <div 
                  onClick={() => window.location.hash = '/profile'}
                  className="cursor-pointer"
                >
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || ''}
                      className="h-9 w-9 rounded-full border-2 border-farm-s2 shadow-xl object-cover"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-farm-g3 flex items-center justify-center text-farm-s2 text-xs font-black border-2 border-farm-s2 shadow-xl font-syne">
                      {(user.displayName || 'U').charAt(0)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={login}
                className="bg-farm-s1 text-farm-g1 px-4 py-2 rounded-xl text-xs font-black hover:bg-farm-s2 transition-all flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95"
              >
                <LogIn className="h-4 w-4" />
                {t.login}
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto relative z-10">
        <Routes>
          <Route path="/" element={<Home profile={profile} settings={settings} vegetables={vegetables} loading={isVegLoading} language={language} t={t} />} />
          <Route path="/admin-portal" element={<AdminPanel profile={profile} language={language} t={t} />} />
          <Route path="/my-orders" element={<MyOrders profile={profile} language={language} t={t} />} />
          <Route path="/profile" element={<UserProfilePage profile={profile} user={user} logout={logout} onEditProfile={() => setIsEditingProfile(true)} onChangeLanguage={() => setShowLanguageSelection(true)} t={t} />} />
        </Routes>
      </main>

      {/* Bottom Nav - Mobile Style */}
      <div className="fixed bottom-0 left-0 right-0 bg-farm-g1/98 backdrop-blur-xl border-t border-white/5 px-4 py-2.5 flex justify-around items-center z-[100] sm:hidden">
        <Link to="/" className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${location.pathname === '/' ? 'text-farm-s2' : 'text-white/50'}`}>
          <ShoppingBasket className="h-6 w-6" />
          <span>{t.navHome}</span>
        </Link>
        <button onClick={() => setIsCartOpen(true)} className="flex flex-col items-center gap-1 text-[10px] font-bold text-white/50 hover:text-farm-s2">
          <ShoppingCart className="h-6 w-6" />
          <span>{t.navCart}</span>
        </button>
        <Link to="/my-orders" className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${location.pathname === '/my-orders' ? 'text-farm-s2' : 'text-white/50'}`}>
          <Package className="h-6 w-6" />
          <span>{t.navOrders}</span>
        </Link>
        <Link to="/profile" className={`flex flex-col items-center gap-1 text-[10px] font-bold transition-colors ${location.pathname === '/profile' ? 'text-farm-s2' : 'text-white/50'}`}>
          <UserIcon className="h-6 w-6" />
          <span>{t.navProfile}</span>
        </Link>
      </div>

      {/* Floating Buttons */}
      <div className="hidden sm:block">
        <motion.button
          drag
          dragMomentum={false}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsChatOpen(!isChatOpen)}
          className="fixed bottom-6 left-6 bg-farm-g1 text-farm-s2 p-4 rounded-full shadow-2xl hover:bg-farm-g2 transition-all z-50 cursor-move border border-farm-g3/30"
        >
          <MessageCircle className="h-6 w-6" />
        </motion.button>

        <motion.a
          drag
          dragMomentum={false}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          href={`https://wa.me/${settings?.whatsappNumber || '919876543210'}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 bg-[#25D366] text-white p-4 rounded-full shadow-2xl hover:bg-[#128C7E] transition-all z-50 cursor-move flex items-center justify-center border border-white/20"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </motion.a>
      </div>

      {isChatOpen && (
        <div className="fixed bottom-24 left-6 w-96 max-w-[calc(100vw-3rem)] h-[500px] z-[200]">
          <Chatbot onClose={() => setIsChatOpen(false)} />
        </div>
      )}

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} settings={settings} vegetables={vegetables} profile={profile} language={language} t={t} />
    </div>
  );
}

function UserProfilePage({ profile, user, logout, onEditProfile, onChangeLanguage, t }: { profile: UserProfile | null, user: any, logout: () => void, onEditProfile: () => void, onChangeLanguage: () => void, t: any }) {
  if (!profile) return null;
  return (
    <div className="max-w-xl mx-auto py-10 px-6 pb-32">
      <div className="text-center mb-10">
        <div className="relative inline-block mb-6">
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              alt="Profile" 
              className="w-24 h-24 rounded-3xl object-cover border-2 border-farm-s2/20 shadow-2xl rotate-3"
            />
          ) : (
            <div className="w-24 h-24 rounded-3xl bg-farm-g1 border-2 border-farm-s2/20 flex items-center justify-center text-3xl font-bold text-farm-s2 shadow-2xl rotate-3">
              {profile.firstName?.charAt(0)}{profile.lastName?.charAt(0)}
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 bg-farm-g4 text-white p-1.5 rounded-xl border-2 border-white shadow-lg">
             <CheckCircle className="h-4 w-4" />
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-farm-g1 tracking-tight mb-1">{profile.firstName} {profile.lastName}</h2>
        <p className="text-farm-muted text-sm font-medium">{profile.email}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-farm-border shadow-sm group hover:border-farm-g3 transition-colors">
          <div className="text-2xl font-bold text-farm-g1 mb-1">₹0</div>
          <div className="text-[10px] font-bold gu text-farm-muted uppercase tracking-widest">કુલ બચત</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-farm-border shadow-sm group hover:border-farm-g3 transition-colors">
          <div className="text-2xl font-bold text-farm-g1 mb-1">0</div>
          <div className="text-[10px] font-bold gu text-farm-muted uppercase tracking-widest">ઓર્ડર કર્યા</div>
        </div>
      </div>

      <div className="space-y-3 mb-10">
         <button onClick={() => window.location.hash = '/my-orders'} className="w-full bg-white p-5 rounded-2xl border border-farm-border flex items-center justify-between hover:border-farm-g2 hover:shadow-md transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-farm-g1/5 p-2.5 rounded-xl group-hover:bg-farm-g1/10 transition-colors">
                <Package className="h-5 w-5 text-farm-g1" />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-farm-g1 text-sm gu">{t.myOrders}</h4>
                <p className="text-[10px] text-farm-muted gu font-medium">તમારા તમામ ઓર્ડર અહી જુઓ</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-farm-muted group-hover:text-farm-g1 transition-colors" />
         </button>

         <div className="w-full bg-white p-5 rounded-2xl border border-farm-border">
            <div className="flex items-start gap-4">
              <div className="bg-farm-g1/5 p-2.5 rounded-xl">
                <MapPin className="h-5 w-5 text-farm-g1" />
              </div>
              <div className="text-left w-full">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-farm-g1 text-sm gu">{t.address}</h4>
                  <button onClick={onEditProfile} className="text-[10px] text-farm-g1 bg-farm-g1/10 px-2 py-1 rounded-md font-bold uppercase hover:bg-farm-g1/20 transition-colors flex items-center gap-1">
                    <UserIcon className="h-3 w-3" /> એડિટ
                  </button>
                </div>
                <p className="text-xs text-farm-muted gu mt-1 font-medium leading-relaxed">{profile.address}</p>
                <div className="flex gap-2 mt-3">
                   <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-500 uppercase tracking-tighter">Phone: {profile.phone}</span>
                   <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded-md font-bold text-slate-500 uppercase tracking-tighter">Age: {profile.age}</span>
                </div>
              </div>
            </div>
         </div>

         <button onClick={onChangeLanguage} className="w-full bg-white p-5 rounded-2xl border border-farm-border flex items-center justify-between hover:border-farm-g2 hover:shadow-md transition-all group">
            <div className="flex items-center gap-4">
              <div className="bg-farm-g1/5 p-2.5 rounded-xl group-hover:bg-farm-g1/10 transition-colors">
                <Settings className="h-5 w-5 text-farm-g1" />
              </div>
              <div className="text-left">
                <h4 className="font-bold text-farm-g1 text-sm gu">સેટિંગ્સ (Settings)</h4>
                <p className="text-[10px] text-farm-muted gu font-medium">ભાષા બદલો / Change Language</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-farm-muted group-hover:text-farm-g1 transition-colors" />
         </button>
      </div>

      <button
        onClick={logout}
        className="w-full bg-red-50 text-red-600 py-4.5 rounded-2xl font-bold text-sm tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2.5"
      >
        <LogOut className="h-5 w-5" />
        LOG OUT
      </button>
    </div>
  );
}

function ProfileSetupModal({ profile, onSave, t, language }: { profile: UserProfile, onSave: (p: UserProfile) => void, t: any, language: string }) {
  const [formData, setFormData] = useState({
    firstName: profile.firstName || '',
    lastName: profile.lastName || '',
    gender: profile.gender || 'male',
    phone: profile.phone || '',
    address: profile.address || '',
    age: profile.age || '',
    lat: profile.lat || 0,
    lng: profile.lng || 0
  });
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (profile.lat === 0 && profile.lng === 0) {
      handleGetLocation();
    }
  }, []);

  const handleGetLocation = () => {
    setLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({
            ...prev,
            lat: position.coords.latitude,
            lng: position.coords.longitude
          }));
          setLocating(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setLocating(false);
          let errorMessage = t.locationError || "લોકેશન મેળવવામાં ભૂલ થઈ. કૃપા કરીને પરમિશન આપો.";
          if (error.code === 1) errorMessage = "તમે લોકેશનની પરમિશન આપી નથી. કૃપા કરીને બ્રાઉઝર સેટિંગ્સમાં જઈને સાઈટને લોકેશનનું એક્સેસ (Allow) આપો.";
          if (error.code === 2) errorMessage = "તમારું લોકેશન નેટવર્ક દ્વારા મળી શકતું નથી. કૃપા કરીને ફોનનું GPS (Location) ચાલુ કરો.";
          if (error.code === 3) errorMessage = "લોકેશન શોધવામાં ઘણો સમય લાગ્યો (Timeout). ફરી પ્રયાસ કરો.";
          alert(errorMessage);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setLocating(false);
      alert(t.browserError || "તમારું બ્રાઉઝર લોકેશન સપોર્ટ કરતું નથી.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const profileRef = doc(db, 'profiles', profile.uid);
      await updateDoc(profileRef, {
        first_name: formData.firstName,
        last_name: formData.lastName,
        gender: formData.gender,
        phone: formData.phone,
        address: formData.address,
        age: Number(formData.age),
        lat: formData.lat,
        lng: formData.lng,
        updated_at: serverTimestamp()
      });
      
      onSave({ ...profile, ...formData, age: Number(formData.age) });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `profiles/${profile.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-farm-g1/80 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 border border-farm-border">
        <div className="p-8 border-b border-farm-border bg-gradient-to-r from-farm-g1 to-farm-g2 text-white relative overflow-hidden">
          <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-farm-s2 opacity-10 rounded-full blur-2xl" />
          <div className="relative z-10">
            <h3 className="text-2xl font-black font-syne italic flex items-center gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                <UserIcon className="h-6 w-6 text-farm-s2" />
              </div>
              {t.completeProfile}
            </h3>
            <p className="text-[10px] font-bold text-farm-s2/60 mt-4 gu leading-relaxed uppercase tracking-widest">{t.completeProfileSub}</p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[70vh] overflow-y-auto no-scrollbar pb-12">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.firstName}</label>
              <input
                required
                type="text"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 gu"
                placeholder={t.firstName === "નામ" ? "દા.ત. રમેશ" : t.firstName === "नाम" ? "जैसे: रमेश" : "e.g. Ramesh"}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.lastName}</label>
              <input
                required
                type="text"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 gu"
                placeholder={t.lastName === "અટક" ? "દા.ત. પટેલ" : t.lastName === "सरनेम" ? "जैसे: पटेल" : "e.g. Patel"}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.gender}</label>
            <div className="flex gap-3">
              {['male', 'female'].map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFormData({ ...formData, gender: g as any })}
                  className={`flex-1 py-3.5 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                    formData.gender === g ? 'border-farm-g1 bg-farm-g1 text-farm-s2 shadow-lg' : 'border-farm-border bg-white text-farm-muted hover:border-farm-g2'
                  }`}
                >
                  {g === 'male' ? t.male : t.female}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.age}</label>
              <input
                required
                type="number"
                value={formData.age}
                onChange={e => setFormData({ ...formData, age: e.target.value })}
                className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1"
                placeholder="25"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.phone}</label>
              <input
                required
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1"
                placeholder="9876543210"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-farm-muted uppercase tracking-widest ml-1">{t.address}</label>
            <textarea
              required
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-[24px] outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 min-h-[100px] gu"
              placeholder={t.addressPlaceholder}
            />
          </div>

          <div className="p-6 bg-farm-cream rounded-[28px] border-2 border-farm-border space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-farm-g2 flex items-center gap-2 uppercase tracking-widest">
                <MapPin className="h-4 w-4 text-farm-s2" />
                {t.location}
              </label>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="text-[11px] font-black text-farm-g1 underline underline-offset-4 uppercase tracking-[0.1em] hover:text-farm-g2 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                {locating ? (language === 'gu' ? 'મેળવી રહ્યા છીએ...' : language === 'hi' ? 'खोज रहे हैं...' : 'LOCATING...') : t.autoLocate}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-farm-border text-center">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest mb-1">LATITUDE</p>
                <p className="text-xs font-mono font-black text-farm-g1">{formData.lat.toFixed(4)}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-farm-border text-center">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest mb-1">LONGITUDE</p>
                <p className="text-xs font-mono font-black text-farm-g1">{formData.lng.toFixed(4)}</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-farm-g1 text-farm-s2 py-5 rounded-[24px] font-black text-lg shadow-2xl hover:bg-farm-g2 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 group relative overflow-hidden"
          >
            <div className="relative z-10 flex items-center gap-3 font-syne italic uppercase tracking-tight">
              {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
              {t.save}
            </div>
          </button>
        </form>
      </div>
    </div>
  );
}



