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
  where,
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
import { InstallPwaPrompt } from './components/InstallPwaPrompt';
import { RollingVeg } from './components/RollingVeg';
import { CartProvider, useCart } from './context/CartContext';
import { LogIn, LogOut, ShieldCheck, ShoppingBasket, MessageCircle, AlertTriangle, ShoppingCart, User as UserIcon, MapPin, Save, Loader2, CheckCircle, ShoppingBag, Mail, Phone, ChevronRight, Package, X, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Capacitor } from '@capacitor/core';

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
    if (saved === 'hi' || !saved || (saved !== 'en' && saved !== 'gu')) {
      return 'gu';
    }
    return saved as Language;
  });
  const [showLanguageSelection, setShowLanguageSelection] = useState(() => {
    return !localStorage.getItem('preferred_language');
  });
  const [loginStep, setLoginStep] = useState<'phone' | 'password' | 'signup'>('phone');
  const [authError, setAuthError] = useState<string | null>(null);

  const t = translations[language];

  const isProfileIncomplete = user && profile && !profile.firstName && loginStep !== 'signup';

  useEffect(() => {
    // Mobile optimizations
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: Style.Dark });
      StatusBar.setBackgroundColor({ color: '#061a08' }); // color-farm-g1
    }

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
          const data = settingsSnap.data();
          setSettings({
            freeDeliveryDistance: data.free_delivery_distance || data.freeDeliveryDistance || 0,
            freeDeliveryThreshold: data.free_delivery_threshold || data.freeDeliveryThreshold || 0,
            deliveryCharge: data.delivery_charge || data.deliveryCharge || 0,
            whatsappNumber: data.whatsapp_number || data.whatsappNumber || '',
            isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
            warehouseAddress: data.warehouse_address || data.warehouseAddress || '',
            warehouseLat: data.warehouse_lat || data.warehouseLat || 23.0225,
            warehouseLng: data.warehouse_lng || data.warehouseLng || 72.5714,
            deliverySlots: data.delivery_slots || data.deliverySlots || [],
            showHomepageDeal: data.show_homepage_deal ?? data.showHomepageDeal ?? true,
            homepageDealTitle: data.homepage_deal_title || data.homepageDealTitle || '',
            homepageDealSub: data.homepage_deal_sub || data.homepageDealSub || '',
            homepageDealCode: data.homepage_deal_code || data.homepageDealCode || '',
            freeItemThreshold: data.free_item_threshold || data.freeItemThreshold || 0,
            freeItemName: data.free_item_name || data.freeItemName || '',
            freeItemImage: data.free_item_image || data.freeItemImage || '',
            freeItemWeight: data.free_item_weight || data.freeItemWeight || '',
            freeItemDescription: data.free_item_description || data.freeItemDescription || '',
            freeItemMRP: data.free_item_mrp || data.freeItemMRP || 0,
            isFreeItemActive: data.is_free_item_active ?? data.isFreeItemActive ?? false,
            updatedAt: data.updated_at?.toDate?.()?.toISOString() || data.updated_at || new Date().toISOString()
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

          // Write back to Firestore so they are actually saved
          try {
            // Seed default vegetables if none exist FIRST, before creating global settings,
            // so that "!exists(/databases/$(database)/documents/settings/global)" remains true during veg seeding!
            const vegCollection = collection(db, 'vegetables');
            const vegSnap = await getDocs(vegCollection);
            if (vegSnap.empty) {
              const defaultVeggies = [
                // Vegetables
                {
                  name: "ડુંગળી (Onion)",
                  name_gu: "ડુંગળી (Onion)",
                  name_hi: "प्याज (Onion)",
                  english_name: "Onion",
                  name_en: "Onion",
                  description: "તાજી નાસિક ડુંગળી (Fresh Nasik Onion)",
                  description_gu: "તાજી નાસિક ડુંગળી",
                  description_hi: "ताजा नासिक प्याज",
                  description_en: "Fresh Nasik Onion",
                  image_url: "https://images.unsplash.com/photo-1508747703725-719777637510?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "1 kg", price: 40, costPrice: 30, stock: 120 },
                    { unit: "500 g", price: 22, costPrice: 15, stock: 120 }
                  ],
                  in_stock: true,
                  total_stock: 120,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "બટાકા (Potato)",
                  name_gu: "બટાકા (Potato)",
                  name_hi: "आलू (Potato)",
                  english_name: "Potato",
                  name_en: "Potato",
                  description: "તાજા દેશી બટાકા (Fresh Local Potatoes)",
                  description_gu: "તાજા દેશી બટાકા",
                  description_hi: "ताजा स्थानीय आलू",
                  description_en: "Fresh Local Potatoes",
                  image_url: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "1 kg", price: 30, costPrice: 20, stock: 150 },
                    { unit: "2 kg", price: 55, costPrice: 40, stock: 150 }
                  ],
                  in_stock: true,
                  total_stock: 150,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ટામેટા (Tomato)",
                  name_gu: "ટામેટા (Tomato)",
                  name_hi: "टमाटर (Tomato)",
                  english_name: "Tomato",
                  name_en: "Tomato",
                  description: "લાલ અને તાજા દેશી ટામેટા (Fresh Red Tomatoes)",
                  description_gu: "લાલ અને તાજા દેશી ટામેટા",
                  description_hi: "लाल और ताजा टमाटर",
                  description_en: "Fresh Red Tomatoes",
                  image_url: "https://images.unsplash.com/photo-1595855759920-86582396756a?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 20, costPrice: 12, stock: 100 },
                    { unit: "1 kg", price: 35, costPrice: 24, stock: 100 }
                  ],
                  in_stock: true,
                  total_stock: 100,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "લીલા મરચાં (Green Chilli)",
                  name_gu: "લીલા મરચાં (Green Chilli)",
                  name_hi: "हरी मिर्च (Green Chilli)",
                  english_name: "Green Chilli",
                  name_en: "Green Chilli",
                  description: "તીખા અને તાજા મરચાં (Spicy and Fresh Green Chillies)",
                  description_gu: "તીખા અને તાજા મરચાં",
                  description_hi: "तीखी और ताजी हरी मिर्च",
                  description_en: "Spicy and Fresh Green Chillies",
                  image_url: "https://images.unsplash.com/photo-1588252303780-e837dfaf5d7b?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 15, costPrice: 8, stock: 60 },
                    { unit: "100 g", price: 8, costPrice: 4, stock: 60 }
                  ],
                  in_stock: true,
                  total_stock: 60,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "લીંબુ (Lemon)",
                  name_gu: "લીંબુ (Lemon)",
                  name_hi: "नींबू (Lemon)",
                  english_name: "Lemon",
                  name_en: "Lemon",
                  description: "રસદાર પીળા લીંબુ (Juicy Yellow Lemons)",
                  description_gu: "રસદાર પીળા લીંબુ",
                  description_hi: "रसीले पीले नींबू",
                  description_en: "Juicy Yellow Lemons",
                  image_url: "https://images.unsplash.com/photo-1590502593747-42a996133562?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 25, costPrice: 15, stock: 80 },
                    { unit: "500 g", price: 45, costPrice: 30, stock: 80 }
                  ],
                  in_stock: true,
                  total_stock: 80,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "લસણ (Garlic)",
                  name_gu: "લસણ (Garlic)",
                  name_hi: "लहसुन (Garlic)",
                  english_name: "Garlic",
                  name_en: "Garlic",
                  description: "તાજું અને સૂકું દેશી લસણ (Premium Dry Garlic)",
                  description_gu: "તાજું અને સૂકું દેશી લસણ",
                  description_hi: "ताजा और सूखा लहसुन",
                  description_en: "Premium Dry Garlic",
                  image_url: "https://images.unsplash.com/photo-1540148426945-6cf215d2d0e5?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 40, costPrice: 28, stock: 75 },
                    { unit: "100 g", price: 18, costPrice: 12, stock: 75 }
                  ],
                  in_stock: true,
                  total_stock: 75,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "આદુ (Ginger)",
                  name_gu: "આદુ (Ginger)",
                  name_hi: "अदरक (Ginger)",
                  english_name: "Ginger",
                  name_en: "Ginger",
                  description: "તાજું તીખું આદુ (Fresh Spicy Ginger)",
                  description_gu: "તાજું તીખું આદુ",
                  description_hi: "ताजा अदरक",
                  description_en: "Fresh Spicy Ginger",
                  image_url: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 35, costPrice: 22, stock: 70 },
                    { unit: "100 g", price: 15, costPrice: 10, stock: 70 }
                  ],
                  in_stock: true,
                  total_stock: 70,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "કોથમીર (Coriander Leaves)",
                  name_gu: "કોથમીર (Coriander Leaves)",
                  name_hi: "धनिया पत्ती (Coriander Leaves)",
                  english_name: "Coriander Leaves",
                  name_en: "Coriander Leaves",
                  description: "તાજી અને સુગંધીદાર કોથમીર (Fresh Fragrant Coriander)",
                  description_gu: "તાજી અને સુગંધીદાર કોથમીર",
                  description_hi: "ताजी हरी धनिया",
                  description_en: "Fresh Fragrant Coriander",
                  image_url: "https://images.unsplash.com/photo-1514912953282-36c561b369fd?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 15, costPrice: 9, stock: 50 },
                    { unit: "100 g", price: 8, costPrice: 5, stock: 50 }
                  ],
                  in_stock: true,
                  total_stock: 50,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ભીંડો (Ladies Finger)",
                  name_gu: "ભીંડો (Ladies Finger)",
                  name_hi: "भिंडी (Ladies Finger)",
                  english_name: "Ladies Finger",
                  name_en: "Ladies Finger",
                  description: "કોમળ અને તાજો ભીંડો (Tender Fresh Okra)",
                  description_gu: "કોમળ અને તાજો ભીંડો",
                  description_hi: "ताजी कोमल भिंडी",
                  description_en: "Tender Fresh Okra",
                  image_url: "https://images.unsplash.com/photo-1621539209700-117565ec1421?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 25, costPrice: 16, stock: 90 },
                    { unit: "1 kg", price: 45, costPrice: 30, stock: 90 }
                  ],
                  in_stock: true,
                  total_stock: 90,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ફૂલકોબી (Cauliflower)",
                  name_gu: "ફૂલકોબી (Cauliflower)",
                  name_hi: "फूलगोभी (Cauliflower)",
                  english_name: "Cauliflower",
                  name_en: "Cauliflower",
                  description: "તાજી શુદ્ધ સફેદ ફૂલકોબી (Fresh Farm Cauliflower)",
                  description_gu: "તાજી શુદ્ધ સફેદ ફૂલકોબી",
                  description_hi: "ताजी फूलगोभी",
                  description_en: "Fresh Farm Cauliflower",
                  image_url: "https://images.unsplash.com/photo-1568584711075-3d021a7c3ec3?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "1 pc (approx 500g)", price: 25, costPrice: 15, stock: 65 }
                  ],
                  in_stock: true,
                  total_stock: 65,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "કોબીજ (Cabbage)",
                  name_gu: "કોબીજ (Cabbage)",
                  name_hi: "पत्तागोभी (Cabbage)",
                  english_name: "Cabbage",
                  name_en: "Cabbage",
                  description: "કરકરા તાજી લીલી કોબીજ (Fresh Crunchy Cabbage)",
                  description_gu: "કરકરા તાજી લીલી કોબીજ",
                  description_hi: "ताजा पत्तागोभी",
                  description_en: "Fresh Crunchy Cabbage",
                  image_url: "https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "1 pc (approx 500g)", price: 20, costPrice: 12, stock: 80 }
                  ],
                  in_stock: true,
                  total_stock: 80,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "રીંગણ (Brinjal/Eggplant)",
                  name_gu: "રીંગણ (Brinjal/Eggplant)",
                  name_hi: "बैंगन (Brinjal)",
                  english_name: "Brinjal",
                  name_en: "Brinjal",
                  description: "ભરથા માટેના સરસ ઓળાના રીંગણા (Fresh Ole Brinjals)",
                  description_gu: "ભરથા માટેના સરસ ઓળાના રીંગણા",
                  description_hi: "ताजा बैंगन",
                  description_en: "Fresh Ole Brinjals",
                  image_url: "https://images.unsplash.com/photo-1590378393557-011103390e8e?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 22, costPrice: 14, stock: 75 },
                    { unit: "1 kg", price: 40, costPrice: 25, stock: 75 }
                  ],
                  in_stock: true,
                  total_stock: 75,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ગાજર (Carrot)",
                  name_gu: "ગાજર (Carrot)",
                  name_hi: "गाजर (Carrot)",
                  english_name: "Carrot",
                  name_en: "Carrot",
                  description: "લાલ અને મીઠા તાજા ઓર્ગેનિક ગાજર (Fresh Red Carrots)",
                  description_gu: "લાલ અને મીઠા તાજા ઓર્ગેનિક ગાજર",
                  description_hi: "ताजा गाजर",
                  description_en: "Fresh Red Carrots",
                  image_url: "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 25, costPrice: 15, stock: 85 },
                    { unit: "1 kg", price: 45, costPrice: 28, stock: 85 }
                  ],
                  in_stock: true,
                  total_stock: 85,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "કાકડી (Cucumber)",
                  name_gu: "કાકડી (Cucumber)",
                  name_hi: "खीरा (Cucumber)",
                  english_name: "Cucumber",
                  name_en: "Cucumber",
                  description: "કોમળ અને કડક સલાડ કાકડી (Crispy Salad Cucumber)",
                  description_gu: "કોમળ અને કડક સલાડ કાકડી",
                  description_hi: "ताजा खीरा",
                  description_en: "Crispy Salad Cucumber",
                  image_url: "https://images.unsplash.com/photo-1604975230063-f07deebd16af?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 20, costPrice: 11, stock: 100 },
                    { unit: "1 kg", price: 38, costPrice: 20, stock: 100 }
                  ],
                  in_stock: true,
                  total_stock: 100,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ફુદીનો (Mint Leaves)",
                  name_gu: "ફુદીનો (Mint Leaves)",
                  name_hi: "पुदीना (Mint)",
                  english_name: "Mint Leaves",
                  name_en: "Mint Leaves",
                  description: "તાજો, સુગંધીદાર અને આયુર્વેદિક ફુદીનો (Fresh Aromatic Mint)",
                  description_gu: "તાજો, સુગંધીદાર અને આયુર્વેદિક ફુદીનો",
                  description_hi: "ताजा पुदीना",
                  description_en: "Fresh Aromatic Mint",
                  image_url: "https://images.unsplash.com/photo-1533616688419-b7a585564566?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "100 g", price: 10, costPrice: 5, stock: 40 }
                  ],
                  in_stock: true,
                  total_stock: 40,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "દૂધી (Bottle Gourd)",
                  name_gu: "દૂધી (Bottle Gourd)",
                  name_hi: "लौकी (Bottle Gourd)",
                  english_name: "Bottle Gourd",
                  name_en: "Bottle Gourd",
                  description: "કોમળ અને લાંબી દેશી ફાર્મ દૂધી (Fresh Tender Bottle Gourd)",
                  description_gu: "કોમળ અને લાંબી દેશી ફાર્મ દૂધી",
                  description_hi: "ताजा लौकी",
                  description_en: "Fresh Tender Bottle Gourd",
                  image_url: "https://images.unsplash.com/photo-1604152135912-04a022e23696?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "1 pc (approx 500g-700g)", price: 25, costPrice: 15, stock: 70 }
                  ],
                  in_stock: true,
                  total_stock: 70,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "કારેલા (Bitter Gourd)",
                  name_gu: "કારેલા (Bitter Gourd)",
                  name_hi: "करेला (Bitter Gourd)",
                  english_name: "Bitter Gourd",
                  name_en: "Bitter Gourd",
                  description: "તાજા વેલાના કારેલા (Fresh Organic Bitter Gourd)",
                  description_gu: "તાજા વેલાના કારેલા",
                  description_hi: "ताजा करेला",
                  description_en: "Fresh Organic Bitter Gourd",
                  image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 25, costPrice: 15, stock: 60 },
                    { unit: "1 kg", price: 48, costPrice: 30, stock: 60 }
                  ],
                  in_stock: true,
                  total_stock: 60,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "લીલા વટાણા (Green Peas)",
                  name_gu: "લીલા વટાણા (Green Peas)",
                  name_hi: "हरी मटर (Green Peas)",
                  english_name: "Green Peas",
                  name_en: "Green Peas",
                  description: "તાજા અને પ્રીમિયમ દાણાદાર મીઠા વટાણા (Fresh Sweet Green Peas)",
                  description_gu: "તાજા અને પ્રીમિયમ દાણાદાર મીઠા વટાણા",
                  description_hi: "ताजी हरी मटर",
                  description_en: "Fresh Sweet Green Peas",
                  image_url: "https://images.unsplash.com/photo-1582515073490-39981397c445?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 45, costPrice: 32, stock: 80 },
                    { unit: "1 kg", price: 85, costPrice: 60, stock: 80 }
                  ],
                  in_stock: true,
                  total_stock: 80,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "પાલક ભાજી (Spinach)",
                  name_gu: "પાલક ભાજી (Spinach)",
                  name_hi: "पालक (Spinach)",
                  english_name: "Spinach",
                  name_en: "Spinach",
                  description: "શુદ્ધ, પોષક તત્ત્વોથી ભરપૂર લીલી પાલક (Premium Fresh Spinach)",
                  description_gu: "શુદ્ધ, પોષક તત્ત્વોથી ભરપૂર લીલી પાલક",
                  description_hi: "ताजा पालक",
                  description_en: "Premium Fresh Spinach",
                  image_url: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "250 g", price: 15, costPrice: 8, stock: 45 }
                  ],
                  in_stock: true,
                  total_stock: 45,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "લીલા કેપ્સીકમ (Capsicum)",
                  name_gu: "લીલા કેપ્સીકમ (Capsicum)",
                  name_hi: "शिमला मिर्च (Capsicum)",
                  english_name: "Capsicum",
                  name_en: "Capsicum",
                  description: "સરસ કદના તાજા કેપ્સીકમ મરચાં (Fresh Green Capsicum)",
                  description_gu: "સરસ કદના તાજા કેપ્સીકમ મરચાં",
                  description_hi: "ताजा शिमला मिर्च",
                  description_en: "Fresh Green Capsicum",
                  image_url: "https://images.unsplash.com/photo-1563565048367-ab4047ecaaca?w=500&auto=format&fit=crop&q=60",
                  category: "vegetable",
                  pricing_options: [
                    { unit: "500 g", price: 30, costPrice: 18, stock: 75 },
                    { unit: "1 kg", price: 55, costPrice: 34, stock: 75 }
                  ],
                  in_stock: true,
                  total_stock: 75,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },

                // Groceries (Category: grocery)
                {
                  name: "બાસમતી ચોખા (Basmati Rice)",
                  name_gu: "બાસમતી ચોખા (Basmati Rice)",
                  name_hi: "बासमती चावल (Basmati Rice)",
                  english_name: "Basmati Rice",
                  name_en: "Basmati Rice",
                  description: "પ્રીમિયમ ડબલ ચાવી લાંબા દાણાદાર બાસમતી ચોખા (Double Chabi Basmati)",
                  description_gu: "પ્રીમિયમ ડબલ ચાવી લાંબા દાણાદાર બાસમતી ચોખા",
                  description_hi: "प्रीमियम बासमती चावल",
                  description_en: "Double Chabi Basmati",
                  image_url: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 110, costPrice: 85, stock: 200 },
                    { unit: "5 kg", price: 520, costPrice: 420, stock: 200 }
                  ],
                  in_stock: true,
                  total_stock: 200,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ઘઉં લોટ (Wheat Atta)",
                  name_gu: "ઘઉં લોટ (Wheat Atta)",
                  name_hi: "गेहूं का आटा (Wheat Atta)",
                  english_name: "Wheat Atta",
                  name_en: "Wheat Atta",
                  description: "શુદ્ધ એમ.પી. સીહોર કુદરતી ઘઉંનો લોટ (Pure Sharbati Wheat Atta)",
                  description_gu: "શુદ્ધ એમ.પી. સીહોર કુદરતી ઘઉંનો લોટ",
                  description_hi: "शुद्ध गेहूं का आटा",
                  description_en: "Pure Sharbati Wheat Atta",
                  image_url: "https://images.unsplash.com/photo-1574316071802-0d684efa7bf5?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "5 kg", price: 260, costPrice: 200, stock: 150 },
                    { unit: "10 kg", price: 500, costPrice: 390, stock: 150 }
                  ],
                  in_stock: true,
                  total_stock: 150,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "સીંગતેલ શુદ્ધ તેલ (Groundnut Oil)",
                  name_gu: "સીંગતેલ શુદ્ધ તેલ (Groundnut Oil)",
                  name_hi: "मूंगफली का तेल (Groundnut Oil)",
                  english_name: "Groundnut Oil",
                  name_en: "Groundnut Oil",
                  description: "શુદ્ધ ઓર્ગેનિક ફિલ્ટર કરેલ સીંગતેલ શીશો (Filtered Premium Groundnut Oil)",
                  description_gu: "શુદ્ધ ઓર્ગેનિક ફિલ્ટર કરેલ સીંગતેલ શીશો",
                  description_hi: "शुद्ध मूंगफली का तेल",
                  description_en: "Filtered Premium Groundnut Oil",
                  image_url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 L", price: 185, costPrice: 155, stock: 100 },
                    { unit: "5 L", price: 900, costPrice: 770, stock: 100 }
                  ],
                  in_stock: true,
                  total_stock: 100,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ખાંડ (Sugar)",
                  name_gu: "ખાંડ (Sugar)",
                  name_hi: "चीनी/शक्कर (Sugar)",
                  english_name: "Sugar",
                  name_en: "Sugar",
                  description: "મોટા સ્ફટિકવાળી મીઠી શુદ્ધ ખાંડ (Pure White Sulphur-Free Sugar)",
                  description_gu: "મોટા સ્ફટિકવાળી મીઠી શુદ્ધ ખાંડ",
                  description_hi: "सफेद चीनी",
                  description_en: "Pure White Sulphur-Free Sugar",
                  image_url: "https://images.unsplash.com/photo-1581441617925-afab044d03e9?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 48, costPrice: 38, stock: 250 },
                    { unit: "5 kg", price: 230, costPrice: 185, stock: 250 }
                  ],
                  in_stock: true,
                  total_stock: 250,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "તુવેર દાળ (Toor Dal)",
                  name_gu: "તુવેર દાળ (Toor Dal)",
                  name_hi: "अरहर/तुवर दाल (Toor Dal)",
                  english_name: "Toor Dal",
                  name_en: "Toor Dal",
                  description: "ઓર્ગેનિક અને પચી રહે તેવી મીઠી તુવેર દાળ (Organic Unpolished Toor Dal)",
                  description_gu: "ઓર્ગેનિક અને પચી રહે તેવી મીઠી તુવેર દાળ",
                  description_hi: "अरहर दाल",
                  description_en: "Organic Unpolished Toor Dal",
                  image_url: "https://images.unsplash.com/photo-1585994191142-6e1cdaed90b7?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 160, costPrice: 125, stock: 120 }
                  ],
                  in_stock: true,
                  total_stock: 120,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "ચણા દાળ (Chana Dal)",
                  name_gu: "ચણા દાળ (Chana Dal)",
                  name_hi: "चना दाल (Chana Dal)",
                  english_name: "Chana Dal",
                  name_en: "Chana Dal",
                  description: "શુદ્ધ અને કડક દેશી ચણાની દાળ (Premium Quality Chana Dal)",
                  description_gu: "શુદ્ધ અને કડક દેશી ચણાની દાળ",
                  description_hi: "चना दाल",
                  description_en: "Premium Quality Chana Dal",
                  image_url: "https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 95, costPrice: 72, stock: 110 }
                  ],
                  in_stock: true,
                  total_stock: 110,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "મગ દાળ (Moong Dal)",
                  name_gu: "મગ દાળ (Moong Dal)",
                  name_hi: "मूंग दाल (Moong Dal)",
                  english_name: "Moong Dal",
                  name_en: "Moong Dal",
                  description: "ફોતરા વગરની પીળી શુદ્ધ અને હેલ્ધી મગ દાળ (Polished Yellow Moong Dal)",
                  description_gu: "ફોતરા વગરની પીળી શુદ્ધ અને હેલ્ધી મગ દાળ",
                  description_hi: "मूंग दाल पीली",
                  description_en: "Polished Yellow Moong Dal",
                  image_url: "https://images.unsplash.com/photo-1547058881-aa0edd92aab3?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 130, costPrice: 102, stock: 130 }
                  ],
                  in_stock: true,
                  total_stock: 130,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "મીઠું (Iodized Salt)",
                  name_gu: "મીઠું (Iodized Salt)",
                  name_hi: "नमक (Salt)",
                  english_name: "Iodized Salt",
                  name_en: "Iodized Salt",
                  description: "ટાટા શુદ્ધ આયોડાઇઝ્ડ પાઉડર મીઠું (Tata Iodized Salt)",
                  description_gu: "ટાટા શુદ્ધ આયોડાઇઝ્ડ પાઉડર મીઠું",
                  description_hi: "टाटा नमक",
                  description_en: "Tata Iodized Salt",
                  image_url: "https://images.unsplash.com/photo-1626139572239-cf7af30c6a99?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "1 kg", price: 28, costPrice: 18, stock: 300 }
                  ],
                  in_stock: true,
                  total_stock: 300,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "વાઘ બકરી ચા (Tea Leaves)",
                  name_gu: "વાઘ બકરી ચા (Tea Leaves)",
                  name_hi: "चाय पत्ती (Tea Leaves)",
                  english_name: "Tea Leaves",
                  name_en: "Tea Leaves",
                  description: "સુગંધિત કડક અને પ્રખ્યાત વાઘ બકરી ચા (Famous Wagh Bakri Tea Leaves)",
                  description_gu: "સુગંધિત કડક અને પ્રખ્યાત વાઘ બકરી ચા",
                  description_hi: "वाघ बकरी चाय पत्ती",
                  description_en: "Famous Wagh Bakri Tea Leaves",
                  image_url: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop&q=60",
                  category: "grocery",
                  pricing_options: [
                    { unit: "500 g", price: 190, costPrice: 160, stock: 120 }
                  ],
                  in_stock: true,
                  total_stock: 120,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },

                // Namkeens (Category: namkeen)
                {
                  name: "તીખા ગાંઠિયા (Tikha Ganthiya)",
                  name_gu: "તીખા ગાંઠિયા (Tikha Ganthiya)",
                  name_hi: "तीखे गांठिया (Tikha Ganthiya)",
                  english_name: "Tikha Ganthiya",
                  name_en: "Tikha Ganthiya",
                  description: "રાજકોટી સ્વાદિષ્ટ તીખા ગાંઠિયા (Famous Rajkoti Spicy Ganthiya)",
                  description_gu: "રાજકોટી સ્વાદિષ્ટ તીખા ગાંઠિયા",
                  description_hi: "तीखे गांठिया",
                  description_en: "Famous Rajkoti Spicy Ganthiya",
                  image_url: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "250 g", price: 70, costPrice: 48, stock: 100 },
                    { unit: "500 g", price: 135, costPrice: 90, stock: 100 }
                  ],
                  in_stock: true,
                  total_stock: 100,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "વાણેલા ગાંઠિયા (Vanela Ganthiya)",
                  name_gu: "વાણેલા ગાંઠિયા (Vanela Ganthiya)",
                  name_hi: "केले गांठिया/वनेला (Vanela Ganthiya)",
                  english_name: "Vanela Ganthiya",
                  name_en: "Vanela Ganthiya",
                  description: "મુલાયમ ગરમ રસોડા જેવા વાણેલા ગાંઠિયા (Special Soft Vanela Ganthiya)",
                  description_gu: "મુલાયમ ગરમ રસોડા જેવા વાણેલા ગાંઠિયા",
                  description_hi: "नरम वनेला गांठिया",
                  description_en: "Special Soft Vanela Ganthiya",
                  image_url: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "250 g", price: 70, costPrice: 48, stock: 95 },
                    { unit: "500 g", price: 135, costPrice: 90, stock: 95 }
                  ],
                  in_stock: true,
                  total_stock: 95,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "નાયલોન સેવ (Nylon Sev)",
                  name_gu: "નાયલોન સેવ (Nylon Sev)",
                  name_hi: "नायलॉन सेव (Nylon Sev)",
                  english_name: "Nylon Sev",
                  name_en: "Nylon Sev",
                  description: "ઝીણી અને અતિ કરકરી ક્રિસ્પી નાયલોન સેવ (Crispy Fine Nylon Sev)",
                  description_gu: "ઝીણી અને અતિ કરકરી ક્રિસ્પી નાયલોન સેવ",
                  description_hi: "बारीक नायलॉन सेव",
                  description_en: "Crispy Fine Nylon Sev",
                  image_url: "https://images.unsplash.com/photo-1589476993333-f55b84301219?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "250 g", price: 65, costPrice: 42, stock: 80 },
                    { unit: "500 g", price: 125, costPrice: 80, stock: 80 }
                  ],
                  in_stock: true,
                  total_stock: 80,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "બટાકા વેફર્સ (Potato Wafers)",
                  name_gu: "બટાકા વેફર્સ (Potato Wafers)",
                  name_hi: "आलू वेफर्स (Potato Wafers)",
                  english_name: "Potato Wafers",
                  name_en: "Potato Wafers",
                  description: "ફરાળી કરકરી બટાકા ની વેફર્સ મસાલા વાળી (Crispy Crunchy Potato Chips)",
                  description_gu: "ફરાળી કરકરી બટાકા ની વેફર્સ મસાલા વાળી",
                  description_hi: "आलू चिप्स",
                  description_en: "Crispy Crunchy Potato Chips",
                  image_url: "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "200 g", price: 60, costPrice: 40, stock: 150 }
                  ],
                  in_stock: true,
                  total_stock: 150,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "મસાલા સીંગ (Masala Shing)",
                  name_gu: "મસાલા સીંગ (Masala Shing)",
                  name_hi: "मसाला मूंगफली (Masala Shing)",
                  english_name: "Masala Shing",
                  name_en: "Masala Shing",
                  description: "ખારી મીઠી ચટપટી લસણીયા મસાલા સીંગ (Spicy Garlicky Peanut Namkeen)",
                  description_gu: "ખારી મીઠી ચટપટી લસણીયા મસાલા સીંગ",
                  description_hi: "मसाला सिंग",
                  description_en: "Spicy Garlicky Peanut Namkeen",
                  image_url: "https://images.unsplash.com/photo-1569562211093-4ed0d0758f12?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "250 g", price: 65, costPrice: 42, stock: 120 }
                  ],
                  in_stock: true,
                  total_stock: 120,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                },
                {
                  name: "મિક્સ ચવાણું (Khatta Meetha Chavanu)",
                  name_gu: "મિક્સ ચવાણું (Khatta Meetha Chavanu)",
                  name_hi: "खट्टा मीठा चबाना (Chavanu)",
                  english_name: "Khatta Meetha Chavanu",
                  name_en: "Khatta Meetha Chavanu",
                  description: "ગુજરાતી ખટ્ટમીઠું ટેસ્ટી મિક્સ ચવાણું (Gujarati Sweet & Sour Chavanu Mixture)",
                  description_gu: "ગુજરાતી ખટ્ટમીઠું ટેસ્ટી મિક્સ ચવાણું",
                  description_hi: "खट्टा मीठा चबाना",
                  description_en: "Gujarati Sweet & Sour Chavanu Mixture",
                  image_url: "https://images.unsplash.com/photo-1601050690597-df056fb4ce78?w=500&auto=format&fit=crop&q=60",
                  category: "namkeen",
                  pricing_options: [
                    { unit: "250 g", price: 70, costPrice: 48, stock: 140 },
                    { unit: "500 g", price: 135, costPrice: 90, stock: 140 }
                  ],
                  in_stock: true,
                  total_stock: 140,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }
              ];

              for (const veg of defaultVeggies) {
                const newDocRef = doc(vegCollection);
                await setDoc(newDocRef, veg);
              }
            }

            // Create global settings document AFTER veggies have been successfully created,
            // locking down write operations securely so !exists() checks turn false.
            await setDoc(settingsRef, {
              free_delivery_distance: 5,
              free_delivery_threshold: 500,
              delivery_charge: 30,
              whatsapp_number: '919876543210',
              is_shop_open: true,
              warehouse_address: 'Rajkot, Gujarat, India',
              warehouse_lat: 22.3039,
              warehouse_lng: 70.8022,
              delivery_slots: ["09:00 AM - 11:00 AM", "12:00 PM - 02:00 PM", "05:00 PM - 07:00 PM"],
              show_homepage_deal: true,
              homepage_deal_title: "નવી ઓપનિંગ ઓફર! (New Opening Offer!)",
              homepage_deal_sub: "રૂ. ૩૯૯ થી વધુની ખરીદી પર તાજા ટામેટા ફ્રી મેળવો! (Get fresh tomatoes free on orders above ₹399!)",
              homepage_deal_code: "WELCOME",
              free_item_threshold: 399,
              free_item_name: "Fresh Tomato (તાજા ટામેટા)",
              free_item_image: "https://images.unsplash.com/photo-1595855759920-86582396756a?w=500&auto=format&fit=crop&q=60",
              free_item_weight: "500g",
              free_item_description: "તાજા અને લાલ ટમેટા (Fresh and red tomatoes)",
              free_item_mrp: 30,
              is_free_item_active: true,
              updated_at: serverTimestamp()
            });
          } catch (writeErr) {
            console.error('Error writing fallback/seeding to Firestore:', writeErr);
          }
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
          whatsappNumber: data.whatsapp_number || data.whatsappNumber || '',
          isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
          warehouseAddress: data.warehouse_address || data.warehouseAddress || '',
          warehouseLat: data.warehouse_lat || data.warehouseLat || 23.0225,
          warehouseLng: data.warehouse_lng || data.warehouseLng || 72.5714,
          deliverySlots: data.delivery_slots || data.deliverySlots || [],
          showHomepageDeal: data.show_homepage_deal ?? data.showHomepageDeal ?? true,
          homepageDealTitle: data.homepage_deal_title || data.homepageDealTitle || '',
          homepageDealSub: data.homepage_deal_sub || data.homepageDealSub || '',
          homepageDealCode: data.homepage_deal_code || data.homepageDealCode || '',
          freeItemThreshold: data.free_item_threshold || data.freeItemThreshold || 0,
          freeItemName: data.free_item_name || data.freeItemName || '',
          freeItemImage: data.free_item_image || data.freeItemImage || '',
          freeItemWeight: data.free_item_weight || data.freeItemWeight || '',
          freeItemDescription: data.free_item_description || data.freeItemDescription || '',
          freeItemMRP: data.free_item_mrp || data.freeItemMRP || 0,
          isFreeItemActive: data.is_free_item_active ?? data.isFreeItemActive ?? false,
          updatedAt: data.updated_at?.toDate?.()?.toISOString() || data.updated_at || new Date().toISOString()
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
        
        try {
          const profileRef = doc(db, 'profiles', firebaseUser.uid);
          const profileSnap = await getDoc(profileRef);
          
          const isAdmin = firebaseUser.email === 'patelb393@gmail.com' || 
                         firebaseUser.email === 'peacockverse@gmail.com' ||
                         firebaseUser.email === '7043439580@farm.com' || 
                         firebaseUser.email === '9723786200@farm.com' ||
                         firebaseUser.email === '99449944@farm.com';

          if (profileSnap.exists()) {
            const profileData = profileSnap.data();
            
            // Auto-upgrade to admin role for these specific users
            if (isAdmin && profileData.role !== 'admin') {
              try {
                const { updateDoc } = await import('firebase/firestore');
                await updateDoc(profileRef, { role: 'admin' });
                profileData.role = 'admin';
              } catch (e) {
                console.error("Failed to upgrade admin role:", e);
              }
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
          }
        } catch (error) {
          console.error("Profile sync error", error);
        }
      } else {
        setUser(null);
        setProfile(null);
        setLoginStep('phone');
      }
      setIsAuthReady(true);
      clearTimeout(timeout);
    });

    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  // Handle local profile for guests if Firebase Auth is not available
  useEffect(() => {
    if (isAuthReady && !user) {
      const localProfile = localStorage.getItem('guest_profile');
      if (localProfile) {
        try {
          const parsed = JSON.parse(localProfile);
          setUser({
            uid: parsed.uid || 'guest_user',
            email: parsed.email || `${parsed.phone || 'guest'}@farm.com`
          });
          setProfile({
            uid: parsed.uid || 'guest_' + Math.random().toString(36).substr(2, 9),
            ...parsed,
            role: 'user'
          } as any);
        } catch (e) {
          console.error("Error parsing local profile", e);
        }
      } else {
        // If no local profile and no user, we'll create a skeleton for the modal to pick up
        setProfile({
          uid: 'guest_' + Math.random().toString(36).substr(2, 9),
          firstName: '',
          lastName: '',
          phone: '',
          address: '',
          role: 'user'
        } as any);
      }
    }
  }, [isAuthReady, user]);

  const [loginInProgress, setLoginInProgress] = useState(false);
  const loginRef = useRef(false);

  const login = () => {
    setLoginStep('phone');
    // For mobile, we might want to scroll to the top or show a modal
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const logout = async () => {
    localStorage.removeItem('guest_profile');
    setUser(null);
    setProfile(null);
    setLoginStep('phone');
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
             setUser={setUser}
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
             loginStep={loginStep}
             setLoginStep={setLoginStep}
             authError={authError}
             setAuthError={setAuthError}
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
  setUser,
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
  loginStep,
  setLoginStep,
  authError,
  setAuthError,
  t,
  isProfileIncomplete
}: any) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cart } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [email, setEmail] = useState('');
  const [emailMode, setEmailMode] = useState<'login' | 'signup'>('login');
  const [authLoading, setAuthLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
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
            {(['en', 'gu'] as Language[]).map((lang) => (
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
                    {lang === 'en' ? 'English' : 'Gujarati'}
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

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phoneNumber.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) return;
    
    setPhoneNumber(cleanPhone);
    setAuthLoading(true);
    setAuthError(null);
    setErrorMessage(null);
    try {
      const { checkUserExists } = await import('./lib/firebase');
      const userExists = await checkUserExists(cleanPhone);

      if (userExists) {
        setLoginStep('password');
      } else {
        setLoginStep('signup');
      }
    } catch (err: any) {
      console.error("Auth check error", err);
      // If we can't check, we'll try signup and handle "already in use" there
      setLoginStep('signup'); 
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthLoading(true);
    setAuthError(null);
    setErrorMessage(null);
    try {
      const { loginWithEmail, registerWithEmail } = await import('./lib/firebase');
      if (emailMode === 'login') {
        try {
          await loginWithEmail(email, password);
        } catch (authErr: any) {
          if (authErr.code === 'auth/operation-not-allowed' || authErr.message?.includes('auth/operation-not-allowed') || authErr.message?.includes('operation-not-allowed')) {
            console.log("Email auth provider disabled, trying local profile fallback login");
            // Local fallback query for email
            const q = query(collection(db, 'profiles'), where('email', '==', email));
            const querySnap = await getDocs(q);
            let localProfile = null;
            if (!querySnap.empty) {
              const docSnap = querySnap.docs[0];
              const data = docSnap.data();
              const adminEmails = ['patelb393@gmail.com', 'peacockverse@gmail.com', '7043439580@farm.com', '9723786200@farm.com', '99449944@farm.com'];
              const role = adminEmails.includes(email) ? 'admin' : (data.role || 'user');
              localProfile = {
                uid: docSnap.id,
                email: email,
                role: role,
                firstName: data.first_name || data.firstName || '',
                lastName: data.last_name || data.lastName || '',
                gender: data.gender || 'male',
                phone: data.phone || '',
                address: data.address || '',
                age: data.age || '',
                lat: data.lat || 0,
                lng: data.lng || 0,
                password_visible: data.password_visible || ''
              };
            }

            if (localProfile) {
              if (!localProfile.password_visible || localProfile.password_visible === password) {
                localStorage.setItem('guest_profile', JSON.stringify(localProfile));
                setUser({ uid: localProfile.uid, email: localProfile.email });
                setProfile(localProfile as any);
                setLoginStep('phone');
                return;
              } else {
                setAuthError('કોડ (Password) ખોટો છે.');
                return;
              }
            } else {
              setEmailMode('signup');
              setAuthError('આ ઈમેઈલ રજીસ્ટર નથી, કૃપા કરીને નવું ખાતું બનાવો.');
              return;
            }
          } else {
            throw authErr;
          }
        }
      } else {
        const adminEmails = ['patelb393@gmail.com', 'peacockverse@gmail.com', '7043439580@farm.com', '9723786200@farm.com', '99449944@farm.com'];
        const role = adminEmails.includes(email) ? 'admin' : 'user';

        let uid;
        try {
          const userCredential = await registerWithEmail(email, password);
          uid = userCredential.user.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/operation-not-allowed' || authErr.message?.includes('auth/operation-not-allowed') || authErr.message?.includes('operation-not-allowed')) {
            uid = 'local_' + email.replace(/[^a-zA-Z0-9]/g, '_');
          } else {
            throw authErr;
          }
        }
        setUser({ uid: uid, email: email });
        setLoginStep('signup');
      }
    } catch (err: any) {
      console.error("Email auth error:", err);
      const isWrongPassword = err.message?.includes('auth/wrong-password') || err.message?.includes('invalid-credential') || err.code === 'auth/wrong-password';
      setAuthError(isWrongPassword ? 'કોડ (Password) ખોટો છે.' : err.message || (emailMode === 'login' ? 'લૉગિન નિષ્ફળ ગયું.' : 'રજીસ્ટ્રેશન નિષ્ફળ ગયું.'));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { signInWithGoogle } = await import('./lib/firebase');
      await signInWithGoogle();
    } catch (err: any) {
      console.error("Google login error:", err);
      setAuthError(err.message || 'ગૂગલ લૉગિન નિષ્ફળ ગયું.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { loginWithPhone } = await import('./lib/firebase');
      await loginWithPhone(phoneNumber, password);
    } catch (err: any) {
      console.error("Login key error", err);
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('auth/operation-not-allowed') || err.message?.includes('operation-not-allowed')) {
        try {
          const localProfileStr = localStorage.getItem('guest_profile');
          let localProfile = null;
          if (localProfileStr) {
            try {
              const parsed = JSON.parse(localProfileStr);
              if (parsed.phone === phoneNumber) {
                localProfile = parsed;
              }
            } catch (pErr) {}
          }
          
          if (!localProfile) {
            const profileRef = doc(db, 'profiles', 'local_' + phoneNumber);
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              const data = profileSnap.data();
              const isAdminNum = phoneNumber === '9723786200' || phoneNumber === '99449944' || phoneNumber === '7043439580';
              localProfile = {
                uid: 'local_' + phoneNumber,
                email: data.email || `${phoneNumber}@farm.com`,
                role: isAdminNum ? 'admin' : (data.role || 'user'),
                firstName: data.first_name,
                lastName: data.last_name,
                gender: data.gender,
                phone: phoneNumber,
                address: data.address,
                age: data.age,
                lat: data.lat,
                lng: data.lng,
                password_visible: data.password_visible || ''
              };
            }
          }

          if (localProfile) {
            if (!localProfile.password_visible || localProfile.password_visible === password) {
              localStorage.setItem('guest_profile', JSON.stringify(localProfile));
              setUser({ uid: localProfile.uid, email: localProfile.email });
              setProfile(localProfile as any);
              setLoginStep('phone');
              return;
            } else {
              setAuthError('કોડ (Password) ખોટો છે.');
              return;
            }
          } else {
            setLoginStep('signup');
            return;
          }
        } catch (fallbackErr) {
          console.error("Local login fallback failed:", fallbackErr);
        }
        setAuthError('Email/Password provider is disabled. Please enable it in Firebase Console.');
      } else {
        setAuthError(err.message?.includes('auth/wrong-password') || err.message?.includes('invalid-credential') ? 'કોડ (Password) ખોટો છે.' : 'લોગિન નિષ્ફળ ગયું.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  if (!user || (user && !profile?.firstName)) {
    if (loginStep === 'phone') {
      return (
        <div className="min-h-screen bg-farm-g1 flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full bg-farm-g4 opacity-[0.05]" />
          <div className="absolute bottom-[-100px] left-[-100px] w-[300px] h-[300px] rounded-full bg-farm-g4 opacity-[0.05]" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm space-y-8 relative z-10"
          >
            <div className="text-center">
              <div className="w-24 h-24 bg-farm-g2/10 border border-farm-g3/30 rounded-[32px] flex items-center justify-center mx-auto mb-6 backdrop-blur-md shadow-2xl animate-float">
                <ShoppingBasket className="h-12 w-12 text-farm-s2" />
              </div>
              <h1 className="text-5xl font-black text-white tracking-tighter mb-2 font-syne italic uppercase">
                Fresh <span className="text-farm-s2">Farm</span>
              </h1>
              <p className="text-[10px] font-bold text-white/40 tracking-[0.4em] uppercase mb-12">GUJARAT'S FINEST</p>
            </div>

            <div className="bg-white/5 p-8 rounded-[38px] border border-white/10 backdrop-blur-xl shadow-2xl space-y-6">
              {/* Tab Selector */}
              <div className="grid grid-cols-2 gap-2 bg-white/5 p-1.5 rounded-[20px] border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('phone');
                    setAuthError(null);
                  }}
                  className={`py-3 rounded-[14px] text-xs font-black uppercase tracking-widest transition-all ${
                    loginMethod === 'phone'
                      ? 'bg-farm-s2 text-farm-g1 shadow-lg'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  મોબાઇલ (Phone)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('email');
                    setAuthError(null);
                  }}
                  className={`py-3 rounded-[14px] text-xs font-black uppercase tracking-widest transition-all ${
                    loginMethod === 'email'
                      ? 'bg-farm-s2 text-farm-g1 shadow-lg'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  ઈમેઈલ (Email)
                </button>
              </div>

              {loginMethod === 'phone' ? (
                <form onSubmit={handlePhoneSubmit} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-farm-s2 uppercase tracking-[0.2em] ml-1 opacity-80">Enter Mobile Number</label>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-white/40 font-bold">+91</span>
                      <input
                        required
                        type="tel"
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="w-full pl-16 pr-6 py-5 bg-white/10 border-2 border-white/10 rounded-[22px] outline-none focus:border-farm-s2 focus:bg-white/20 transition-all font-black text-white text-lg placeholder:text-white/20"
                        placeholder="9876543210"
                      />
                    </div>
                  </div>

                  {authError && (
                    <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-2xl text-center">
                      <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider leading-relaxed">{authError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={phoneNumber.length < 10 || authLoading}
                    className="w-full bg-farm-s2 text-farm-g1 py-5 rounded-[22px] font-black text-lg shadow-2xl hover:bg-white transition-all flex items-center justify-center gap-3 disabled:opacity-30 disabled:grayscale group"
                  >
                    {authLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Phone className="h-6 w-6 group-hover:rotate-12 transition-transform" />}
                    <span className="uppercase tracking-widest italic font-syne">CONTINUE</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleEmailSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-farm-s2 uppercase tracking-[0.2em] ml-1 opacity-80">EMAIL ADDRESS</label>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full px-6 py-4 bg-white/10 border-2 border-white/10 rounded-[22px] outline-none focus:border-farm-s2 focus:bg-white/20 transition-all font-bold text-white text-base placeholder:text-white/20"
                        placeholder="name@example.com"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-farm-s2 uppercase tracking-[0.2em] ml-1 opacity-80">PASSWORD</label>
                      <input
                        required
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full px-6 py-4 bg-white/10 border-2 border-white/10 rounded-[22px] outline-none focus:border-farm-s2 focus:bg-white/20 transition-all font-bold text-white text-base placeholder:text-white/20"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  {authError && (
                    <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-2xl text-center">
                      <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider leading-relaxed">{authError}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!email || password.length < 6 || authLoading}
                    className="w-full bg-farm-s2 text-farm-g1 py-5 rounded-[22px] font-black text-lg shadow-2xl hover:bg-white transition-all flex items-center justify-center gap-3 disabled:opacity-30 group"
                  >
                    {authLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogIn className="h-6 w-6 group-hover:translate-x-1 transition-transform" />}
                    <span className="uppercase tracking-widest italic font-syne">
                      {emailMode === 'login' ? 'LOG IN' : 'SIGN UP'}
                    </span>
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode(emailMode === 'login' ? 'signup' : 'login');
                        setAuthError(null);
                      }}
                      className="text-xs text-white/50 hover:text-farm-s2 transition-colors font-bold tracking-wider"
                    >
                      {emailMode === 'login' 
                        ? 'નવું ઈમેઈલ ખાતું બનાવો (Create email account)' 
                        : 'પહેલેથી જ ખાતું છે? લૉગિન કરો (Have account? Log in)'}
                    </button>
                  </div>
                </form>
              )}

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink mx-4 text-[9px] text-white/30 font-bold uppercase tracking-widest">OR</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              {/* Google login Button */}
              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleLogin}
                className="w-full bg-white text-slate-800 hover:bg-slate-50 py-4.5 rounded-[22px] font-black text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-xl border border-white/10"
              >
                <svg className="h-5 w-5 mr-1" viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" strokeLinecap="round" />
                </svg>
                <span className="font-syne italic uppercase">ગૂગલથી લોગિન કરો (GOOGLE SIGN-IN)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const guestId = 'guest_' + Math.random().toString(36).substr(2, 9);
                  const guestUser = {
                    uid: guestId,
                    email: 'guest@farm.com',
                    firstName: 'Guest',
                    lastName: 'User',
                    phone: '9999999999',
                    address: 'Test Address',
                    role: 'user',
                    age: 25,
                    gender: 'male',
                    lat: 23.0225,
                    lng: 72.5714
                  };
                  localStorage.setItem('guest_profile', JSON.stringify(guestUser));
                  setUser({ uid: guestId, email: 'guest@farm.com' });
                  setProfile(guestUser as any);
                }}
                className="w-full bg-white/10 text-white hover:bg-white/20 py-4.5 rounded-[22px] font-bold text-xs tracking-wider transition-all border border-white/10 flex items-center justify-center gap-2"
              >
                <span>ગેસ્ટ તરીકે ચાલુ રાખો (GUEST SIGN-IN)</span>
              </button>
              
              <p className="text-[9px] text-center text-white/30 font-bold uppercase tracking-widest">
                By continuing, you agree to our terms
              </p>
            </div>
          </motion.div>
        </div>
      );
    }

    if (loginStep === 'password') {
      return (
        <div className="min-h-screen bg-farm-g1 flex items-center justify-center p-6 relative overflow-hidden">
          <div className="absolute top-[-100px] right-[-100px] w-[400px] h-[400px] rounded-full bg-farm-g4 opacity-[0.05]" />
          <div className="absolute bottom-[-100px] left-[-100px] w-[300px] h-[300px] rounded-full bg-farm-g4 opacity-[0.05]" />
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm space-y-8 relative z-10"
          >
            <div className="text-center relative">
              <button onClick={() => setLoginStep('phone')} className="absolute -top-4 -left-4 p-3 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors">
                <X className="h-6 w-6" />
              </button>
              <div className="w-20 h-20 bg-farm-g2/10 border border-farm-g3/30 rounded-[28px] flex items-center justify-center mx-auto mb-6 backdrop-blur-md shadow-2xl">
                <ShieldCheck className="h-10 w-10 text-farm-s2" />
              </div>
              <h2 className="text-3xl font-black text-white tracking-tighter mb-1 italic font-syne uppercase">Welcome Back</h2>
              <p className="text-[10px] font-bold text-white/40 tracking-widest uppercase mb-10">Enter password for {phoneNumber}</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-6 bg-white/5 p-8 rounded-[38px] border border-white/10 backdrop-blur-xl shadow-2xl">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-farm-s2 uppercase tracking-[0.2em] ml-1 opacity-80">PASSWORD</label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full p-5 bg-white/10 border-2 border-white/10 rounded-[22px] outline-none focus:border-farm-s2 focus:bg-white/20 transition-all font-black text-white text-lg placeholder:text-white/20"
                  placeholder="••••••••"
                />
              </div>

              {authError && (
                <div className="p-4 bg-red-400/10 border border-red-400/20 rounded-2xl text-center space-y-2">
                  <p className="text-red-400 text-[10px] font-bold uppercase tracking-wider leading-relaxed">{authError}</p>
                  {authError.includes('Firebase Console') && (
                    <div className="mt-2 text-left bg-white/5 p-3 rounded-xl border border-white/10">
                      <p className="text-[10px] text-white/70 font-semibold mb-2">
                        To resolve this, please enable the <b>Email/Password</b> provider under Authenticate Sign-in methods:
                      </p>
                      <a 
                        href="https://console.firebase.google.com/project/just-invention-68gvj/authentication/providers" 
                        target="_blank" 
                        rel="noreferrer"
                        className="inline-block w-full text-center px-4 py-2.5 bg-farm-s2 text-farm-g1 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-white transition-all shadow-lg"
                      >
                        Enable Email & Password ↗
                      </a>
                    </div>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={password.length < 1 || authLoading}
                className="w-full bg-farm-s2 text-farm-g1 py-5 rounded-[22px] font-black text-lg shadow-2xl hover:bg-white transition-all flex items-center justify-center gap-3 disabled:opacity-30 group"
              >
                {authLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <LogIn className="h-6 w-6 group-hover:translate-x-1 transition-transform" />}
                <span className="uppercase tracking-widest italic font-syne">LOG IN</span>
              </button>

              <button 
                type="button"
                onClick={() => setErrorMessage("Please contact support to reset your password.")}
                className="w-full text-[10px] font-black text-white/30 hover:text-farm-s2 transition-colors uppercase tracking-widest"
              >
                Forgot Password?
              </button>
            </form>
          </motion.div>
        </div>
      );
    }

    if (loginStep === 'signup' || (user && !profile?.firstName)) {
      return (
        <SignupScreen 
          user={user}
          phoneNumber={phoneNumber || user?.email?.split('@')[0] || ''} 
          onCancel={() => {
            if (user) {
              logout();
            }
            setLoginStep('phone');
          }} 
          setLoginStep={setLoginStep}
          t={t}
          onComplete={(p: UserProfile) => {
            setUser({ uid: p.uid, email: p.email });
            setProfile(p);
            setLoginStep('phone'); // Reset step for next logout
          }}
        />
      );
    }
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

            {user && (
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

      {totalItems > 0 && !isCartOpen && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="fixed bottom-20 sm:bottom-4 left-4 right-4 z-[45] flex justify-center pointer-events-none"
        >
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full max-w-sm bg-farm-g1 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between border border-farm-g3/30 pointer-events-auto group active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="bg-farm-s2 p-2 rounded-xl text-farm-g1">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div className="text-left">
                <p className="text-[10px] font-black text-farm-s2 uppercase tracking-[0.2em]">{totalItems} {t.navCart}</p>
                <p className="text-sm font-black italic font-syne uppercase tracking-tight">{t.buyNow || 'BUY NOW'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl group-hover:bg-white/20 transition-colors">
               <span className="text-xl font-black font-syne italic">{formatINR(cart.reduce((sum, item) => sum + (item.selectedPrice * item.quantity), 0))}</span>
               <ChevronRight className="h-5 w-5 text-farm-s2" />
            </div>
          </button>
        </motion.div>
      )}

      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} settings={settings} vegetables={vegetables} profile={profile} language={language} t={t} />
      <InstallPwaPrompt user={user} profile={profile} />
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
          <div className="text-[10px] font-bold gu text-farm-muted uppercase tracking-widest">{t.totalSavings}</div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-farm-border shadow-sm group hover:border-farm-g3 transition-colors">
          <div className="text-2xl font-bold text-farm-g1 mb-1">0</div>
          <div className="text-[10px] font-bold gu text-farm-muted uppercase tracking-widest">{t.ordersPlaced}</div>
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
                <p className="text-[10px] text-farm-muted gu font-medium">{t.viewAllOrders}</p>
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
                    <UserIcon className="h-3 w-3" /> {t.edit}
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
                <h4 className="font-bold text-farm-g1 text-sm gu">{t.settings}</h4>
                <p className="text-[10px] text-farm-muted gu font-medium">{t.settingsSub} / Change Language</p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-farm-muted group-hover:text-farm-g1 transition-colors" />
         </button>

         {profile.role === 'admin' && (
            <button onClick={() => window.location.hash = '/admin-portal'} className="w-full bg-farm-g1 text-farm-s2 p-5 rounded-2xl border border-farm-g3 flex items-center justify-between hover:bg-farm-g2 hover:shadow-md transition-all group">
              <div className="flex items-center gap-4">
                <div className="bg-white/10 p-2.5 rounded-xl">
                  <ShieldCheck className="h-5 w-5 text-farm-s2" />
                </div>
                <div className="text-left">
                  <h4 className="font-bold text-white text-sm gu">Admin Dashboard</h4>
                  <p className="text-[10px] text-farm-s2/60 gu font-medium italic">Manage Shop & Orders</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-farm-s2" />
            </button>
         )}

         {user && (
           <button
              onClick={logout}
              className="w-full bg-red-50 text-red-600 py-4.5 rounded-2xl font-bold text-sm tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2.5"
            >
              <LogOut className="h-5 w-5" />
              LOG OUT
            </button>
         )}
      </div>
    </div>
  );
}

function SignupScreen({ user, phoneNumber, onCancel, setLoginStep, t, onComplete }: { user: any, phoneNumber: string, onCancel: () => void, setLoginStep: (s: any) => void, t: any, onComplete: (p: UserProfile) => void }) {
  const isPhonePassedValid = phoneNumber && /^\d{10}$/.test(phoneNumber);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    gender: 'male' as 'male' | 'female',
    password: '',
    address: '',
    age: '',
    lat: 0,
    lng: 0,
    phone: isPhonePassedValid ? phoneNumber : ''
  });
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    handleGetLocation();
  }, []);

  const handleGetLocation = () => {
    setLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData(prev => ({ ...prev, lat: position.coords.latitude, lng: position.coords.longitude }));
          setLocating(false);
        },
        () => setLocating(false),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  const [signupError, setSignupError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSignupError(null);
    try {
      const activePhone = formData.phone || phoneNumber;
      if (!/^\d{10}$/.test(activePhone)) {
        throw new Error("કૃપા કરીને સાચો ૧૦ આંકડાનો મોબાઇલ નંબર દાખલ કરો (Please enter a valid 10-digit mobile number).");
      }

      const { registerWithPhone } = await import('./lib/firebase');
      const adminEmails = ['patelb393@gmail.com', 'peacockverse@gmail.com', '7043439580@farm.com', '9723786200@farm.com', '99449944@farm.com'];
      const userEmail = user?.email || `${activePhone}@farm.com`;
      const role = adminEmails.includes(userEmail) ? 'admin' : 'user';

      let uid = user?.uid;

      if (!user) {
        try {
          const userCredential = await registerWithPhone(activePhone, formData.password);
          uid = userCredential.user.uid;
        } catch (authErr: any) {
          if (authErr.code === 'auth/operation-not-allowed' || authErr.message?.includes('auth/operation-not-allowed') || authErr.message?.includes('operation-not-allowed')) {
            console.warn("Auth provider disabled. Proceeding with local configuration fallback.");
            uid = 'local_' + activePhone;
          } else {
            throw authErr;
          }
        }
      }
      
      const profileData = {
        email: userEmail,
        role: role,
        first_name: formData.firstName,
        last_name: formData.lastName,
        gender: formData.gender,
        phone: activePhone,
        address: formData.address,
        age: Number(formData.age),
        lat: formData.lat || 0,
        lng: formData.lng || 0,
        password_visible: formData.password || '',
        created_at: serverTimestamp()
      };

      try {
        await setDoc(doc(db, 'profiles', uid), profileData);
      } catch (firestoreErr) {
        console.error("Profile setDoc failed", firestoreErr);
      }

      localStorage.setItem('guest_profile', JSON.stringify({
        uid: uid,
        email: userEmail,
        role: role,
        firstName: formData.firstName,
        lastName: formData.lastName,
        phone: activePhone,
        gender: formData.gender,
        address: formData.address,
        age: Number(formData.age),
        lat: formData.lat || 0,
        lng: formData.lng || 0,
        password_visible: formData.password || ''
      }));
      
      onComplete({
        uid: uid,
        ...profileData,
        firstName: formData.firstName,
        lastName: formData.lastName,
        createdAt: new Date().toISOString()
      } as any);
    } catch (err: any) {
      console.error("Signup error", err);
      if (err.code === 'auth/operation-not-allowed' || err.message?.includes('auth/operation-not-allowed') || err.message?.includes('operation-not-allowed')) {
        setSignupError("Email/Password login is not enabled in Firebase Console. Please enable it.");
      } else if (
        err.code === 'auth/email-already-in-use' || 
        err.code === 'email-already-in-use' ||
        (err.message && (
          err.message.includes('already-in-use') || 
          err.message.includes('already registered') ||
          err.message.includes('email-already-in-use') ||
          err.message.includes('(auth/email-already-in-use)')
        ))
      ) {
        setSignupError("This phone number is already registered. Switching to login...");
        // Redirect to password step since they already exist
        setTimeout(() => {
          setLoginStep('password');
        }, 2000);
      } else if (err.code === 'auth/invalid-email') {
        setSignupError("Invalid phone format for registration.");
      } else {
        setSignupError(err.message || 'Registration failed. Please check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-farm-g1/90 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 max-h-[90vh] flex flex-col">
        <div className="p-8 pb-6 bg-[#1a3a1a] text-white relative flex-shrink-0">
          <button onClick={onCancel} className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors">
            <X className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-4 mb-2">
            <h3 className="text-3xl font-black italic tracking-tight font-syne">Join Fresh Farm</h3>
          </div>
          <p className="text-[10px] font-black text-farm-s2 leading-relaxed uppercase tracking-[0.15em] opacity-80 font-mono">
            {user?.email || `Mobile: ${phoneNumber}`}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto no-scrollbar flex-1">
          {signupError && (
            <div className="p-4 bg-red-50 border-2 border-red-100 rounded-2xl space-y-2 text-center">
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest leading-relaxed">{signupError}</p>
              {signupError.includes('already registered') && (
                <button 
                  type="button"
                  onClick={() => onCancel()}
                  className="text-[10px] font-black text-farm-g1 underline uppercase tracking-widest"
                >
                  GO TO LOGIN
                </button>
              )}
            </div>
          )}
          
          {!isPhonePassedValid && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">MOBILE NUMBER (મોબાઇલ નંબર)</label>
              <input required type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold" placeholder="9876543210" maxLength={10} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">FIRST NAME</label>
              <input required type="text" value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">LAST NAME</label>
              <input required type="text" value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold" />
            </div>
          </div>

          {!user && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">CREATE PASSWORD (તમારા માટે કોડ)</label>
              <input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold" placeholder="Minimum 6 characters" minLength={6} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">AGE (ઉંમર)</label>
              <input required type="number" value={formData.age} onChange={e => setFormData({ ...formData, age: e.target.value })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">GENDER</label>
              <select value={formData.gender} onChange={e => setFormData({ ...formData, gender: e.target.value as any })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold">
                <option value="male">MALE</option>
                <option value="female">FEMALE</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1">DELIVERY ADDRESS (સરનામું)</label>
            <textarea required value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="w-full p-4 bg-farm-cream border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 font-bold min-h-[100px]" />
          </div>

          <div className="p-4 bg-farm-cream rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-farm-g1 uppercase tracking-widest">LOCATION</label>
              <button type="button" onClick={handleGetLocation} className="text-[10px] font-black text-farm-g1 underline">{locating ? 'LOCATING...' : 'REFRESH'}</button>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 text-center bg-white p-2 rounded-xl border border-farm-border">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest">LAT</p>
                <p className="text-xs font-mono font-black">{formData.lat.toFixed(4)}</p>
              </div>
              <div className="flex-1 text-center bg-white p-2 rounded-xl border border-farm-border">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest">LNG</p>
                <p className="text-xs font-mono font-black">{formData.lng.toFixed(4)}</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-farm-g1 text-farm-s2 py-5 rounded-[24px] font-black text-xl shadow-xl hover:bg-farm-g2 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <CheckCircle className="h-6 w-6" />}
            <span className="font-syne italic uppercase tracking-tight">REGISTER & START</span>
          </button>
        </form>
      </div>
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
      const isGuest = !auth.currentUser;
      
      if (!isGuest) {
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
      }
      
      // Always store in localStorage for guest mode persistence
      localStorage.setItem('guest_profile', JSON.stringify({
        ...formData,
        uid: profile.uid,
        age: Number(formData.age)
      }));
      
      onSave({ ...profile, ...formData, age: Number(formData.age) });
    } catch (err) {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.UPDATE, `profiles/${profile.uid}`);
      } else {
        console.error("Local save fallback", err);
        onSave({ ...profile, ...formData, age: Number(formData.age) });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-farm-g1/90 backdrop-blur-md">
      <div className="bg-white w-full max-w-md rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500">
        <div className="p-8 pb-6 bg-[#1a3a1a] text-white relative overflow-hidden border-b-[6px] border-farm-s2/20">
          <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-farm-s2 opacity-5 rounded-full blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 shadow-inner">
                <UserIcon className="h-8 w-8 text-farm-s2" />
              </div>
              <h3 className="text-3xl font-black italic tracking-tight font-syne">
                Complete Your Profile
              </h3>
            </div>
            <p className="text-[10px] font-black text-farm-s2 mt-2 leading-relaxed uppercase tracking-[0.15em] opacity-80">
              THESE DETAILS ARE REQUIRED TO PLACE AN ORDER.
            </p>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto no-scrollbar pb-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">FIRST NAME</label>
              <input
                required
                type="text"
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full p-4 bg-farm-cream/50 border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted/30"
                placeholder="e.g. Ramesh"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">LAST NAME</label>
              <input
                required
                type="text"
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full p-4 bg-farm-cream/50 border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted/30"
                placeholder="e.g. Patel"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">GENDER</label>
            <div className="flex gap-4">
              {['male', 'female'].map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setFormData({ ...formData, gender: g as any })}
                  className={`flex-1 py-4 rounded-2xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                    formData.gender === g 
                      ? 'border-farm-g1 bg-farm-g1 text-farm-s2 shadow-lg shadow-farm-g1/20' 
                      : 'border-farm-border bg-white text-farm-muted/60 hover:border-farm-g2'
                  }`}
                >
                  {g === 'male' ? 'MALE' : 'FEMALE'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">AGE</label>
              <input
                required
                type="number"
                value={formData.age}
                onChange={e => setFormData({ ...formData, age: e.target.value })}
                className="w-full p-4 bg-farm-cream/50 border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted/30"
                placeholder="25"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">MOBILE NUMBER</label>
              <input
                required
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                className="w-full p-4 bg-farm-cream/50 border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted/30"
                placeholder="9876543210"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[10px] font-black text-farm-g1 uppercase tracking-widest ml-1 opacity-70">DELIVERY ADDRESS</label>
            <textarea
              required
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              className="w-full p-5 bg-farm-cream/50 border-2 border-farm-border rounded-[24px] outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 min-h-[110px] placeholder:text-farm-muted/30 leading-relaxed"
              placeholder="Full delivery address"
            />
          </div>

          <div className="p-6 bg-farm-cream/30 rounded-[32px] border-2 border-farm-border space-y-4 shadow-inner">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-farm-g1 flex items-center gap-2 uppercase tracking-widest opacity-80">
                <MapPin className="h-4 w-4 text-farm-s2" />
                YOUR LOCATION
              </label>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="text-[11px] font-black text-farm-g1 underline underline-offset-4 uppercase tracking-widest hover:text-farm-g2 flex items-center gap-1 transition-colors disabled:opacity-50"
              >
                {locating ? 'LOCATING...' : 'AUTO LOCATE'}
              </button>
            </div>
            
            <div className="flex gap-4">
              <div className="flex-1 bg-white/50 p-3 rounded-2xl border border-farm-border text-center">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest mb-1 opacity-50">LAT</p>
                <p className="text-sm font-mono font-black text-farm-g1">{formData.lat ? formData.lat.toFixed(4) : '--'}</p>
              </div>
              <div className="flex-1 bg-white/50 p-3 rounded-2xl border border-farm-border text-center">
                <p className="text-[8px] text-farm-muted uppercase font-black tracking-widest mb-1 opacity-50">LNG</p>
                <p className="text-sm font-mono font-black text-farm-g1">{formData.lng ? formData.lng.toFixed(4) : '--'}</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-farm-g1 text-farm-s2 py-5 rounded-[24px] font-black text-xl shadow-2xl hover:bg-farm-g2 transition-all flex items-center justify-center gap-3 disabled:opacity-50 active:scale-[0.98] group"
          >
            {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
            <span className="font-syne italic uppercase tracking-tight">SAVE & START ORDERING</span>
          </button>
        </form>
      </div>
    </div>
  );
}



