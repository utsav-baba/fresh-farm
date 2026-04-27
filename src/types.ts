export interface PricingOption {
  unit: string;
  price: number;
  discountPrice?: number;
  costPrice?: number;
  stock?: number;
}

export interface Vegetable {
  id?: string;
  name: string;
  name_gu?: string;
  name_hi?: string;
  name_en?: string;
  englishName?: string;
  description: string;
  description_gu?: string;
  description_hi?: string;
  description_en?: string;
  imageUrl: string;
  category: 'vegetable' | 'grocery' | 'namkeen';
  pricingOptions: PricingOption[];
  totalStock?: number; 
  inStock: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface PromoCode {
  id?: string;
  code: string;
  type: 'percentage' | 'fixed';
  value: number;
  minOrderAmount: number;
  isActive: boolean;
  expiryDate?: string;
}

export interface AppSettings {
  freeDeliveryDistance: number;
  freeDeliveryThreshold: number;
  deliveryCharge: number;
  whatsappNumber?: string;
  isShopOpen: boolean;
  warehouseAddress?: string;
  warehouseLat?: number;
  warehouseLng?: number;
  distanceAdjustment?: number; // Factor to multiply distance (e.g. 1.05 for +5%)
  deliveryChargePerKm?: number; // If set, charge is base + (dist * chargePerKm)
  showHomepageDeal?: boolean;
  homepageDealTitle?: string;
  homepageDealSub?: string;
  homepageDealCode?: string;
  deliverySlots?: string[]; // e.g. ["09:00 AM - 11:00 AM", "05:00 PM - 07:00 PM"]
  updatedAt?: any;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
  firstName?: string;
  lastName?: string;
  gender?: 'male' | 'female' | 'other';
  phone?: string;
  address?: string;
  age?: number | string;
  lat?: number;
  lng?: number;
  createdAt?: any;
}

export interface OrderItem {
  vegId: string;
  name: string;
  name_gu?: string;
  name_hi?: string;
  name_en?: string;
  englishName?: string;
  price: number;
  costPrice?: number;
  quantity: number;
  unit: string;
}

export interface Order {
  id?: string;
  userId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  distance?: number;
  items: OrderItem[];
  totalAmount: number;
  subtotal: number;
  deliveryCharge: number;
  discountAmount: number;
  promoCode?: string;
  deliverySlot?: string;
  invoiceNumber?: string;
  status: 'Pending' | 'Shipped' | 'Delivered' | 'Cancelled';
  paymentMethod: 'COD' | 'ONLINE';
  paymentStatus: 'Pending' | 'Completed' | 'Failed';
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id?: string;
  name: string;
  name_gu?: string;
  name_hi?: string;
  name_en?: string;
  englishName?: string;
  imageUrl: string;
  selectedUnit: string;
  selectedPrice: number;
  originalPrice?: number;
  quantity: number;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
