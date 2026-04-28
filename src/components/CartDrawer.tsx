import React, { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext';
import { X, Minus, Plus, Trash2, ShoppingBag, Truck, CheckCircle, CreditCard, MapPin, Phone, User, ChevronRight, AlertCircle, Clock, Search } from 'lucide-react';
import { formatINR, calculateDistance, getRoadDistance, getCoordsFromAddress, getUnitMultiplier } from '../lib/utils';
import { auth, db } from '../lib/firebase';
import { useToast } from '../context/ToastContext';
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs, onSnapshot, orderBy, limit, updateDoc } from 'firebase/firestore';
import { supabase } from '../lib/supabase';
import { AppSettings, Order, OrderItem, UserProfile, Vegetable } from '../types';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

export function CartDrawer({ isOpen, onClose, settings: externalSettings, vegetables, profile: externalProfile, language, t }: { isOpen: boolean, onClose: () => void, settings: AppSettings | null, vegetables?: Vegetable[], profile?: UserProfile | null, language: string, t: any }) {
  const { cart, removeFromCart, updateQuantity, totalPrice, totalItems, clearCart } = useCart();
  const { showToast } = useToast();

  const getVegWeightInCart = (vegId: string) => {
    return cart
      .filter(item => item.id === vegId)
      .reduce((sum, item) => sum + (item.quantity * getUnitMultiplier(item.selectedUnit)), 0);
  };
  const [internalSettings, setInternalSettings] = useState<AppSettings | null>(null);
  const settings = externalSettings || internalSettings;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<any>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    address: '',
    distance: -1,
    lat: 0,
    lng: 0
  });
  const [isCalculatingDist, setIsCalculatingDist] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      // Use external profile if available, otherwise fetch
      if (externalProfile) {
        setProfile(externalProfile);
        setCustomerInfo({
          name: `${externalProfile.firstName || ''} ${externalProfile.lastName || ''}`.trim(),
          phone: externalProfile.phone || '',
          address: externalProfile.address || '',
          distance: -1,
          lat: Number(externalProfile.lat || 0),
          lng: Number(externalProfile.lng || 0)
        });
        return;
      }

      if (auth.currentUser) {
        try {
          const profileRef = doc(db, 'profiles', auth.currentUser.uid);
          const profileSnap = await getDoc(profileRef);
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            const p = {
              uid: profileSnap.id,
              email: data.email,
              role: data.role,
              firstName: data.first_name,
              lastName: data.last_name,
              phone: data.phone,
              address: data.address,
              lat: Number(data.lat || 0),
              lng: Number(data.lng || 0)
            } as UserProfile;
            setProfile(p);
            setCustomerInfo({
              name: `${p.firstName || ''} ${p.lastName || ''}`.trim(),
              phone: p.phone || '',
              address: p.address || '',
              distance: -1,
              lat: p.lat,
              lng: p.lng
            });
          }
        } catch (err) {
          console.error('Error fetching profile in CartDrawer:', err);
        }
      }
    };
    if (isOpen) fetchProfile();
  }, [isOpen, externalProfile]);

  useEffect(() => {
    const updateDistance = async () => {
      if (settings && settings.warehouseLat && settings.warehouseLng) {
        let targetLat = customerInfo.lat;
        let targetLng = customerInfo.lng;

        // If coordinates are missing but address is present, try to geocode
        if ((!targetLat || !targetLng) && customerInfo.address.length > 5) {
          setIsCalculatingDist(true);
          const coords = await getCoordsFromAddress(customerInfo.address);
          if (coords) {
            targetLat = coords.lat;
            targetLng = coords.lng;
            setCustomerInfo(prev => ({ ...prev, lat: coords.lat, lng: coords.lng }));
          } else {
            setIsCalculatingDist(false);
          }
        }

        if (targetLat && targetLng) {
          setIsCalculatingDist(true);
          const roadDist = await getRoadDistance(
            targetLat,
            targetLng,
            settings.warehouseLat,
            settings.warehouseLng,
            settings.distanceAdjustment || 1.0
          );
          console.log(`CartDrawer: Distance updated to ${roadDist.toFixed(2)} km`);
          setCustomerInfo(prev => ({ ...prev, distance: Number(roadDist.toFixed(2)) }));
          setIsCalculatingDist(false);
        }
      }
    };
    
    // Debounce address geocoding
    const timer = setTimeout(() => {
      updateDistance();
    }, 1500);
    
    return () => clearTimeout(timer);
  }, [settings, customerInfo.lat, customerInfo.lng, customerInfo.address]);

  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [error, success]);

  useEffect(() => {
    if (settings?.deliverySlots && settings.deliverySlots.length > 0 && !selectedSlot) {
      setSelectedSlot(settings.deliverySlots[0]);
    }
  }, [settings, selectedSlot]);

  const fetchSettings = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        setInternalSettings({
          freeDeliveryDistance: data.free_delivery_distance || data.freeDeliveryDistance || 0,
          freeDeliveryThreshold: data.free_delivery_threshold || data.freeDeliveryThreshold || 0,
          deliveryCharge: data.delivery_charge || data.deliveryCharge || 0,
          whatsappNumber: data.whatsapp_number || data.whatsappNumber,
          isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
          warehouseAddress: data.warehouse_address || data.warehouseAddress,
          warehouseLat: data.warehouse_lat || data.warehouseLat,
          warehouseLng: data.warehouse_lng || data.warehouseLng,
          distanceAdjustment: data.distance_adjustment || data.distanceAdjustment || 1.0,
          deliveryChargePerKm: data.delivery_charge_per_km || data.deliveryChargePerKm || 0,
          showHomepageDeal: data.show_homepage_deal ?? data.showHomepageDeal ?? true,
          homepageDealTitle: data.homepage_deal_title || data.homepageDealTitle || '',
          homepageDealSub: data.homepage_deal_sub || data.homepageDealSub || '',
          homepageDealCode: data.homepage_deal_code || data.homepageDealCode || '',
          deliverySlots: data.delivery_slots || data.deliverySlots || [],
          updatedAt: data.updated_at || data.updatedAt
        } as AppSettings);
      }
    } catch (err) {
      console.error('Error fetching settings in CartDrawer:', err);
    }
  };

  useEffect(() => {
    if (settings) {
      console.log('CartDrawer Settings loaded:', {
        freeDeliveryDistance: settings.freeDeliveryDistance,
        freeDeliveryThreshold: settings.freeDeliveryThreshold,
        deliveryCharge: settings.deliveryCharge,
        warehouse: `${settings.warehouseLat}, ${settings.warehouseLng}`
      });
    }
  }, [settings]);

  useEffect(() => {
    if (!externalSettings) {
      fetchSettings();
    }

    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setInternalSettings({
          freeDeliveryDistance: data.free_delivery_distance || data.freeDeliveryDistance || 0,
          freeDeliveryThreshold: data.free_delivery_threshold || data.freeDeliveryThreshold || 0,
          deliveryCharge: data.delivery_charge || data.deliveryCharge || 0,
          whatsappNumber: data.whatsapp_number || data.whatsappNumber,
          isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
          warehouseAddress: data.warehouse_address || data.warehouseAddress,
          warehouseLat: data.warehouse_lat || data.warehouseLat,
          warehouseLng: data.warehouse_lng || data.warehouseLng,
          distanceAdjustment: data.distance_adjustment || data.distanceAdjustment || 1.0,
          deliveryChargePerKm: data.delivery_charge_per_km || data.deliveryChargePerKm || 0,
          showHomepageDeal: data.show_homepage_deal ?? data.showHomepageDeal ?? true,
          homepageDealTitle: data.homepage_deal_title || data.homepageDealTitle || '',
          homepageDealSub: data.homepage_deal_sub || data.homepageDealSub || '',
          homepageDealCode: data.homepage_deal_code || data.homepageDealCode || '',
          deliverySlots: data.delivery_slots || data.deliverySlots || [],
          updatedAt: data.updated_at || data.updatedAt
        } as AppSettings);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const handleApplyPromo = async () => {
    if (!promoCodeInput.trim()) return;
    setPromoError(null);
    try {
      const q = query(
        collection(db, 'promo_codes'), 
        where('code', '==', promoCodeInput.trim().toUpperCase()),
        where('is_active', '==', true)
      );
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setPromoError(t.invalidPromo);
        return;
      }

      const data = snap.docs[0].data();
      const minAmount = data.min_order_amount || data.minOrderAmount || 0;

      if (totalPrice < minAmount) {
        setPromoError(t.promoMinAmount.replace('{{amount}}', formatINR(minAmount)));
        return;
      }

      setAppliedPromo({
        ...data,
        id: snap.docs[0].id,
        minOrderAmount: minAmount
      });
      setPromoError(null);
    } catch (err) {
      console.error('Promo error:', err);
      setPromoError(t.promoErrorCheck);
    }
  };

  const handleCheckout = async () => {
    if (settings?.isShopOpen === false) {
      setError(t.shopClosedOrderError);
      return;
    }

    if (!auth.currentUser) {
      setError(t.loginToOrder);
      return;
    }

    if (!customerInfo.name || !customerInfo.phone || !customerInfo.address) {
      setError(t.fillAllDetails);
      return;
    }

    if (customerInfo.lat === 0 && customerInfo.lng === 0) {
      setError(language === 'gu' ? "કૃપા કરીને 'તમારું લોકેશન' રિફ્રેશ કરો." : language === 'hi' ? "कृपया 'आपकी लोकेशन' रिफ्रेश करें।" : "Please refresh 'Your Location'.");
      return;
    }

    if (settings?.deliverySlots && settings.deliverySlots.length > 0 && !selectedSlot) {
      setError(t.selectTimeSlotError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // 1. FETCH LATEST SETTINGS TO BE CERTAIN
      const settingsRef = doc(db, 'settings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      let latestSettings = settings;
      
      if (settingsSnap.exists()) {
        const d = settingsSnap.data();
        latestSettings = {
          freeDeliveryDistance: d.free_delivery_distance || d.freeDeliveryDistance || 0,
          freeDeliveryThreshold: d.free_delivery_threshold || d.freeDeliveryThreshold || 0,
          deliveryCharge: d.delivery_charge || d.deliveryCharge || 0,
          isShopOpen: d.is_shop_open ?? d.isShopOpen ?? true,
          warehouseLat: d.warehouse_lat || d.warehouseLat,
          warehouseLng: d.warehouse_lng || d.warehouseLng,
          distanceAdjustment: d.distance_adjustment || d.distanceAdjustment || 1.0,
          deliveryChargePerKm: d.delivery_charge_per_km || d.deliveryChargePerKm || 0,
          deliverySlots: d.delivery_slots || d.deliverySlots || []
        } as AppSettings;
      }

      if (latestSettings?.isShopOpen === false) {
        setError(t.shopClosedOrderError);
        setLoading(false);
        return;
      }

      // 2. RE-VALIDATE DISTANCE BEFORE CHECKOUT
      let freshDist = customerInfo.distance;
      let freshLat = customerInfo.lat;
      let freshLng = customerInfo.lng;

      if (latestSettings && latestSettings.warehouseLat && latestSettings.warehouseLng) {
        try {
          if ("geolocation" in navigator) {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { 
                enableHighAccuracy: true, 
                timeout: 5000, 
                maximumAge: 0 // Force fresh location
              });
            });
            
            freshLat = position.coords.latitude;
            freshLng = position.coords.longitude;
            
            const distResult = await getRoadDistance(
              freshLat,
              freshLng,
              latestSettings.warehouseLat,
              latestSettings.warehouseLng,
              latestSettings.distanceAdjustment || 1.0
            );
            freshDist = Number(distResult.toFixed(2));

            // Update state for UI consistency
            setCustomerInfo(prev => ({ 
              ...prev, 
              lat: freshLat, 
              lng: freshLng, 
              distance: freshDist 
            }));
            
            console.log(`Checkout: Location re-validated. Distance: ${freshDist} km`);
          }
        } catch (locErr) {
          console.warn('Checkout: Could not re-validate location, using last known.', locErr);
        }
      }

      // 3. CALCULATE FINAL TOTALS LOCALLY (to avoid stale state issues)
      const threshold = latestSettings?.freeDeliveryThreshold || 0;
      const freeDistLimit = latestSettings?.freeDeliveryDistance || 0;
      const baseCharge = latestSettings?.deliveryCharge || 0;
      const chargePerKm = latestSettings?.deliveryChargePerKm || 0;

      const isFreeThreshold = threshold > 0 && totalPrice >= threshold;
      const isFreeDist = freeDistLimit > 0 && freshDist >= 0 && freshDist <= freeDistLimit && (freshLat !== 0 || freshLng !== 0);
      
      const extraCharge = (freshDist > 0 && chargePerKm) ? (freshDist * chargePerKm) : 0;
      const finalDeliveryCharge = (isFreeThreshold || isFreeDist) ? 0 : (baseCharge + extraCharge);
      
      const promoDiscount = appliedPromo ? (
        appliedPromo.type === 'percentage' 
          ? (totalPrice * appliedPromo.value) / 100 
          : appliedPromo.value
      ) : 0;

      const orderTotal = totalPrice + finalDeliveryCharge - promoDiscount;

      // 4. Validate Stock before placing order
      for (const item of cart) {
        if (!item.id) continue;
        const vegRef = doc(db, 'vegetables', item.id);
        const vegSnap = await getDoc(vegRef);
        const veg = vegSnap.data();
        
        if (veg) {
          const pricingOptions = veg.pricing_options || veg.pricingOptions || [];
          const multiplier = getUnitMultiplier(item.selectedUnit);
          const totalWeightNeeded = item.quantity * multiplier;
          
          const currentStock = veg.total_stock ?? veg.totalStock ?? ((pricingOptions.length > 0) ? (pricingOptions[0].stock || 0) : 0);

          if (currentStock < totalWeightNeeded) {
            throw new Error(t.stockError.replace('{{name}}', veg.name));
          }
        }
      }

      if (isNaN(orderTotal) || isNaN(freshDist)) {
        throw new Error(t.calculationError);
      }

      const orderItems: OrderItem[] = cart.map(item => ({
        vegId: item.id || '',
        name: item.name,
        name_gu: item.name_gu,
        name_hi: item.name_hi,
        name_en: item.name_en,
        englishName: item.englishName || '',
        price: item.selectedPrice,
        quantity: item.quantity,
        unit: item.selectedUnit
      }));

      // Generate a unique invoice number using timestamp
      const nextInvoiceNumber = Date.now().toString().slice(-6);
      const ordersRef = collection(db, 'orders');

      await addDoc(ordersRef, {
        user_id: auth.currentUser?.uid || '',
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_address: customerInfo.address,
        items: orderItems,
        total_amount: orderTotal,
        subtotal: totalPrice,
        delivery_charge: finalDeliveryCharge,
        discount_amount: promoDiscount || 0,
        promo_code: appliedPromo?.code || null,
        delivery_slot: selectedSlot || null,
        invoice_number: nextInvoiceNumber,
        status: 'Pending',
        payment_method: paymentMethod || 'COD',
        payment_status: 'Pending',
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
        // Store distance and coords used for reference
        delivery_distance: freshDist,
        delivery_lat: freshLat,
        delivery_lng: freshLng
      });

      // Update Stock reliably
      for (const item of cart) {
        if (!item.id) continue;
        
        const vegRef = doc(db, 'vegetables', item.id);
        const vegSnap = await getDoc(vegRef);
        const veg = vegSnap.data();
        
        if (veg) {
          const pricingOptions = veg.pricing_options || veg.pricingOptions || [];
          const multiplier = getUnitMultiplier(item.selectedUnit);
          const deduction = item.quantity * multiplier;
          
          const currentStock = veg.total_stock ?? veg.totalStock ?? ((pricingOptions.length > 0) ? (pricingOptions[0].stock || 0) : 0);
          const newStock = Math.max(0, Number((currentStock - deduction).toFixed(2)));

          // Update both the top-level total_stock and each pricing option's stock
          const updatedOptions = pricingOptions.map((opt: any) => ({
            ...opt,
            stock: newStock
          }));

          await updateDoc(vegRef, {
            total_stock: newStock,
            totalStock: newStock,
            pricing_options: updatedOptions,
            in_stock: newStock > 0
          });
        }
      }
      
      setSuccess(t.orderSuccess);
      
      // Trigger golden confetti
      const duration = 4000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 6,
          angle: 60,
          spread: 80,
          origin: { x: 0, y: 0.8 },
          colors: ['#FFD700', '#FFA500', '#FF8C00', '#FFF8DC', '#DAA520']
        });
        confetti({
          particleCount: 6,
          angle: 120,
          spread: 80,
          origin: { x: 1, y: 0.8 },
          colors: ['#FFD700', '#FFA500', '#FF8C00', '#FFF8DC', '#DAA520']
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      
      // Start the golden glitter loop
      frame();
      
      setTimeout(() => {
        clearCart();
        setIsCheckingOut(false);
        setSuccess(null);
        onClose();
        
        // Also automatically navigate them to the My Orders page
        window.location.hash = '/my-orders';
      }, 5000);
    } catch (err: any) {
      console.error('Checkout error:', err);
      setError(err.message || t.orderError);
    } finally {
      setLoading(false);
    }
  };

  const freeDeliveryThreshold = settings?.freeDeliveryThreshold || 0;
  const freeDeliveryDistance = settings?.freeDeliveryDistance || 0;
  const deliveryCharge = settings?.deliveryCharge || 0;

  const isFreeByThreshold = freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold;
  const isFreeByDistance = freeDeliveryDistance > 0 && 
                           customerInfo.distance >= 0 && 
                           customerInfo.distance <= freeDeliveryDistance && 
                           (customerInfo.lat !== 0 || customerInfo.lng !== 0);
  
  const baseDeliveryCharge = deliveryCharge;
  const extraDistCharge = (customerInfo.distance > 0 && settings?.deliveryChargePerKm) 
    ? (customerInfo.distance * settings.deliveryChargePerKm) 
    : 0;
  
  const currentDeliveryCharge = (isFreeByThreshold || isFreeByDistance) ? 0 : (baseDeliveryCharge + extraDistCharge);
  
  const discountAmount = appliedPromo ? (
    appliedPromo.type === 'percentage' 
      ? (totalPrice * appliedPromo.value) / 100 
      : appliedPromo.value
  ) : 0;

  const finalTotal = totalPrice + currentDeliveryCharge - discountAmount;

  const remainingForFree = freeDeliveryThreshold - totalPrice;
  const progress = Math.min((totalPrice / freeDeliveryThreshold) * 100, 100);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
        {/* Success/Error Toasts */}
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
          {error && (
            <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 pointer-events-auto">
              <AlertCircle className="h-5 w-5" />
              <span className="font-bold">{error}</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {success && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[500] flex items-center justify-center bg-farm-g1/90 backdrop-blur-md"
            >
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-yellow-500/20 via-transparent to-transparent opacity-60"></div>
              <motion.div
                initial={{ scale: 0.1, y: 100, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: "spring", bounce: 0.6, duration: 0.8 }}
                className="relative flex flex-col items-center justify-center text-center px-6 py-12"
              >
                <div className="w-40 h-40 bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 rounded-full flex items-center justify-center shadow-[0_0_100px_rgba(255,215,0,0.6)] mb-8 border-4 border-white">
                  <CheckCircle className="h-20 w-20 text-white drop-shadow-md" />
                </div>
                
                <motion.h1 
                   initial={{ opacity: 0, scale: 0.8 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ delay: 0.3, type: "spring" }}
                   className="text-4xl sm:text-5xl font-black text-white tracking-tight drop-shadow-2xl mb-4"
                >
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500">Order</span> Confirmed!
                </motion.h1>
                <motion.p
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   transition={{ delay: 0.5 }}
                   className="text-white/90 font-bold text-lg sm:text-xl px-4 py-2 bg-white/10 rounded-full border border-white/20 shadow-inner backdrop-blur-sm"
                >
                  Thank you for shopping with Fresh Farm.
                </motion.p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-6 border-b border-farm-border flex justify-between items-center bg-gradient-to-r from-farm-g1 to-farm-g2 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-farm-s2/20 rounded-xl flex items-center justify-center border border-farm-s2/30">
              <ShoppingBag className="h-5 w-5 text-farm-s2" />
            </div>
            <div>
              <h2 className="text-xl font-bold leading-none">{t.yourCart}</h2>
              <span className="text-[10px] font-bold text-farm-s2 uppercase tracking-[0.2em]">{totalItems} ITEMS</span>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-colors border border-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 no-scrollbar">
          {!isCheckingOut ? (
            <>
              {freeDeliveryThreshold > 0 && cart.length > 0 && (
                <div className="bg-farm-cream p-5 rounded-[24px] border border-farm-border space-y-4 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-[-20px] left-[-20px] w-24 h-24 bg-farm-g4 opacity-20 rounded-full blur-2xl" />
                  <div className="relative z-10">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-farm-g2 flex items-center gap-2 tracking-widest uppercase">
                         <Truck className="h-4 w-4 text-farm-s2" />
                         {t.freeDeliveryScheme}
                       </span>
                       {isFreeByThreshold ? (
                         <span className="text-[10px] font-black text-farm-g4 flex items-center gap-1.5 uppercase tracking-widest animate-bounce">
                           <CheckCircle className="h-3.5 w-3.5" />
                           {t.freeDeliveryGift}
                         </span>
                       ) : (
                         <span className="text-[10px] font-black text-farm-muted tracking-widest">
                           {t.remainingForFree.replace('{{amount}}', formatINR(remainingForFree))}
                         </span>
                       )}
                    </div>
                    <div className="h-3 bg-white border border-farm-border rounded-full overflow-hidden p-[2px]">
                      <div 
                        className="h-full bg-gradient-to-r from-farm-g2 to-farm-g4 rounded-full transition-all duration-700 ease-out" 
                        style={{ width: `${progress}%` }}
                      >
                      </div>
                    </div>
                    {!isFreeByThreshold && (
                      <p className="text-[10px] text-farm-g2 font-bold mt-3 leading-relaxed gu">
                        {t.freeDeliveryBanner.replace('{{threshold}}', formatINR(freeDeliveryThreshold))}
                      </p>
                    )}
                    <p className="text-[9px] text-farm-muted font-bold mt-1 opacity-60">
                      * {t.freeDeliverySmall.replace('{{distance}}', freeDeliveryDistance.toString()).replace('{{charge}}', formatINR(deliveryCharge))}
                    </p>
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-farm-muted space-y-6 py-20">
                  <div className="w-32 h-32 bg-farm-cream rounded-full flex items-center justify-center relative overflow-hidden">
                    <ShoppingBag className="h-16 w-16 opacity-10 scale-150 rotate-12" />
                    <span className="text-6xl absolute animate-float">🛒</span>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="font-bold text-xl text-farm-g1">{t.cartEmpty}</p>
                    <p className="text-xs font-bold opacity-60 gu">{language === 'gu' ? 'તમારું કાર્ટ ખાલી છે. શાકભાજીની ખરીદી શરૂ કરો!' : 'Your cart is lonely. Add some fresh greens!'}</p>
                  </div>
                  <button
                    onClick={onClose}
                    className="bg-farm-g1 text-farm-s2 px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    {t.startShopping}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={`${item.id}-${item.selectedUnit}`} className="flex gap-4 items-center bg-white p-4 rounded-[24px] border border-farm-border shadow-sm group hover:border-farm-g4 transition-all">
                      <div className="w-20 h-20 bg-farm-cream rounded-[18px] overflow-hidden flex items-center justify-center p-2 relative">
                         {item.imageUrl ? (
                           <img
                             src={item.imageUrl}
                             alt={item.name}
                             className="w-full h-full object-cover rounded-lg group-hover:scale-110 transition-transform duration-500"
                           />
                         ) : (
                           <span className="text-3xl">🥦</span>
                         )}
                      </div>
                      <div className="flex-1">
                        <div className="mb-2">
                          <h3 className={`font-black text-farm-g1 leading-tight text-sm ${language === 'gu' ? 'gu' : ''}`}>
                            {language === 'gu' ? (item.name_gu || item.name) : language === 'hi' ? (item.name_hi || item.name) : (item.name_en || item.englishName || item.name)}
                          </h3>
                          {item.englishName && <span className="text-[9px] text-farm-muted font-bold uppercase tracking-widest">{item.englishName}</span>}
                        </div>
                        <div className="flex flex-col">
                          <p className="text-farm-g2 font-bold text-xs">{formatINR(item.selectedPrice)} <span className="text-[10px] text-farm-muted">/ {item.selectedUnit}</span></p>
                          {item.originalPrice && (
                            <p className="text-[9px] text-red-400 line-through font-bold">{formatINR(item.originalPrice)}</p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex items-center bg-farm-cream rounded-full border border-farm-border p-1">
                            <button
                              onClick={() => updateQuantity(item.id!, item.selectedUnit, -1)}
                              className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-full text-farm-g1 transition-colors"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="px-3 font-bold text-xs min-w-[32px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => {
                                if (item.id) {
                                  const veg = vegetables?.find(v => v.id === item.id);
                                  if (veg) {
                                    const multiplier = getUnitMultiplier(item.selectedUnit);
                                    const totalRequestedWeight = getVegWeightInCart(item.id) + multiplier;
                                    if (totalRequestedWeight > (veg.totalStock || 0)) {
                                      showToast(t.stockError.replace('{{name}}', veg.name), 'error');
                                      return;
                                    }
                                  }
                                }
                                updateQuantity(item.id!, item.selectedUnit, 1);
                              }}
                              className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-full text-farm-g1 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id!, item.selectedUnit)}
                            className="bg-red-50 p-2 rounded-full text-red-300 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <span className="text-sm font-bold text-farm-g1">{formatINR(item.selectedPrice * item.quantity)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-500 pb-10">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="font-bold text-farm-g1 text-lg uppercase tracking-tight flex items-center gap-3">
                     <div className="w-8 h-8 bg-farm-g2/10 rounded-lg flex items-center justify-center"><MapPin className="h-4 w-4 text-farm-g2" /></div>
                     {t.deliveryDetails}
                   </h3>
                </div>
                <div className="space-y-4">
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-farm-muted group-focus-within:text-farm-g2 transition-colors" />
                    <input
                      type="text"
                      placeholder={t.namePlaceholder}
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-white border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted placeholder:font-normal gu"
                    />
                  </div>
                  <div className="relative group">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-farm-muted group-focus-within:text-farm-g2 transition-colors" />
                    <input
                      type="tel"
                      placeholder={t.phonePlaceholder}
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-white border-2 border-farm-border rounded-2xl outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted placeholder:font-normal"
                    />
                  </div>
                  <div className="relative group">
                    <MapPin className="absolute left-4 top-6 h-5 w-5 text-farm-muted group-focus-within:text-farm-g2 transition-colors" />
                    <textarea
                      placeholder={t.addressPlaceholder}
                      value={customerInfo.address}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                      className="w-full pl-12 pr-5 py-4 bg-white border-2 border-farm-border rounded-[24px] outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted placeholder:font-normal min-h-[120px] gu"
                    />
                  </div>
                  
                  <div className="p-6 bg-farm-cream rounded-[24px] border border-farm-border space-y-4 shadow-inner relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:rotate-12 transition-transform">📍</div>
                    <div className="flex items-center justify-between relative z-10">
                      <label className="text-[10px] font-black text-farm-muted tracking-[0.2em] uppercase flex items-center gap-2">
                        {t.location}
                      </label>
                      <button
                        onClick={() => {
                          fetchSettings();
                          if ("geolocation" in navigator) {
                            navigator.geolocation.getCurrentPosition(
                              (pos) => {
                                setCustomerInfo(prev => ({
                                  ...prev,
                                  lat: pos.coords.latitude,
                                  lng: pos.coords.longitude
                                }));
                              },
                              (error) => {
                                console.error("Error getting location in CartDrawer:", error);
                                let errorMessage = "લોકેશન મેળવવામાં ભૂલ થઈ. કૃપા કરીને પરમિશન આપો.";
                                if (error.code === 1) errorMessage = "તમે લોકેશનની પરમિશન આપી નથી. કૃપા કરીને બ્રાઉઝર સેટિંગ્સમાં જઈને 'Allow' કરો.";
                                if (error.code === 2) errorMessage = "તમારું લોકેશન નેટવર્ક દ્વારા મળી શકતું નથી. કૃપા કરીને GPS ચાલુ કરો.";
                                if (error.code === 3) errorMessage = "લોકેશન શોધવામાં ઘણો સમય લાગ્યો (Timeout). ફરી પ્રયાસ કરો.";
                                alert(errorMessage);
                              },
                              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                            );
                          } else {
                            alert("તમારું બ્રાઉઝર લોકેશન સપોર્ટ કરતું નથી.");
                          }
                        }}
                        className="text-[10px] font-black text-farm-s3 uppercase tracking-[0.1em] hover:text-farm-g1 flex items-center gap-1.5 transition-colors"
                      >
                        <Clock className="h-3 w-3" />
                        {t.refresh}
                      </button>
                    </div>

                    <div className="flex gap-4 items-center bg-white/50 p-4 rounded-xl border border-farm-border">
                       <div className="flex-1">
                          <p className="text-[10px] font-black text-farm-g2 uppercase tracking-widest mb-1">DISTANCE STATUS</p>
                          <p className="text-xs font-bold text-farm-g1">
                            {isCalculatingDist ? (language === 'gu' ? 'અંતર ગણી રહ્યા છીએ...' : language === 'hi' ? 'दूरी की गणना की जा रही है...' : 'Calculating distance...') :
                             (!settings?.warehouseLat ? (language === 'gu' ? 'વેરહાઉસ લોકેશન સેટ નથી' : language === 'hi' ? 'गोदाम का स्थान निर्धारित नहीं है' : 'Warehouse loc not set') : 
                             (customerInfo.distance >= 0) ? `${customerInfo.distance} ${language === 'gu' ? 'કિમી દૂર' : language === 'hi' ? 'किमी दूर' : 'km away'}` : 
                             (customerInfo.lat === 0 && customerInfo.address.length > 5) ? (language === 'gu' ? 'લોકેશન ટ્રેક કરી રહ્યા છીએ...' : language === 'hi' ? 'स्थान खोज रहे हैं...' : 'Locating...') :
                             (language === 'gu' ? 'લોકેશન સેટ નથી' : language === 'hi' ? 'स्थान निर्धारित नहीं है' : 'Location not set'))}
                          </p>
                       </div>
                       {(customerInfo.lat !== 0 || customerInfo.lng !== 0) && (
                         <div className={`p-2 rounded-lg ${isFreeByDistance || isFreeByThreshold ? 'bg-farm-g4/20 text-farm-g4' : 'bg-farm-s1/20 text-farm-s3'}`}>
                             {isFreeByDistance || isFreeByThreshold ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-farm-g1 text-lg uppercase tracking-tight flex items-center gap-3">
                   <div className="w-8 h-8 bg-farm-g2/10 rounded-lg flex items-center justify-center"><Clock className="h-4 w-4 text-farm-g2" /></div>
                   {t.deliverySlot}
                </h3>
                <div className="grid grid-cols-1 gap-2.5">
                  {settings?.deliverySlots && settings.deliverySlots.length > 0 ? (
                    settings.deliverySlots.map(slot => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-4 rounded-2xl border-2 text-sm font-bold transition-all text-left gu relative overflow-hidden group ${
                          selectedSlot === slot ? 'border-farm-g1 bg-farm-g1 text-farm-s2 shadow-lg' : 'border-farm-border bg-white text-farm-muted hover:border-farm-g2'
                        }`}
                      >
                        <div className="flex items-center justify-between relative z-10">
                           <span>{slot}</span>
                           {selectedSlot === slot && <CheckCircle className="h-4 w-4" />}
                        </div>
                        {selectedSlot === slot && <div className="absolute inset-0 bg-white/5 opacity-20 pointer-events-none" />}
                      </button>
                    ))
                  ) : (
                    <div className="p-10 text-center bg-farm-cream rounded-2xl border-2 border-dashed border-farm-border text-farm-muted font-bold gu">
                       {t.noSlotsAvailable}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-farm-g1 text-lg uppercase tracking-tight flex items-center gap-3">
                   <div className="w-8 h-8 bg-farm-g2/10 rounded-lg flex items-center justify-center"><CreditCard className="h-4 w-4 text-farm-g2" /></div>
                   {t.paymentMethod}
                </h3>
                <div className="bg-gradient-to-br from-farm-g1 to-farm-g2 p-6 rounded-[24px] border-2 border-farm-s2/20 text-white shadow-xl relative overflow-hidden group">
                   <div className="absolute right-[-10px] bottom-[-10px] rotate-[-15deg] opacity-10 group-hover:rotate-0 transition-transform">💳</div>
                   <div className="flex items-center gap-4 relative z-10">
                      <div className="w-12 h-12 bg-farm-s2/20 rounded-xl flex items-center justify-center border border-farm-s2/30">
                         <Truck className="h-6 w-6 text-farm-s2" />
                      </div>
                      <div>
                        <span className="text-xl font-bold gu uppercase tracking-wider text-farm-s2">{t.cod}</span>
                        <p className="text-[10px] font-bold text-white/60 gu">{t.codNote}</p>
                      </div>
                   </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {cart.length > 0 && (
          <div className="p-6 sm:p-8 border-t border-farm-border bg-white shadow-[0_-20px_40px_rgba(0,0,0,0.03)] space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest text-farm-muted">
                <span>{t.subtotal}</span>
                <span className="text-farm-g1">{formatINR(totalPrice)}</span>
              </div>
              
              {!isCheckingOut && (
                <div className="py-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-farm-muted" />
                      <input
                        type="text"
                        placeholder={t.promoPlaceholder}
                        value={promoCodeInput}
                        onChange={(e) => setPromoCodeInput(e.target.value.toUpperCase())}
                        className="w-full pl-9 pr-4 py-2.5 bg-farm-cream border border-farm-border rounded-xl outline-none text-xs font-bold text-farm-g1 focus:border-farm-g2 transition-all placeholder:font-normal gu"
                      />
                    </div>
                    <button
                      onClick={handleApplyPromo}
                      className="bg-farm-g1 text-farm-s2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-farm-g2 transition-all shadow-md active:scale-95"
                    >
                      {t.apply}
                    </button>
                  </div>
                  {promoError && <p className="text-[10px] text-red-500 mt-2 font-black gu">{promoError}</p>}
                  {appliedPromo && (
                    <div className="flex justify-between items-center mt-3 bg-farm-g4/10 p-2.5 rounded-xl border border-farm-g4/20 animate-in slide-in-from-top-1 duration-300">
                      <span className="text-[10px] font-black text-farm-g4 tracking-widest uppercase flex items-center gap-2">
                        <CheckCircle className="h-3.5 w-3.5" />
                        CODE: {appliedPromo.code}
                      </span>
                      <button onClick={() => setAppliedPromo(null)} className="text-[10px] text-red-500 font-black uppercase tracking-widest hover:underline">{t.remove}</button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 pt-2">
                {discountAmount > 0 && (
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest text-farm-g4 bg-farm-g4/5 p-2 rounded-lg">
                    <span>{t.discount}</span>
                    <span>-{formatINR(discountAmount)}</span>
                  </div>
                )}

                {currentDeliveryCharge > 0 && (
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest text-farm-s1">
                    <span>{t.deliveryCharge}</span>
                    <span>{formatINR(currentDeliveryCharge)}</span>
                  </div>
                )}
                
                {currentDeliveryCharge === 0 && (totalPrice > 0) && (
                  <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest text-farm-g4">
                    <span>{t.deliveryCharge}</span>
                    <span className="uppercase font-bold text-farm-g2">FREE</span>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t-2 border-dashed border-farm-border text-farm-g1">
                <span className="font-black uppercase tracking-widest text-xs gu">ચૂકવવાપાત્ર રકમ (Final Total)</span>
                <span className="text-3xl font-extrabold tracking-tight">{formatINR(finalTotal)}</span>
              </div>
            </div>

            {!isCheckingOut ? (
              <button
                onClick={() => setIsCheckingOut(true)}
                disabled={settings?.isShopOpen === false}
                className="w-full bg-farm-g1 text-farm-s2 py-4.5 rounded-[24px] font-black text-lg shadow-2xl hover:bg-farm-g2 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
              >
                <div className="relative z-10 flex items-center gap-3">
                   {settings?.isShopOpen === false ? t.shopClosed : t.checkout}
                   <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:translate-x-1 transition-transform">
                      <ChevronRight className="h-5 w-5" />
                   </div>
                </div>
              </button>
            ) : (
              <div className="flex gap-4">
                <button
                  onClick={() => setIsCheckingOut(false)}
                  className="flex-1 border-2 border-farm-border py-4.5 rounded-[24px] font-black text-sm uppercase tracking-widest text-farm-muted hover:bg-farm-cream transition-all gu"
                >
                  {t.back}
                </button>
                <button
                   onClick={handleCheckout}
                   disabled={loading || (customerInfo.lat === 0 && customerInfo.lng === 0)}
                   className="flex-[2] bg-farm-g1 text-farm-s2 py-4.5 rounded-[24px] font-black text-sm sm:text-lg shadow-2xl hover:bg-farm-g2 transition-all disabled:opacity-50 flex items-center justify-center relative overflow-hidden group tracking-widest gu"
                >
                   <span className="relative z-10 flex items-center gap-2">
                     {loading ? t.processing : (customerInfo.lat === 0 && customerInfo.lng === 0) ? (language === 'gu' ? 'લોકેશન મેળવો' : language === 'hi' ? 'लोकेशन ' : 'Fetch Location') : t.confirmOrder}
                     {!loading && customerInfo.lat !== 0 && <CheckCircle className="h-5 w-5" />}
                   </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
