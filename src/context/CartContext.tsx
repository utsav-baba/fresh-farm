import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Vegetable, PricingOption, AppSettings } from '../types';
import { db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface CartContextType {
  cart: CartItem[];
  addToCart: (veg: Vegetable, option: PricingOption) => void;
  removeFromCart: (id: string, unit: string) => void;
  updateQuantity: (id: string, unit: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  freeItem: CartItem | null;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Fetch settings for free item deal
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const mappedSettings: AppSettings = {
          freeDeliveryDistance: data.free_delivery_distance || data.freeDeliveryDistance || 0,
          freeDeliveryThreshold: data.free_delivery_threshold || data.freeDeliveryThreshold || 0,
          deliveryCharge: data.delivery_charge || data.deliveryCharge || 0,
          whatsappNumber: data.whatsapp_number || data.whatsappNumber || '',
          isShopOpen: data.is_shop_open ?? data.isShopOpen ?? true,
          warehouseAddress: data.warehouse_address || data.warehouseAddress || '',
          warehouseLat: data.warehouse_lat || data.warehouseLat || 23.0225,
          warehouseLng: data.warehouse_lng || data.warehouseLng || 72.5714,
          distanceAdjustment: data.distance_adjustment || data.distanceAdjustment || 1.0,
          deliveryChargePerKm: data.delivery_charge_per_km || data.deliveryChargePerKm || 0,
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
          deliverySlots: data.delivery_slots || data.deliverySlots || [],
          updatedAt: data.updated_at?.toDate?.()?.toISOString() || data.updated_at || new Date().toISOString()
        };
        setSettings(mappedSettings);
      }
    });
    return () => unsub();
  }, []);

  const addToCart = (veg: Vegetable, option: PricingOption) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === veg.id && item.selectedUnit === option.unit);
      if (existing) {
        return prev.map(item =>
          (item.id === veg.id && item.selectedUnit === option.unit)
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, {
        id: veg.id,
        name: veg.name,
        name_gu: veg.name_gu || veg.name,
        name_hi: veg.name_hi,
        name_en: veg.name_en || veg.englishName,
        englishName: veg.name_en || veg.englishName,
        imageUrl: veg.imageUrl,
        selectedUnit: option.unit,
        selectedPrice: (option.discountPrice && option.discountPrice > 0 && option.discountPrice < option.price) ? option.discountPrice : option.price,
        originalPrice: (option.discountPrice && option.discountPrice > 0 && option.discountPrice < option.price) ? option.price : undefined,
        costPrice: option.costPrice || 0,
        quantity: 1
      }];
    });
  };

  const removeFromCart = (id: string, unit: string) => {
    setCart(prev => prev.filter(item => !(item.id === id && item.selectedUnit === unit)));
  };

  const updateQuantity = (id: string, unit: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id && item.selectedUnit === unit) {
        return { ...item, quantity: item.quantity + delta };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((sum, item) => sum + (item.selectedPrice * item.quantity), 0);
  
  // Calculate Free Item based on settings and subtotal
  const freeItem = React.useMemo(() => {
    if (!settings?.isFreeItemActive || !settings.freeItemThreshold || subtotal < settings.freeItemThreshold) {
      return null;
    }
    
    return {
      id: 'free-item-deal',
      name: settings.freeItemName || 'Free Gift',
      name_gu: settings.freeItemName || 'ફ્રી ગિફ્ટ',
      imageUrl: settings.freeItemImage || '',
      selectedUnit: settings.freeItemWeight || 'Free',
      selectedPrice: 0,
      originalPrice: settings.freeItemMRP || 0,
      quantity: 1,
      isFree: true // Flag to identify it's a free item from deal
    } as CartItem & { isFree: boolean };
  }, [settings, subtotal]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0) + (freeItem ? 1 : 0);
  const totalPrice = subtotal; // Free item adds 0 to total

  return (
    <CartContext.Provider value={{ 
      cart, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      clearCart, 
      totalItems, 
      totalPrice,
      freeItem 
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
