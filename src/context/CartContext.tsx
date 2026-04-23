import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, Vegetable, PricingOption } from '../types';

interface CartContextType {
  cart: CartItem[];
  addToCart: (veg: Vegetable, option: PricingOption) => void;
  removeFromCart: (id: string, unit: string) => void;
  updateQuantity: (id: string, unit: string, delta: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);

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
        englishName: veg.englishName,
        imageUrl: veg.imageUrl,
        selectedUnit: option.unit,
        selectedPrice: (option.discountPrice && option.discountPrice > 0 && option.discountPrice < option.price) ? option.discountPrice : option.price,
        originalPrice: (option.discountPrice && option.discountPrice > 0 && option.discountPrice < option.price) ? option.price : undefined,
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

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.selectedPrice * item.quantity), 0);

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice }}>
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
