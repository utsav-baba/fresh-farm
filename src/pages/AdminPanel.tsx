import React, { useState, useEffect, useRef } from 'react';
import { auth, db, logout } from '../lib/firebase';
import { supabase } from '../lib/supabase';
import { Vegetable, AppSettings, UserProfile, Order, OperationType } from '../types';
import { 
  collection, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  setDoc, 
  getDoc, 
  onSnapshot,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { formatINR, getRoadDistance } from '../lib/utils';
import { 
  Plus, Edit2, Trash2, Save, X, Settings, Truck, AlertCircle, Loader2, ShoppingBag, 
  User, Users, Clock, ChevronDown, ChevronUp, CheckCircle, Package, Shield, 
  UserMinus, LogOut, CreditCard, BarChart3, Download, Search, MessageCircle, 
  Store, Upload, ImageIcon, Eye, MapPin, TrendingUp, IndianRupee, PieChart, 
  Calendar, Tag, Ticket, Printer, Phone, Mail, Star
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, AreaChart, Area 
} from 'recharts';
import { format, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { PromoCode } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export function AdminPanel({ profile, language, t }: { profile: UserProfile | null, language: string, t: any }) {
  const [vegetables, setVegetables] = useState<Vegetable[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsForm, setSettingsForm] = useState<AppSettings | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vegetables' | 'orders' | 'users' | 'settings' | 'reports'>('dashboard');
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [isAdminLocating, setIsAdminLocating] = useState(false);
  const [adminDist, setAdminDist] = useState<number | null>(null);
  const [warehouseArea, setWarehouseArea] = useState<string | null>(null);
  const [mapsLink, setMapsLink] = useState('');
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<Vegetable>>({
    name: '',
    englishName: '',
    description: '',
    category: 'vegetable',
    inStock: true,
    totalStock: 0,
    pricingOptions: [
      { unit: '1kg', price: 0, costPrice: 0 },
      { unit: '500g', price: 0, costPrice: 0 },
      { unit: 'Pcs', price: 0, costPrice: 0 }
    ]
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [userDeleteConfirm, setUserDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Dashboard Calculations
  const dashboardData = React.useMemo(() => {
    const deliveredOrders = orders.filter(o => o.status === 'Delivered');
    const totalRevenue = deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const totalProfit = deliveredOrders.reduce((sum, o) => {
      const orderProfit = o.items.reduce((pSum, item) => {
        const cost = item.costPrice || 0;
        return pSum + (item.price - cost) * item.quantity;
      }, 0);
      return sum + orderProfit;
    }, 0);

    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = subDays(new Date(), i);
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayOrders = orders.filter(o => {
        try {
          const d = new Date(o.createdAt);
          return !isNaN(d.getTime()) && format(d, 'yyyy-MM-dd') === dateStr;
        } catch (e) {
          return false;
        }
      });
      const revenue = dayOrders.reduce((sum, o) => sum + (o.status !== 'Cancelled' ? o.totalAmount : 0), 0);
      return {
        name: format(date, 'dd MMM'),
        revenue,
        orders: dayOrders.length
      };
    }).reverse();

    const topItems = vegetables.map(v => {
      const quantity = orders.reduce((sum, o) => {
        if (o.status === 'Cancelled') return sum;
        const item = o.items.find(i => i.vegId === v.id);
        return sum + (item ? item.quantity : 0);
      }, 0);
      return { name: v.name, quantity };
    }).sort((a, b) => b.quantity - a.quantity).slice(0, 5);

    return { totalRevenue, totalProfit, totalOrders: orders.length, last7Days, topItems };
  }, [orders, vegetables]);
  
  // Image upload states
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [newStockAddition, setNewStockAddition] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orderDeleteConfirm, setOrderDeleteConfirm] = useState(false);

  const handleDeleteAllOrders = async () => {
    if (!orderDeleteConfirm) {
      setOrderDeleteConfirm(true);
      return;
    }

    setLoading(true);
    try {
      const ordersSnap = await getDocs(collection(db, 'orders'));
      const deletePromises = ordersSnap.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      setSuccess('બધા જ ઓર્ડર સફળતાપૂર્વક કાઢી નાખવામાં આવ્યા છે!');
      setOrderDeleteConfirm(false);
    } catch (err: any) {
      console.error('Error deleting all orders:', err);
      setError('ઓર્ડર કાઢી નાખવામાં ભૂલ થઈ.');
    } finally {
      setLoading(false);
    }
  };

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
    if (profile?.role !== 'admin') return;

    const fetchData = async () => {
      // Fetch Vegetables from Firestore
      try {
        const qVeg = query(collection(db, 'vegetables'), orderBy('name'));
        const snapVeg = await getDocs(qVeg);
        const vegList = snapVeg.docs.map(doc => {
          const v = doc.data();
          return {
            id: doc.id,
            name: v.name,
            englishName: v.english_name || v.englishName,
            description: v.description,
            imageUrl: v.image_url || v.imageUrl,
            category: v.category || 'vegetable',
            pricingOptions: (v.pricing_options || v.pricingOptions || []).map((opt: any) => ({
              unit: opt.unit,
              price: opt.price,
              discountPrice: opt.discountPrice || opt.discount_price,
              costPrice: opt.costPrice || opt.cost_price,
              stock: opt.stock
            })),
            totalStock: v.total_stock ?? v.totalStock ?? ((v.pricing_options || v.pricingOptions || []).length > 0 ? ((v.pricing_options || v.pricingOptions)[0].stock || 0) : 0),
            inStock: v.in_stock ?? v.inStock ?? true,
            createdAt: (v.created_at || v.createdAt)?.toDate?.()?.toISOString() || (v.created_at || v.createdAt) || new Date().toISOString(),
            updatedAt: (v.updated_at || v.updatedAt)?.toDate?.()?.toISOString() || (v.updated_at || v.updatedAt) || new Date().toISOString()
          } as Vegetable;
        });
        setVegetables(vegList);
      } catch (err) {
        console.error('Error fetching vegetables in Admin:', err);
      }

      // Fetch Promo Codes from Firestore
      try {
        const qPromo = query(collection(db, 'promo_codes'));
        const snapPromo = await getDocs(qPromo);
        setPromoCodes(snapPromo.docs.map(doc => {
          const p = doc.data();
          const timestamp = p.created_at || p.createdAt;
          return {
            id: doc.id,
            code: p.code,
            type: p.type,
            value: p.value,
            minOrderAmount: p.min_order_amount || p.minOrderAmount || 0,
            isActive: p.is_active ?? p.isActive ?? true,
            expiryDate: p.expiry_date || p.expiryDate,
            createdAt: timestamp?.toDate?.()?.toISOString() || (typeof timestamp === 'string' ? timestamp : new Date().toISOString())
          };
        }));
      } catch (err) {
        console.error('Error fetching promo codes in Admin:', err);
      }

      // Fetch Settings from Firestore
      try {
        const settingsRef = doc(db, 'settings', 'global');
        const settingsSnap = await getDoc(settingsRef);
        let mappedSettings: AppSettings;

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();
          mappedSettings = {
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
            deliverySlots: data.delivery_slots || data.deliverySlots || [],
            updatedAt: data.updated_at?.toDate?.()?.toISOString() || data.updated_at || new Date().toISOString()
          } as AppSettings;
        } else {
          // Default settings if none exist in Firestore
          mappedSettings = {
            freeDeliveryDistance: 5,
            freeDeliveryThreshold: 500,
            deliveryCharge: 30,
            whatsappNumber: '919876543210',
            isShopOpen: true,
            warehouseAddress: '',
            warehouseLat: 23.0225,
            warehouseLng: 72.5714,
            distanceAdjustment: 1.0,
            deliveryChargePerKm: 0,
            showHomepageDeal: true,
            homepageDealTitle: 'પ્રથમ ઓર્ડર? 20% ઓફ!',
            homepageDealSub: 'પ્રોમો કોડ વાપરો અને બચત કરો',
            homepageDealCode: 'FRESH20',
            deliverySlots: ["09:00 AM - 11:00 AM", "12:00 PM - 02:00 PM", "05:00 PM - 07:00 PM"]
          };
        }
        
        setSettings(mappedSettings);
        // ONLY update settingsForm if it's currently null (first load) 
        // OR if the user is not CURRENTLY on the settings tab to avoid overwriting their typing
        setSettingsForm(prev => {
          if (prev === null) return mappedSettings;
          return prev;
        });
      } catch (err) {
        console.error('Error fetching settings in Admin:', err);
      }

      // Fetch Orders from Firestore
      try {
        const qOrders = query(collection(db, 'orders'), orderBy('created_at', 'desc'));
        const snapOrders = await getDocs(qOrders);
        setOrders(snapOrders.docs.map(doc => {
          const o = doc.data();
          return {
            id: doc.id,
            userId: o.user_id || o.userId,
            customerName: o.customer_name || o.customerName,
            customerPhone: o.customer_phone || o.customerPhone,
            customerAddress: o.customer_address || o.customerAddress,
            items: o.items || [],
            totalAmount: o.total_amount || o.totalAmount,
            subtotal: o.subtotal || o.totalAmount,
            deliveryCharge: o.delivery_charge || o.deliveryCharge || 0,
            discountAmount: o.discount_amount || o.discountAmount || 0,
            promoCode: o.promo_code || o.promoCode,
            deliverySlot: o.delivery_slot || o.deliverySlot,
            invoiceNumber: o.invoice_number || o.invoiceNumber,
            status: o.status,
            paymentMethod: o.payment_method || o.paymentMethod,
            paymentStatus: o.payment_status || o.paymentStatus,
            cancelReason: o.cancel_reason || o.cancelReason,
            createdAt: (o.created_at || o.createdAt)?.toDate?.()?.toISOString() || (o.created_at || o.createdAt) || new Date().toISOString(),
            updatedAt: (o.updated_at || o.updatedAt)?.toDate?.()?.toISOString() || (o.updated_at || o.updatedAt) || new Date().toISOString()
          } as Order;
        }));
      } catch (err) {
        console.error('Error fetching orders in Admin:', err);
      }

      // Fetch Users from Firestore (already exists)
      try {
        const usersRef = collection(db, 'profiles');
        const usersSnap = await getDocs(usersRef);
        const usersList = usersSnap.docs.map(doc => {
          const data = doc.data();
          return {
            uid: doc.id,
            email: data.email,
            role: data.role,
            firstName: data.first_name,
            lastName: data.last_name,
            phone: data.phone,
            address: data.address,
            age: data.age,
            createdAt: data.created_at?.toDate?.()?.toISOString() || data.created_at
          } as UserProfile;
        });
        setUsers(usersList);
      } catch (err) {
        console.error('Error fetching users from Firestore:', err);
      }
    };

    fetchData();

    // Realtime subscriptions via Firestore
    const unsubVeg = onSnapshot(collection(db, 'vegetables'), fetchData);
    const unsubOrders = onSnapshot(collection(db, 'orders'), fetchData);
    const unsubUsers = onSnapshot(collection(db, 'profiles'), fetchData);
    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), fetchData);

    return () => {
      unsubVeg();
      unsubOrders();
      unsubUsers();
      unsubSettings();
    };
  }, [profile?.role]);

  const getSalesReport = (period: 'day' | 'week' | 'month') => {
    const now = new Date();
    const filteredOrders = orders.filter(order => {
      if (order.status === 'Cancelled') return false;
      const orderDate = new Date(order.createdAt);
      if (period === 'day') {
        return orderDate.toDateString() === now.toDateString();
      } else if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return orderDate >= weekAgo;
      } else {
        const monthAgo = new Date(now);
        monthAgo.setMonth(now.getMonth() - 1);
        return orderDate >= monthAgo;
      }
    });

    const report: { [key: string]: { kg: number, pcs: number, revenue: number, cost: number, profit: number } } = {};
    let totalRevenue = 0;
    let totalCost = 0;

    filteredOrders.forEach(order => {
      totalRevenue += order.totalAmount;
      order.items.forEach(item => {
        if (!report[item.name]) {
          report[item.name] = { kg: 0, pcs: 0, revenue: 0, cost: 0, profit: 0 };
        }
        
        const itemRevenue = item.price * item.quantity;
        report[item.name].revenue += itemRevenue;

        // Find cost price from current vegetables data
        const veg = vegetables.find(v => v.id === item.vegId);
        const pricingOption = veg?.pricingOptions.find(p => p.unit === item.unit);
        const costPrice = pricingOption?.costPrice || 0;
        const itemCost = costPrice * item.quantity;
        
        report[item.name].cost += itemCost;
        report[item.name].profit += (itemRevenue - itemCost);
        totalCost += itemCost;

        if (item.unit === '1kg') {
          report[item.name].kg += item.quantity;
        } else if (item.unit === '500g') {
          report[item.name].kg += item.quantity * 0.5;
        } else {
          report[item.name].pcs += item.quantity;
        }
      });
    });

    return {
      items: Object.entries(report).sort((a, b) => b[1].revenue - a[1].revenue),
      totalRevenue,
      totalCost,
      totalProfit: totalRevenue - totalCost,
      orderCount: filteredOrders.length
    };
  };

  const downloadCSV = (data: any[], filename: string) => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + data.map(row => row.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadReportCSV = (period: 'day' | 'week' | 'month') => {
    const report = getSalesReport(period);
    const headers = ["Vegetable Name", "Quantity (kg)", "Quantity (pcs)", "Revenue (₹)", "Cost (₹)", "Profit (₹)"];
    const rows = report.items.map(([name, data]) => [
      name,
      data.kg,
      data.pcs,
      data.revenue,
      data.cost,
      data.profit
    ]);
    
    const summary = [
      [],
      ["Total Revenue", report.totalRevenue],
      ["Total Cost", report.totalCost],
      ["Total Profit", report.totalProfit],
      ["Order Count", report.orderCount]
    ];

    downloadCSV([headers, ...rows, ...summary], `sales_report_${period}_${new Date().toISOString().split('T')[0]}.csv`);
  };

  const downloadOrdersCSV = () => {
    const headers = ["Order ID", "Date", "Customer Name", "Phone", "Address", "Payment Method", "Payment Status", "Order Status", "Total Amount (₹)"];
    const rows = orders.map(order => [
      order.id?.slice(-6).toUpperCase(),
      new Date(order.createdAt).toLocaleString('gu-IN'),
      order.customerName,
      order.customerPhone,
      order.customerAddress.replace(/,/g, " "),
      order.paymentMethod,
      order.paymentStatus,
      order.status,
      order.totalAmount
    ]);
    
    downloadCSV([headers, ...rows], `orders_history_${new Date().toISOString().split('T')[0]}.csv`);
  };

  // Early returns moved after all hooks to prevent "Rendered fewer hooks than expected" error

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setError('ફોટો ૧૦ MB થી ઓછો હોવો જોઈએ.');
        return;
      }
      setPendingFile(file);
      // Create a preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, imageUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.pricingOptions || formData.pricingOptions.every(opt => opt.price === 0)) {
      setError('કૃપા કરીને નામ અને ઓછામાં ઓછી એક કિંમત ભરો.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let finalImageUrl = formData.imageUrl || '';

      if (pendingFile) {
        setUploading(true);
        
        const fileExt = pendingFile.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `vegetables/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('vegetables')
          .upload(filePath, pendingFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('vegetables')
          .getPublicUrl(filePath);

        finalImageUrl = publicUrl;
        setUploading(false);
      }

      // Prepare data for Firestore
      const dataToSave: any = {
        name: formData.name || '',
        name_gu: formData.name || '',
        name_hi: formData.name_hi || '',
        name_en: formData.name_en || formData.englishName || '',
        english_name: formData.name_en || formData.englishName || '',
        description: formData.description || '',
        description_gu: formData.description_gu || formData.description || '',
        description_hi: formData.description_hi || '',
        description_en: formData.description_en || '',
        image_url: finalImageUrl || '',
        category: formData.category || 'vegetable',
        in_stock: formData.inStock !== undefined ? formData.inStock : true,
        total_stock: formData.totalStock || 0,
        pricing_options: formData.pricingOptions?.filter(opt => opt.price > 0).map(opt => ({
          unit: opt.unit || '',
          price: opt.price || 0,
          discountPrice: opt.discountPrice ?? null,
          costPrice: opt.costPrice ?? 0,
          stock: opt.stock ?? (formData.totalStock || 0)
        })) || [],
        updated_at: serverTimestamp()
      };
      
      if (isEditing) {
        const vegRef = doc(db, 'vegetables', isEditing);
        await updateDoc(vegRef, dataToSave);
      } else {
        const vegCollection = collection(db, 'vegetables');
        await addDoc(vegCollection, { ...dataToSave, created_at: serverTimestamp() });
      }
      resetForm();
      setSuccess('શાકભાજી સફળતાપૂર્વક સેવ કરવામાં આવ્યું!');
    } catch (err: any) {
      console.error('Error saving vegetable:', err);
      setError(err.message || 'સેવ કરવામાં ભૂલ થઈ. કૃપા કરીને ફરી પ્રયાસ કરો.');
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const vegRef = doc(db, 'vegetables', id);
      await deleteDoc(vegRef);
      setDeleteConfirm(null);
    } catch (err: any) {
      console.error('Error deleting vegetable:', err);
      setError('શાકભાજી કાઢી નાખવામાં ભૂલ થઈ.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchLocation = async () => {
    if (!settingsForm?.warehouseAddress) {
      alert('કૃપા કરીને પહેલા સરનામું લખો.');
      return;
    }
    setIsSearchingLocation(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(settingsForm.warehouseAddress)}`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon } = data[0];
        setSettingsForm(prev => prev ? {
          ...prev,
          warehouseLat: Number(lat),
          warehouseLng: Number(lon)
        } : null);
        alert('લોકેશન મળી ગયું! હવે "સેવ કરો" બટન દબાવો.');
      } else {
        alert('આ સરનામું મળ્યું નથી. કૃપા કરીને પૂરું સરનામું લખો અથવા મેન્યુઅલી Lat/Lng નાખો.');
      }
    } catch (error) {
      console.error('Error searching location:', error);
      alert('લોકેશન શોધવામાં ભૂલ થઈ.');
    } finally {
      setIsSearchingLocation(false);
    }
  };

  const handleGetAdminLocation = () => {
    if ("geolocation" in navigator) {
      setIsAdminLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setSettingsForm(prev => prev ? {
            ...prev,
            warehouseLat: pos.coords.latitude,
            warehouseLng: pos.coords.longitude
          } : null);
          setIsAdminLocating(false);
          alert('તમારું અત્યારનું લોકેશન સેટ થઈ ગયું છે. હવે "સેવ કરો" બટન દબાવો.');
        },
        (err) => {
          console.error(err);
          setIsAdminLocating(false);
          alert('લોકેશન મેળવવામાં ભૂલ થઈ. કૃપા કરીને પરમિશન ચેક કરો.');
        }
      );
    }
  };

  const handleExtractFromLink = async () => {
    if (!mapsLink) return;

    let targetUrl = mapsLink;
    console.log('Extracting from link:', mapsLink);

    // First, check if the link already contains coordinates to avoid unnecessary resolution
    const coordPatterns = [
      // Format: @lat,lng
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      // Format: q=lat,lng or q=lat+lng (or ll=, or search/, etc)
      // Supports prefixed with ?, &, #, or nothing
      /(?:[?&@#]|^)q(?:=|\/)(-?\d+\.\d+)(?:[,+ \s]|%2B)+(-?\d+\.\d+)/,
      /(?:[?&@#]|^)ll(?:=|\/)(-?\d+\.\d+)(?:[,+ \s]|%2B)+(-?\d+\.\d+)/,
      /(?:[?&@#]|^)cbll(?:=|\/)(-?\d+\.\d+),(-?\d+\.\d+)/,
      // Format: !3dlat!4dlng
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
      // Format: /lat,lng (generic path)
      /\/(-?\d+\.\d+),(-?\d+\.\d+)/,
      // Generic pattern for any lat,lng pair near the end or in fragment
      /(-?\d+\.\d+),(-?\d+\.\d+)(?=[&?#/]|$)/
    ];

    const hasCoords = (url: string) => coordPatterns.some(p => url.match(p));

    if (!hasCoords(mapsLink)) {
      // If it's a short link or a standard maps link without coords, resolve it via our backend API
      if (mapsLink.includes('maps.app.goo.gl') || mapsLink.includes('goo.gl/maps') || mapsLink.includes('maps.google.com') || mapsLink.includes('google.com/maps')) {
        try {
          setIsSearchingLocation(true);
          const response = await fetch('/api/resolve-maps-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: mapsLink })
          });
          const data = await response.json();
          if (data.finalUrl) {
            targetUrl = data.finalUrl;
            console.log('Resolved to:', targetUrl);
          } else {
            console.warn('Resolution failed, trying with original URL');
          }
        } catch (err) {
          console.error('Error resolving short link:', err);
        } finally {
          setIsSearchingLocation(false);
        }
      }
    }

    let lat, lng, placeName;
    
    // Try to extract place name from path
    // Format: /maps/place/Place+Name/@lat,lng...
    const placeMatch = targetUrl.match(/\/maps\/place\/([^/@?]+)/);
    if (placeMatch) {
      placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
      console.log('Found place name:', placeName);
    }

    // Find coordinates using patterns
    for (const pattern of coordPatterns) {
      const match = targetUrl.match(pattern);
      if (match) {
        lat = parseFloat(match[1]);
        lng = parseFloat(match[2]);
        console.log('Found coordinates with pattern:', pattern.toString(), lat, lng);
        break;
      }
    }

    if (lat !== undefined && lng !== undefined) {
      console.log('Successfully extracted coords:', lat, lng);
      setIsSearchingLocation(true);
      let address = '';
      try {
        console.log('Fetching address for:', lat, lng);
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
        const geoData = await geoRes.json();
        if (geoData.display_name) {
          address = geoData.display_name;
          console.log('Found address:', address);
        }
      } catch (e) {
        console.error('Reverse geocoding error:', e);
      }

      const finalAddress = placeName || address || `Location: ${lat}, ${lng}`;
      console.log('Final address to set:', finalAddress);

      setSettingsForm(prev => {
        const base = prev || {
          freeDeliveryDistance: 5,
          freeDeliveryThreshold: 500,
          deliveryCharge: 30,
          whatsappNumber: '',
          isShopOpen: true,
          warehouseAddress: '',
          warehouseLat: 23.0225,
          warehouseLng: 72.5714,
          deliverySlots: []
        };
        const updated = {
          ...base,
          warehouseLat: lat,
          warehouseLng: lng,
          warehouseAddress: finalAddress
        } as AppSettings;
        console.log('Settings form updated with maps link:', updated);
        return updated;
      });
      
      setWarehouseArea(finalAddress);
      
      setMapsLink('');
      setIsSearchingLocation(false);
      alert("લિંકમાંથી લોકેશન અને સરનામું સફળતાપૂર્વક મળી ગયું છે! હવે 'સેવ કરો' બટન દબાવો.");
    } else {
      console.error('No coordinates found in URL:', targetUrl);
      alert("આ લિંકમાંથી લોકેશન નથી મળી શક્યું. કૃપા કરીને સાચી Google Maps લિંક નાખો.");
    }
  };

  useEffect(() => {
    const checkAdminDist = async () => {
      if (settingsForm?.warehouseLat && settingsForm?.warehouseLng) {
        // Fetch area name (Reverse Geocoding)
        try {
          const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${settingsForm.warehouseLat}&lon=${settingsForm.warehouseLng}`);
          const geoData = await geoRes.json();
          if (geoData.display_name) {
            setWarehouseArea(geoData.display_name);
          }
        } catch (e) {
          console.error('Reverse geocoding error:', e);
        }

        if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(async (pos) => {
            const dist = await getRoadDistance(
              pos.coords.latitude,
              pos.coords.longitude,
              settingsForm.warehouseLat!,
              settingsForm.warehouseLng!,
              settingsForm.distanceAdjustment || 1.0
            );
            setAdminDist(dist);
          });
        }
      }
    };
    checkAdminDist();
  }, [settingsForm?.warehouseLat, settingsForm?.warehouseLng]);

  const handleSettingsSave = async (newSettings: Partial<AppSettings>) => {
    setLoading(true);
    try {
      const settingsRef = doc(db, 'settings', 'global');
      const updateData: any = {};
      
      if (newSettings.freeDeliveryDistance !== undefined) updateData.free_delivery_distance = newSettings.freeDeliveryDistance;
      if (newSettings.freeDeliveryThreshold !== undefined) updateData.free_delivery_threshold = newSettings.freeDeliveryThreshold;
      if (newSettings.deliveryCharge !== undefined) updateData.delivery_charge = newSettings.deliveryCharge;
      if (newSettings.whatsappNumber !== undefined) updateData.whatsapp_number = newSettings.whatsappNumber;
      if (newSettings.isShopOpen !== undefined) updateData.is_shop_open = newSettings.isShopOpen;
      if (newSettings.warehouseAddress !== undefined) updateData.warehouse_address = newSettings.warehouseAddress;
      if (newSettings.warehouseLat !== undefined) updateData.warehouse_lat = newSettings.warehouseLat;
      if (newSettings.warehouseLng !== undefined) updateData.warehouse_lng = newSettings.warehouseLng;
      if (newSettings.distanceAdjustment !== undefined) updateData.distance_adjustment = newSettings.distanceAdjustment;
      if (newSettings.deliveryChargePerKm !== undefined) updateData.delivery_charge_per_km = newSettings.deliveryChargePerKm;
      if (newSettings.showHomepageDeal !== undefined) updateData.show_homepage_deal = newSettings.showHomepageDeal;
      if (newSettings.homepageDealTitle !== undefined) updateData.homepage_deal_title = newSettings.homepageDealTitle;
      if (newSettings.homepageDealSub !== undefined) updateData.homepage_deal_sub = newSettings.homepageDealSub;
      if (newSettings.homepageDealCode !== undefined) updateData.homepage_deal_code = newSettings.homepageDealCode;
      if (newSettings.deliverySlots !== undefined) updateData.delivery_slots = newSettings.deliverySlots;
      
      updateData.updated_at = serverTimestamp();
      
      await setDoc(settingsRef, updateData, { merge: true });
      
      setSuccess('સેટિંગ્સ સફળતાપૂર્વક અપડેટ કરવામાં આવ્યા!');
    } catch (err: any) {
      console.error('Error saving settings:', err);
      setError(`સેટિંગ્સ સેવ કરવામાં ભૂલ થઈ: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, status: Order['status'], reason?: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      const updateData: any = { status, updated_at: serverTimestamp() };
      if (status === 'Cancelled' && reason !== undefined) {
        updateData.cancel_reason = reason;
      }
      
      await updateDoc(orderRef, updateData);
      
      // Update local state to reflect changes immediately
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status, cancelReason: reason } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status, cancelReason: reason } : null);
      }
    } catch (err: any) {
      console.error('Error updating order status:', err);
    }
  };

  const handleUpdatePaymentStatus = async (orderId: string, paymentStatus: Order['paymentStatus']) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { payment_status: paymentStatus, updated_at: serverTimestamp() });
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, paymentStatus } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, paymentStatus } : null);
      }
    } catch (err: any) {
      console.error('Error updating payment status:', err);
    }
  };

  const handleUpdateInvoiceNumber = async (orderId: string, invoiceNumber: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, { invoice_number: invoiceNumber, updated_at: serverTimestamp() });
      
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, invoiceNumber } : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, invoiceNumber } : null);
      }
    } catch (err: any) {
      console.error('Error updating invoice number:', err);
      setError('ઇનવોઇસ નંબર અપડેટ કરવામાં ભૂલ થઈ.');
    }
  };

  const handlePrintInvoice = (order: Order) => {
    const itemsHtml = order.items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}x${item.unit}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price * item.quantity}</td>
      </tr>
    `).join('');

    const html = `
      <html>
        <head>
          <title>Invoice - ${order.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #16a34a; padding-bottom: 20px; }
            .company-info h1 { color: #16a34a; margin: 0; font-weight: 900; }
            .invoice-info { text-align: right; }
            .customer-info { margin-bottom: 40px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; text-align: left; padding: 12px 8px; border-bottom: 2px solid #e2e8f0; font-weight: 900; }
            td { padding: 12px 8px; border-bottom: 1px solid #f1f5f9; }
            .totals { text-align: right; }
            .totals div { margin-bottom: 8px; font-weight: 700; }
            .grand-total { font-size: 24px; color: #16a34a; border-top: 2px solid #16a34a; padding-top: 10px; margin-top: 10px; font-weight: 900; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-info">
              <h1>Fresh Farm</h1>
              <p>તાજા શાકભાજી અને કરિયાણું</p>
              ${settings?.warehouseAddress ? `<p style="font-size: 10px; color: #64748b; margin-top: 5px;">${settings.warehouseAddress}</p>` : ''}
            </div>
            <div class="invoice-info">
              <h2 style="margin: 0; font-weight: 900;">ઇનવોઇસ (Invoice)</h2>
              <p style="margin: 5px 0;">ઇનવોઇસ નં: ${order.invoiceNumber || order.id?.slice(-8).toUpperCase()}</p>
              <p style="margin: 5px 0;">તારીખ: ${new Date(order.createdAt).toLocaleDateString('gu-IN')}</p>
            </div>
          </div>
          <div class="customer-info" style="background: #f8fafc; padding: 15px; border-radius: 10px; border: 1px solid #e2e8f0;">
            <h3 style="font-weight: 900; border-bottom: 2px solid #16a34a; padding-bottom: 5px; margin-top: 0; color: #16a34a;">ગ્રાહક વિગતો:</h3>
            <p style="margin: 5px 0; font-size: 14px; color: #333;"><strong>નામ:</strong> ${order.customerName}</p>
            <p style="margin: 5px 0; font-size: 14px; color: #333;"><strong>મોબાઈલ:</strong> ${order.customerPhone}</p>
            <p style="margin: 5px 0; font-size: 14px; color: #333;"><strong>સરનામું:</strong> ${order.customerAddress}</p>
            ${order.deliverySlot ? `<p style="margin: 5px 0; font-size: 14px; color: #333;"><strong>ડિલિવરી સમય:</strong> ${order.deliverySlot}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>આઈટમ</th>
                <th style="text-align: center;">વજન/નંગ</th>
                <th style="text-align: right;">કિંમત</th>
                <th style="text-align: right;">કુલ</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div class="totals">
            <div>કુલ સામાન: ₹${order.subtotal || order.totalAmount}</div>
            ${order.deliveryCharge ? `<div>ડિલિવરી ચાર્જ: ₹${order.deliveryCharge}</div>` : ''}
            ${order.discountAmount ? `<div style="color: #16a34a;">ડિસ્કાઉન્ટ: -₹${order.discountAmount}</div>` : ''}
            <div class="grand-total">કુલ રકમ: ₹${order.totalAmount}</div>
          </div>
          <div style="margin-top: 80px; text-align: center; color: #94a3b8; font-size: 14px; font-weight: 700;">
            મુલાકાત બદલ આભાર! ફરી પધારજો.
          </div>
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 500);
    }
  };

  const handleDownloadPDF = async (order: Order) => {
    setLoading(true);
    try {
      const itemsHtml = order.items.map(item => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">${item.name}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}x${item.unit}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">₹${item.price * item.quantity}</td>
        </tr>
      `).join('');

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.width = '800px';
      container.innerHTML = `
        <div style="padding: 40px; background: white; color: #333; font-family: sans-serif;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #16a34a; padding-bottom: 20px;">
            <div>
              <h1 style="color: #16a34a; margin: 0; font-size: 32px;">Fresh Farm</h1>
              <p>તાજા શાકભાજી અને કરિયાણું</p>
              ${settings?.warehouseAddress ? `<p style="font-size: 12px; color: #64748b; margin-top: 5px;">${settings.warehouseAddress}</p>` : ''}
            </div>
            <div style="text-align: right;">
              <h2 style="margin: 0;">ઇનવોઇસ (Invoice)</h2>
              <p>ઇનવોઇસ નં: ${order.invoiceNumber || order.id?.slice(-8).toUpperCase()}</p>
              <p>તારીખ: ${new Date(order.createdAt).toLocaleDateString('gu-IN')}</p>
            </div>
          </div>
          <div style="margin-bottom: 40px; background: #f8fafc; padding: 20px; border-radius: 10px; border: 1px solid #e2e8f0;">
            <h3 style="border-bottom: 2px solid #16a34a; padding-bottom: 5px; margin-top: 0; color: #16a34a;">ગ્રાહક વિગતો:</h3>
            <p style="font-size: 16px; margin: 8px 0; color: #333;"><strong>નામ:</strong> ${order.customerName}</p>
            <p style="font-size: 16px; margin: 8px 0; color: #333;"><strong>મોબાઈલ:</strong> ${order.customerPhone}</p>
            <p style="font-size: 16px; margin: 8px 0; color: #333;"><strong>સરનામું:</strong> ${order.customerAddress}</p>
            ${order.deliverySlot ? `<p style="font-size: 16px; margin: 8px 0; color: #333;"><strong>ડિલિવરી સમય:</strong> ${order.deliverySlot}</p>` : ''}
          </div>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 40px;">
            <thead>
              <tr style="background: #f8fafc;">
                <th style="text-align: left; padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">આઈટમ</th>
                <th style="text-align: center; padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">વજન/નંગ</th>
                <th style="text-align: right; padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">કિંમત</th>
                <th style="text-align: right; padding: 12px 8px; border-bottom: 2px solid #e2e8f0;">કુલ</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
          <div style="text-align: right;">
            <div style="margin-bottom: 8px;">કુલ સામાન: ₹${order.subtotal || order.totalAmount}</div>
            ${order.deliveryCharge ? `<div style="margin-bottom: 8px;">ડિલિવરી ચાર્જ: ₹${order.deliveryCharge}</div>` : ''}
            ${order.discountAmount ? `<div style="margin-bottom: 8px; color: #16a34a;">ડિસ્કાઉન્ટ: -₹${order.discountAmount}</div>` : ''}
            <div style="font-size: 24px; color: #16a34a; border-top: 2px solid #16a34a; padding-top: 10px; margin-top: 10px; font-weight: bold;">
              કુલ રકમ: ₹${order.totalAmount}
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice-${order.invoiceNumber || order.id?.slice(-8).toUpperCase()}.pdf`);
      
      document.body.removeChild(container);
    } catch (err) {
      console.error('PDF generation error:', err);
      setError('PDF બનાવવામાં ભૂલ થઈ.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUserRole = async (uid: string, newRole: 'admin' | 'user') => {
    if (uid === profile?.uid) {
      setError('તમે તમારી પોતાની ભૂમિકા બદલી શકતા નથી.');
      return;
    }
    try {
      const userRef = doc(db, 'profiles', uid);
      await updateDoc(userRef, { role: newRole });
      setSuccess('વપરાશકર્તાની ભૂમિકા સફળતાપૂર્વક અપડેટ કરવામાં આવી!');
    } catch (err: any) {
      console.error('Error updating user role:', err);
      setError('ભૂમિકા અપડેટ કરવામાં કંઈક ભૂલ થઈ.');
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === profile?.uid) {
      setError('તમે તમારી જાતને કાઢી શકતા નથી.');
      return;
    }
    setLoading(true);
    try {
      const userRef = doc(db, 'profiles', uid);
      await deleteDoc(userRef);
      setSuccess('વપરાશકર્તા સફળતાપૂર્વક કાઢી નાખવામાં આવ્યો!');
      setUserDeleteConfirm(null);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setError('વપરાશકર્તાને કાઢી નાખવામાં ભૂલ થઈ.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsEditing(null);
    setIsAdding(false);
    setNewStockAddition('');
    setFormData({
      name: '',
      name_gu: '',
      name_hi: '',
      name_en: '',
      englishName: '',
      description: '',
      description_gu: '',
      description_hi: '',
      description_en: '',
      imageUrl: '',
      category: 'vegetable',
      inStock: true,
      totalStock: 0,
      pricingOptions: [
        { unit: '1kg', price: 0, costPrice: 0 }
      ]
    });
    setPendingFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-12 w-12 text-green-600 animate-spin" />
        <p className="text-slate-600 font-bold">લોડ થઈ રહ્યું છે...</p>
      </div>
    );
  }

  if (profile.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-red-100 shadow-xl">
        <div className="bg-red-50 p-6 rounded-full mb-6">
          <Shield className="h-16 w-16 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.accessDenied}</h2>
        <p className="text-slate-500 mb-8">{t.noPermission}</p>
        <button
          onClick={() => window.location.hash = '/'}
          className="bg-green-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-green-700 transition-all"
        >
          {t.goToHome}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10 pb-20">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 bg-farm-g1 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
        <div className="absolute top-[-50px] right-[-50px] w-64 h-64 bg-farm-s2 opacity-5 rounded-full blur-3xl" />
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-white rounded-[22px] flex items-center justify-center shadow-lg transform -rotate-3 group hover:rotate-0 transition-transform duration-500">
             <Shield className="h-8 w-8 text-farm-g2" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-white font-syne italic uppercase tracking-tighter">{t.adminPortal}</h1>
            <p className="text-farm-s2/60 text-[10px] font-black uppercase tracking-[0.3em] mt-1 gu">Premium Farm Fresh Management System</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-6 py-3 bg-red-500/10 text-red-400 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all border border-red-500/20 group"
          >
            <LogOut className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            {t.logout}
          </button>
          
          <div className="h-10 w-[1px] bg-white/10 mx-2 hidden lg:block" />

          <div className="flex flex-wrap justify-center lg:flex-nowrap bg-white/5 p-1.5 rounded-[24px] lg:rounded-[32px] border border-white/10 backdrop-blur-md overflow-hidden max-w-full gap-1">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'dashboard' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.dashboard}
            </button>
            <button
              onClick={() => setActiveTab('vegetables')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'vegetables' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.vegetables}
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'orders' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.orders} ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'users' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.users} ({users.length})
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'reports' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.reports}
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 lg:px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-grow lg:flex-grow-0 ${activeTab === 'settings' ? 'bg-farm-s2 text-farm-g1 shadow-xl scale-105' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
            >
              {t.settings}
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-8 rounded-[32px] border border-farm-border shadow-farm-card relative overflow-hidden group hover:scale-[1.02] transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-2xl" />
              <div className="flex items-center justify-between mb-6">
                <div className="bg-farm-cream p-4 rounded-2xl border border-farm-border text-farm-g2 group-hover:bg-farm-g1 group-hover:text-farm-s2 transition-colors">
                  <IndianRupee className="h-7 w-7" />
                </div>
                <span className="text-[10px] font-black text-farm-g1 bg-farm-s2 px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">REVENUE</span>
              </div>
              <h3 className="text-3xl font-black text-farm-g1 font-syne italic">{formatINR(dashboardData.totalRevenue)}</h3>
              <p className="text-[10px] text-farm-muted font-bold mt-2 uppercase tracking-widest opacity-60">Delivered Order Revenue</p>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-farm-border shadow-farm-card relative overflow-hidden group hover:scale-[1.02] transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
              <div className="flex items-center justify-between mb-6">
                <div className="bg-farm-cream p-4 rounded-2xl border border-farm-border text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <TrendingUp className="h-7 w-7" />
                </div>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">EST. PROFIT</span>
              </div>
              <h3 className="text-3xl font-black text-farm-g1 font-syne italic">{formatINR(dashboardData.totalProfit)}</h3>
              <p className="text-[10px] text-farm-muted font-bold mt-2 uppercase tracking-widest opacity-60">Revenue minus cost</p>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-farm-border shadow-farm-card relative overflow-hidden group hover:scale-[1.02] transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl" />
              <div className="flex items-center justify-between mb-6">
                <div className="bg-farm-cream p-4 rounded-2xl border border-farm-border text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                  <ShoppingBag className="h-7 w-7" />
                </div>
                <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">TOTAL ORDERS</span>
              </div>
              <h3 className="text-3xl font-black text-farm-g1 font-syne italic">{dashboardData.totalOrders}</h3>
              <p className="text-[10px] text-farm-muted font-bold mt-2 uppercase tracking-widest opacity-60">Total orders processed</p>
            </div>

            <div className="bg-white p-8 rounded-[32px] border border-farm-border shadow-farm-card relative overflow-hidden group hover:scale-[1.02] transition-all">
              <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
              <div className="flex items-center justify-between mb-6">
                <div className="bg-farm-cream p-4 rounded-2xl border border-farm-border text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Users className="h-7 w-7" />
                </div>
                <span className="text-[10px] font-black text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full uppercase tracking-widest shadow-sm">CUSTOMERS</span>
              </div>
              <h3 className="text-3xl font-black text-farm-g1 font-syne italic">{users.length}</h3>
              <p className="text-[10px] text-farm-muted font-bold mt-2 uppercase tracking-widest opacity-60">Registered user count</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Sales Chart */}
            <div className="lg:col-span-2 bg-white p-8 rounded-[40px] border border-farm-border shadow-farm-card">
              <div className="flex items-center justify-between mb-10">
                <div>
                  <h3 className="text-2xl font-black text-farm-g1 font-syne italic uppercase tracking-tight flex items-center gap-3">
                    <BarChart3 className="h-6 w-6 text-farm-g2" />
                    7-Day Revenue Trend
                  </h3>
                  <p className="text-[10px] text-farm-muted font-black uppercase tracking-widest mt-1 opacity-60">Performance Overview</p>
                </div>
              </div>
              <div className="h-[350px] w-full pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboardData.last7Days}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1e3a1a" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#1e3a1a" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="#E8EAE6" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: '900', fill: '#8C9184' }} 
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: '900', fill: '#8C9184' }}
                      tickFormatter={(value) => `₹${value}`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '24px', border: '2px solid #E8EAE6', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', background: 'white' }}
                      itemStyle={{ fontWeight: '900', fontSize: '14px', color: '#1e3a1a' }}
                      labelStyle={{ fontWeight: '900', fontSize: '10px', color: '#8C9184', marginBottom: '8px', textTransform: 'uppercase' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="revenue" 
                      stroke="#1e3a1a" 
                      strokeWidth={4}
                      fillOpacity={1} 
                      fill="url(#colorRev)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Top Items */}
            <div className="bg-farm-g1 p-8 rounded-[40px] shadow-2xl relative overflow-hidden">
               <div className="absolute bottom-[-50px] left-[-30px] w-48 h-48 bg-farm-s2 opacity-5 rounded-full blur-3xl" />
               <div className="relative z-10 h-full flex flex-col">
                  <h3 className="text-2xl font-black text-white font-syne italic uppercase tracking-tight mb-8 flex items-center gap-3">
                    <PieChart className="h-6 w-6 text-farm-s2" />
                    Best Sellers
                  </h3>
                  <div className="space-y-4 flex-1">
                    {dashboardData.topItems.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10 group hover:bg-white/10 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-farm-s2/20 rounded-xl flex items-center justify-center text-xs font-black text-farm-s2 group-hover:scale-110 transition-transform">
                            {idx + 1}
                          </div>
                          <span className="text-sm font-bold text-white gu">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-farm-s2 uppercase tracking-widest block">{item.quantity} Orders</span>
                        </div>
                      </div>
                    ))}
                    {dashboardData.topItems.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full opacity-30 py-20">
                         <div className="text-5xl mb-4">📊</div>
                         <p className="text-white text-xs font-black uppercase tracking-widest">No Data Yet</p>
                      </div>
                    )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vegetables' && (
        <>
          <div className="flex justify-end gap-4">
            <button
              onClick={() => setIsAdding(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 transition-all shadow-md"
            >
              <Plus className="h-5 w-5" />
              નવું શાકભાજી ઉમેરો
            </button>
          </div>

          {/* Add/Edit Form */}
          {(isAdding || isEditing) && (
            <div className="bg-white p-6 rounded-2xl border border-green-200 shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">
                  {isEditing ? 'શાકભાજી એડિટ કરો' : 'નવું શાકભાજી ઉમેરો'}
                </h2>
                <button onClick={resetForm} className="text-slate-400 hover:text-slate-600">
                  <X className="h-6 w-6" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 mb-1">નામ PRIMARY (GUJARATI)</label>
                        <input
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value, name_gu: e.target.value })}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 gu"
                          placeholder="દા.ત. બટાકા"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 mb-1">ENGLISH NAME</label>
                        <input
                          type="text"
                          value={formData.name_en || formData.englishName || ''}
                          onChange={(e) => setFormData({ ...formData, name_en: e.target.value, englishName: e.target.value })}
                          className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500"
                          placeholder="English Name"
                        />
                      </div>
                    </div>



                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">વિભાગ (Category)</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                        className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="vegetable">શાકભાજી (Vegetable)</option>
                        <option value="grocery">કરિયાણું (Grocery)</option>
                        <option value="namkeen">નમકીન (Namkeen)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="inStock"
                        checked={formData.inStock}
                        onChange={(e) => setFormData({ ...formData, inStock: e.target.checked })}
                        className="h-5 w-5 text-green-600 focus:ring-green-500 border-slate-300 rounded"
                      />
                      <label htmlFor="inStock" className="text-sm font-bold text-slate-700 cursor-pointer">સ્ટોકમાં છે</label>
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-2">
                    <label className="block text-sm font-black text-blue-800 mb-1">કુલ સ્ટોક (Total Stock)</label>
                    <p className="text-[10px] text-blue-600 font-bold mb-3">* જો શાકભાજી કિલોમાં હોય તો કિલો મુજબ લખવું (દા.ત. 50 કિલો હોય તો 50 લખવું)</p>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="relative flex-1">
                        <label className="block text-[10px] font-bold text-blue-400 mb-1 uppercase">હાલનો સ્ટોક (Current)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.totalStock || 0}
                          onChange={(e) => {
                            const newAmount = Number(e.target.value);
                            setFormData({ 
                              ...formData, 
                              totalStock: newAmount,
                              inStock: newAmount > 0 ? true : formData.inStock
                            });
                          }}
                          className="w-full pl-3 pr-10 py-2 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 font-black text-blue-700 bg-white"
                          placeholder="0"
                        />
                        <span className="absolute right-3 top-7 text-[10px] font-black text-blue-400 uppercase tracking-tighter">KG / Pcs</span>
                      </div>

                      <div className="flex-1">
                        <label className="block text-[10px] font-bold text-green-600 mb-1 uppercase">નવી ખરીદી ઉમેરો (Add New Purchase)</label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <input
                              type="number"
                              step="0.01"
                              value={newStockAddition}
                              onChange={(e) => setNewStockAddition(e.target.value)}
                              className="w-full pl-3 pr-8 py-2 border border-green-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 font-black text-green-700 bg-white"
                              placeholder="0"
                            />
                            <span className="absolute right-2 top-2 text-[10px] font-black text-green-400 uppercase tracking-tighter">KG</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const addition = parseFloat(newStockAddition);
                              if (isNaN(addition) || addition <= 0) return;
                              const current = formData.totalStock || 0;
                              const newAmount = Number((current + addition).toFixed(2));
                              setFormData({ 
                                ...formData, 
                                totalStock: newAmount,
                                inStock: newAmount > 0 ? true : formData.inStock
                              });
                              setNewStockAddition('');
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg font-black hover:bg-green-700 active:scale-95 transition-all flex items-center gap-2"
                          >
                            <Plus className="h-4 w-4" />
                            ઉમેરો
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-bold text-slate-700">કિંમત સેટ કરો (Set Pricing)</label>
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = [...(formData.pricingOptions || [])];
                          newOptions.push({ unit: '', price: 0, costPrice: 0 });
                          setFormData({ ...formData, pricingOptions: newOptions });
                        }}
                        className="text-xs font-black text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100 hover:bg-green-100 transition-all flex items-center gap-2"
                      >
                        <Plus className="h-3 w-3" />
                        નવો ઓપ્શન ઉમેરો
                      </button>
                    </div>

                    <div className="space-y-3">
                      {(formData.pricingOptions || []).map((option, idx) => (
                        <div key={idx} className="bg-slate-50 p-4 rounded-xl border border-slate-100 animate-in zoom-in-95 duration-200">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex-1 max-w-[150px]">
                              <input
                                type="text"
                                value={option.unit}
                                placeholder="દા.ત. 1kg, 500g"
                                onChange={(e) => {
                                  const newOptions = [...(formData.pricingOptions || [])];
                                  newOptions[idx] = { ...option, unit: e.target.value };
                                  setFormData({ ...formData, pricingOptions: newOptions });
                                }}
                                className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-[10px] font-black uppercase tracking-widest bg-white"
                              />
                            </div>
                            <button 
                              type="button"
                              onClick={() => {
                                const newOptions = (formData.pricingOptions || []).filter((_, i) => i !== idx);
                                setFormData({ ...formData, pricingOptions: newOptions });
                              }}
                              className="text-red-400 hover:text-red-600 transition-colors p-1"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">વેચાણ કિંમત (Price)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">₹</span>
                                <input
                                  type="number"
                                  value={option.price || ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const newOptions = [...(formData.pricingOptions || [])];
                                    newOptions[idx] = { ...option, price: Number(e.target.value) };
                                    setFormData({ ...formData, pricingOptions: newOptions });
                                  }}
                                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm font-bold"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-orange-500 mb-1 uppercase">ડિસ્કાઉન્ટ ભાવ (Discount Price)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">₹</span>
                                <input
                                  type="number"
                                  value={option.discountPrice || ''}
                                  placeholder="ઓપ્શનલ"
                                  onChange={(e) => {
                                    const newOptions = [...(formData.pricingOptions || [])];
                                    newOptions[idx] = { ...option, discountPrice: e.target.value ? Number(e.target.value) : undefined };
                                    setFormData({ ...formData, pricingOptions: newOptions });
                                  }}
                                  className="w-full pl-7 pr-3 py-1.5 border border-orange-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm font-bold bg-orange-50/30"
                                />
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">ખરીદ કિંમત (Cost)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">₹</span>
                                <input
                                  type="number"
                                  value={option.costPrice || ''}
                                  placeholder="0"
                                  onChange={(e) => {
                                    const newOptions = [...(formData.pricingOptions || [])];
                                    newOptions[idx] = { ...option, costPrice: Number(e.target.value) };
                                    setFormData({ ...formData, pricingOptions: newOptions });
                                  }}
                                  className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 text-sm font-bold"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">શાકભાજીનો ફોટો</label>
                    <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-slate-300 border-dashed rounded-xl hover:border-green-400 transition-colors relative group">
                      {formData.imageUrl && formData.imageUrl.trim() !== '' ? (
                        <div className="relative">
                          <img
                            src={formData.imageUrl}
                            alt="Preview"
                            className="h-40 w-40 object-cover rounded-lg shadow-md"
                          />
                          <button
                            onClick={() => {
                              setFormData({ ...formData, imageUrl: '' });
                              setPendingFile(null);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg hover:bg-red-600 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1 text-center">
                          <ImageIcon className="mx-auto h-12 w-12 text-slate-400" />
                          <div className="flex text-sm text-slate-600">
                            <label className="relative cursor-pointer bg-white rounded-md font-bold text-green-600 hover:text-green-500 focus-within:outline-none">
                              <span>ફોટો અપલોડ કરો</span>
                              <input
                                ref={fileInputRef}
                                type="file"
                                className="sr-only"
                                accept="image/*"
                                onChange={handleFileUpload}
                              />
                            </label>
                          </div>
                          <p className="text-xs text-slate-500">PNG, JPG, GIF up to 10MB</p>
                        </div>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-xl">
                          <Loader2 className="h-8 w-8 text-green-600 animate-spin mb-2" />
                          <p className="text-xs font-bold text-green-600">અપલોડ થઈ રહ્યું છે...</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">વર્ણન</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full p-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 h-24"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end gap-3">
                <button
                  onClick={resetForm}
                  className="px-6 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  કેન્સલ
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 shadow-md disabled:opacity-50"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  સેવ કરો
                </button>
              </div>
            </div>
          )}

          {/* Vegetable List Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="શાકભાજી શોધો..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              </div>
              <div className="text-xs font-bold text-slate-400">
                કુલ: {vegetables.length} | ફિલ્ટર: {vegetables.filter(v => {
                  const term = searchTerm.trim().toLowerCase();
                  if (!term) return true;
                  return (
                    v.name.toLowerCase().includes(term) || 
                    v.englishName?.toLowerCase().includes(term) ||
                    v.description?.toLowerCase().includes(term)
                  );
                }).length}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[800px]">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4 text-sm font-bold text-slate-600">શાકભાજી</th>
                    <th className="px-6 py-4 text-sm font-bold text-slate-600">વિભાગ</th>
                    <th className="px-6 py-4 text-sm font-bold text-slate-600">સ્ટોક (Stock)</th>
                    <th className="px-6 py-4 text-sm font-bold text-slate-600">કિંમત</th>
                    <th className="px-6 py-4 text-sm font-bold text-slate-600 text-right">એક્શન</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                {vegetables
                  .filter(veg => {
                    const term = searchTerm.trim().toLowerCase();
                    if (!term) return true;
                    return (
                      veg.name.toLowerCase().includes(term) || 
                      veg.englishName?.toLowerCase().includes(term) ||
                      veg.description?.toLowerCase().includes(term)
                    );
                  })
                  .map((veg) => (
                    <tr key={veg.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {veg.imageUrl && veg.imageUrl.trim() !== '' ? (
                          <img
                            src={veg.imageUrl}
                            alt={veg.name}
                            className="h-12 w-12 rounded-lg object-cover border border-slate-200 shadow-sm"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-200">
                            <ImageIcon className="h-6 w-6 text-slate-300" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <div className="font-bold text-slate-800">{veg.name}</div>
                          {veg.englishName && <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{veg.englishName}</div>}
                          {!veg.inStock && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-black rounded uppercase mt-1 inline-block w-fit">સ્ટોક નથી</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        veg.category === 'grocery' ? 'bg-blue-100 text-blue-700' : 
                        veg.category === 'namkeen' ? 'bg-purple-100 text-purple-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {veg.category === 'grocery' ? 'કરિયાણું' : 
                         veg.category === 'namkeen' ? 'નમકીન' : 
                         'શાકભાજી'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className={`text-xs font-black px-2 py-1 rounded w-fit ${
                          (veg.totalStock || 0) > 10 ? 'bg-blue-50 text-blue-600' : 
                          (veg.totalStock || 0) > 0 ? 'bg-orange-50 text-orange-600' : 
                          'bg-red-50 text-red-600'
                        }`}>
                          {veg.totalStock || 0}{((veg.totalStock || 0) > 0) ? (veg.category === 'vegetable' ? ' kg' : ' Pcs') : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {veg.pricingOptions?.filter(opt => opt.price > 0).map(opt => {
                          const hasDiscount = opt.discountPrice && opt.discountPrice > 0 && opt.discountPrice < opt.price;
                          return (
                            <span key={opt.unit} className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-bold border border-green-100 flex flex-col">
                              <span>{opt.unit}: {formatINR(hasDiscount ? opt.discountPrice! : opt.price)}</span>
                              {hasDiscount && (
                                <span className="text-[9px] text-red-400 line-through opacity-60">{formatINR(opt.price)}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setIsEditing(veg.id!);
                            setFormData({
                              ...veg,
                              name: veg.name || '',
                              name_gu: veg.name_gu || veg.name || '',
                              name_hi: veg.name_hi || '',
                              name_en: veg.name_en || veg.englishName || '',
                              englishName: veg.name_en || veg.englishName || '',
                              description: veg.description || '',
                              description_gu: veg.description_gu || veg.description || '',
                              description_hi: veg.description_hi || '',
                              description_en: veg.description_en || '',
                              inStock: veg.inStock !== undefined ? veg.inStock : true,
                              totalStock: veg.totalStock || 0,
                              pricingOptions: veg.pricingOptions && veg.pricingOptions.length > 0 
                                ? veg.pricingOptions 
                                : [{ unit: '1kg', price: 0, costPrice: 0 }]
                            });
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(veg.id!)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="h-6 w-6 text-green-600" />
              વપરાશકર્તા મેનેજમેન્ટ
            </h2>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="વપરાશકર્તા શોધો..."
                value={userSearchTerm}
                onChange={(e) => setUserSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 tracking-tight">ગ્રાહક (મોબાઈલ / ઈમેઈલ)</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 tracking-tight">વિગત (નામ / સરનામું)</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 tracking-tight">ભૂમિકા (Role)</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 text-right">એક્શન</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users
                  .filter(u => {
                    const term = userSearchTerm.trim().toLowerCase();
                    if (!term) return true;
                    return (
                      (u.email || '').toLowerCase().includes(term) ||
                      (u.firstName || '').toLowerCase().includes(term) ||
                      (u.lastName || '').toLowerCase().includes(term) ||
                      (u.phone || '').toLowerCase().includes(term)
                    );
                  })
                  .map((u) => (
                  <tr key={u.uid} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${u.phone ? 'bg-green-100' : 'bg-slate-100'}`}>
                          {u.phone ? <Phone className="h-4 w-4 text-green-600" /> : <Mail className="h-4 w-4 text-slate-500" />}
                        </div>
                        <div>
                          <div className="font-black text-slate-800 text-sm whitespace-nowrap">
                            {u.phone ? `+91 ${u.phone}` : u.email || 'No Identity'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono uppercase tracking-tighter">ID: {u.uid.slice(0, 8)}...</div>
                          {u.phone && u.email && (
                            <div className="text-[10px] text-slate-400 italic line-clamp-1 min-w-[120px]">{u.email}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col min-w-[150px]">
                        <div className="font-bold text-slate-700 text-xs whitespace-nowrap">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-[10px] text-slate-400 line-clamp-1 italic">
                          {u.address || 'સરનામું અપડેટ નથી'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Shield className={`h-4 w-4 ${u.role === 'admin' ? 'text-green-600' : 'text-slate-400'}`} />
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.uid, e.target.value as 'admin' | 'user')}
                          disabled={u.uid === profile?.uid}
                          className="text-sm border border-slate-200 rounded-lg p-1 outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDeleteUser(u.uid)}
                        disabled={u.uid === profile?.uid}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-30"
                      >
                        <UserMinus className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-green-600" />
              વેચાણ રિપોર્ટ (Sales Report)
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Daily Report */}
              <div className="space-y-4">
                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-green-800 flex items-center gap-2">
                      આજનો રિપોર્ટ
                      <span className="text-[10px] bg-green-200 px-1.5 py-0.5 rounded text-green-700">Today</span>
                    </h3>
                    <button
                      onClick={() => downloadReportCSV('day')}
                      className="p-1.5 bg-white text-green-600 rounded-lg hover:bg-green-100 transition-all shadow-sm border border-green-200"
                      title="ડાઉનલોડ કરો"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] text-green-600 font-bold uppercase">કુલ વેચાણ (Revenue)</p>
                        <p className="text-xl font-black text-green-700">{formatINR(getSalesReport('day').totalRevenue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-green-600 font-bold uppercase">ઓર્ડર</p>
                        <p className="text-lg font-black text-green-700">{getSalesReport('day').orderCount}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-green-100">
                      <div>
                        <p className="text-[10px] text-green-600 font-bold uppercase">ખરીદ કિંમત (Cost)</p>
                        <p className="text-sm font-bold text-slate-600">{formatINR(getSalesReport('day').totalCost)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-green-600 font-bold uppercase">નફો (Profit)</p>
                        <p className={`text-sm font-black ${getSalesReport('day').totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatINR(getSalesReport('day').totalProfit)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-2 text-left">શાકભાજી</th>
                        <th className="px-4 py-2 text-right">વજન/નંગ</th>
                        <th className="px-4 py-2 text-right">નફો (Profit)</th>
                        <th className="px-4 py-2 text-right">રૂપિયા</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getSalesReport('day').items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">આજે કોઈ વેચાણ નથી</td>
                        </tr>
                      ) : (
                        getSalesReport('day').items.map(([name, data]) => (
                          <tr key={name} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700">{name}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-500 text-xs">
                              {data.kg > 0 && `${data.kg} kg`}
                              {data.kg > 0 && data.pcs > 0 && ' + '}
                              {data.pcs > 0 && `${data.pcs} Pcs`}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold text-xs ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatINR(data.profit)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-green-600">
                              {formatINR(data.revenue)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Weekly Report */}
              <div className="space-y-4">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-blue-800 flex items-center gap-2">
                      આ અઠવાડિયાનો રિપોર્ટ
                      <span className="text-[10px] bg-blue-200 px-1.5 py-0.5 rounded text-blue-700">Weekly</span>
                    </h3>
                    <button
                      onClick={() => downloadReportCSV('week')}
                      className="p-1.5 bg-white text-blue-600 rounded-lg hover:bg-blue-100 transition-all shadow-sm border border-blue-200"
                      title="ડાઉનલોડ કરો"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] text-blue-600 font-bold uppercase">કુલ વેચાણ (Revenue)</p>
                        <p className="text-xl font-black text-blue-700">{formatINR(getSalesReport('week').totalRevenue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-blue-600 font-bold uppercase">ઓર્ડર</p>
                        <p className="text-lg font-black text-blue-700">{getSalesReport('week').orderCount}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-blue-100">
                      <div>
                        <p className="text-[10px] text-blue-600 font-bold uppercase">ખરીદ કિંમત (Cost)</p>
                        <p className="text-sm font-bold text-slate-600">{formatINR(getSalesReport('week').totalCost)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-blue-600 font-bold uppercase">નફો (Profit)</p>
                        <p className={`text-sm font-black ${getSalesReport('week').totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatINR(getSalesReport('week').totalProfit)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-2 text-left">શાકભાજી</th>
                        <th className="px-4 py-2 text-right">વજન/નંગ</th>
                        <th className="px-4 py-2 text-right">નફો (Profit)</th>
                        <th className="px-4 py-2 text-right">રૂપિયા</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getSalesReport('week').items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">આ અઠવાડિયે કોઈ વેચાણ નથી</td>
                        </tr>
                      ) : (
                        getSalesReport('week').items.map(([name, data]) => (
                          <tr key={name} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700">{name}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-500 text-xs">
                              {data.kg > 0 && `${data.kg} kg`}
                              {data.kg > 0 && data.pcs > 0 && ' + '}
                              {data.pcs > 0 && `${data.pcs} Pcs`}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold text-xs ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatINR(data.profit)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-blue-600">
                              {formatINR(data.revenue)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly Report */}
              <div className="space-y-4">
                <div className="bg-purple-50 p-4 rounded-xl border border-purple-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-purple-800 flex items-center gap-2">
                      આ મહિનાનો રિપોર્ટ
                      <span className="text-[10px] bg-purple-200 px-1.5 py-0.5 rounded text-purple-700">Monthly</span>
                    </h3>
                    <button
                      onClick={() => downloadReportCSV('month')}
                      className="p-1.5 bg-white text-purple-600 rounded-lg hover:bg-purple-100 transition-all shadow-sm border border-purple-200"
                      title="ડાઉનલોડ કરો"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[10px] text-purple-600 font-bold uppercase">કુલ વેચાણ (Revenue)</p>
                        <p className="text-xl font-black text-purple-700">{formatINR(getSalesReport('month').totalRevenue)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-purple-600 font-bold uppercase">ઓર્ડર</p>
                        <p className="text-lg font-black text-purple-700">{getSalesReport('month').orderCount}</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-purple-100">
                      <div>
                        <p className="text-[10px] text-purple-600 font-bold uppercase">ખરીદ કિંમત (Cost)</p>
                        <p className="text-sm font-bold text-slate-600">{formatINR(getSalesReport('month').totalCost)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-purple-600 font-bold uppercase">નફો (Profit)</p>
                        <p className={`text-sm font-black ${getSalesReport('month').totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatINR(getSalesReport('month').totalProfit)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="px-4 py-2 text-left">શાકભાજી</th>
                        <th className="px-4 py-2 text-right">વજન/નંગ</th>
                        <th className="px-4 py-2 text-right">નફો (Profit)</th>
                        <th className="px-4 py-2 text-right">રૂપિયા</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {getSalesReport('month').items.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic">આ મહિને કોઈ વેચાણ નથી</td>
                        </tr>
                      ) : (
                        getSalesReport('month').items.map(([name, data]) => (
                          <tr key={name} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 font-bold text-slate-700">{name}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-500 text-xs">
                              {data.kg > 0 && `${data.kg} kg`}
                              {data.kg > 0 && data.pcs > 0 && ' + '}
                              {data.pcs > 0 && `${data.pcs} Pcs`}
                            </td>
                            <td className={`px-4 py-3 text-right font-bold text-xs ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatINR(data.profit)}
                            </td>
                            <td className="px-4 py-3 text-right font-black text-purple-600">
                              {formatINR(data.revenue)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2 text-green-700 font-bold text-lg">
              <Settings className="h-6 w-6" />
              એપ સેટિંગ્સ
            </div>
            <button
              onClick={() => settingsForm && handleSettingsSave(settingsForm)}
              disabled={loading}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-green-100 hover:bg-green-700 transition-all disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              સેવ કરો (Save)
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="col-span-1 md:col-span-2 space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <label className="block text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                <MapPin className="h-5 w-5 text-blue-600" />
                વેરહાઉસ (દુકાન) નું સરનામું અને લોકેશન
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">સરનામું (Address)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="દુકાનનું પૂરું સરનામું"
                      value={settingsForm?.warehouseAddress || ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, warehouseAddress: e.target.value } : null)}
                      className="flex-1 p-3 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-bold text-slate-700"
                    />
                    <button
                      onClick={handleSearchLocation}
                      disabled={isSearchingLocation}
                      title="સરનામા પરથી Lat/Lng શોધો"
                      className="bg-blue-600 text-white px-4 rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                    >
                      {isSearchingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      સરનામાથી શોધો
                    </button>
                  </div>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Google Maps લિંક (Optional)</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        placeholder="લિંક અહીં પેસ્ટ કરો..."
                        value={mapsLink}
                        onChange={(e) => setMapsLink(e.target.value)}
                        className="w-full p-3 pr-10 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-medium text-slate-700"
                      />
                      {mapsLink && (
                        <button 
                          onClick={() => setMapsLink('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleExtractFromLink}
                      disabled={isSearchingLocation || !mapsLink}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-blue-700 transition-all flex items-center gap-2 disabled:opacity-50 shadow-md shadow-blue-100"
                    >
                      {isSearchingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      લિંકથી સેટ કરો
                    </button>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-1">* બ્રાઉઝરની લિંક (URL) માંથી ઓટોમેટિક લોકેશન ખેંચી લેશે.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Latitude (X)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="23.0225"
                      value={settingsForm?.warehouseLat ?? ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, warehouseLat: e.target.value === '' ? 0 : parseFloat(e.target.value) } : null)}
                      className="w-full p-3 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-bold text-slate-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 uppercase">Longitude (Y)</label>
                    <input
                      type="number"
                      step="any"
                      placeholder="72.5714"
                      value={settingsForm?.warehouseLng ?? ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, warehouseLng: e.target.value === '' ? 0 : parseFloat(e.target.value) } : null)}
                      className="w-full p-3 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-bold text-slate-700"
                    />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  onClick={handleGetAdminLocation}
                  disabled={isAdminLocating}
                  className="text-[10px] bg-white border border-blue-200 text-blue-600 px-3 py-1.5 rounded-lg font-bold hover:bg-blue-50 flex items-center gap-1 transition-colors"
                >
                  {isAdminLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <MapPin className="h-3 w-3" />}
                  મારું અત્યારનું લોકેશન વાપરો
                </button>
                {settingsForm?.warehouseLat && settingsForm?.warehouseLng && (
                  <a 
                    href={`https://www.google.com/maps/search/?api=1&query=${settingsForm.warehouseLat},${settingsForm.warehouseLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-bold hover:bg-slate-50 flex items-center gap-1 transition-colors"
                  >
                    <MapPin className="h-3 w-3" />
                    નકશામાં જુઓ
                  </a>
                )}
                {adminDist !== null && (
                  <div className="text-[10px] bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1">
                    <Truck className="h-3 w-3" />
                    તમારાથી અંતર: {adminDist.toFixed(2)} કિમી
                  </div>
                )}
                <button
                  onClick={() => settingsForm && handleSettingsSave(settingsForm)}
                  disabled={loading}
                  className="text-[10px] bg-green-600 text-white px-4 py-1.5 rounded-lg font-bold hover:bg-green-700 flex items-center gap-1 ml-auto"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  સેવ કરો
                </button>
              </div>
              {warehouseArea && (
                <div className="mt-2 p-2 bg-blue-50/50 rounded-lg border border-blue-100/50">
                  <p className="text-[10px] text-blue-600 font-bold flex items-start gap-1">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    સેટ કરેલું લોકેશન: <span className="font-medium text-slate-600">{warehouseArea}</span>
                  </p>
                </div>
              )}
              <p className="text-xs text-blue-600 font-medium mt-2">આ લોકેશનથી ગ્રાહકનું અંતર ગણવામાં આવશે. તમે જાતે Lat/Lng નાખી શકો છો અથવા ઉપરના બટનો વાપરી શકો છો.</p>
            </div>

            <div className="space-y-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <Truck className="h-5 w-5 text-green-600" />
                ફ્રી ડિલિવરી અંતર (કિમી)
              </label>
              <input
                type="number"
                value={settingsForm?.freeDeliveryDistance ?? ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, freeDeliveryDistance: e.target.value === '' ? 0 : Number(e.target.value) } : null)}
                className="w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm font-bold"
              />
              <p className="text-xs text-slate-500">આટલા કિમી સુધી કોઈ ડિલિવરી ચાર્જ લાગશે નહીં.</p>
            </div>

            <div className="space-y-4 p-4 bg-green-50 rounded-xl border border-green-100">
              <label className="block text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                <ShoppingBag className="h-5 w-5 text-green-600" />
                ફ્રી ડિલિવરી સ્કીમ (₹)
              </label>
              <input
                type="number"
                value={settingsForm?.freeDeliveryThreshold ?? ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, freeDeliveryThreshold: e.target.value === '' ? 0 : Number(e.target.value) } : null)}
                className="w-full p-3 border border-green-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm font-bold text-green-700"
              />
              <p className="text-xs text-green-600 font-medium">જો ઓર્ડર આ રકમથી વધુ હશે, તો ડિલિવરી ફ્રી રહેશે.</p>
            </div>

            <div className="space-y-4 p-4 bg-orange-50 rounded-xl border border-orange-100">
              <label className="block text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                <Truck className="h-5 w-5 text-orange-600" />
                ડિલિવરી ચાર્જ (₹)
              </label>
              <input
                type="number"
                value={settingsForm?.deliveryCharge ?? ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, deliveryCharge: e.target.value === '' ? 0 : Number(e.target.value) } : null)}
                className="w-full p-3 border border-orange-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 bg-white shadow-sm font-bold text-orange-700"
              />
              <p className="text-xs text-orange-600 font-medium">જ્યારે ફ્રી ડિલિવરી લાગુ ન હોય ત્યારે આ બેઝ ચાર્જ લેવામાં આવશે.</p>
            </div>

            <div className="space-y-4 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <label className="block text-sm font-bold text-blue-800 mb-2 flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-600" />
                ડિસ્ટન્સ કેલિબ્રેશન (Calibration)
              </label>
              <input
                type="number"
                step="0.01"
                value={settingsForm?.distanceAdjustment ?? ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, distanceAdjustment: e.target.value === '' ? 1.0 : parseFloat(e.target.value) } : null)}
                className="w-full p-3 border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 bg-white shadow-sm font-bold text-blue-700"
              />
              <p className="text-xs text-blue-600 font-medium">Google Maps સાથે સેટીંગ કરવા માટે (દા.ત. 1.05 = અંતરમાં 5% નો વધારો). ડિફોલ્ટ 1.0 છે.</p>
            </div>

            <div className="space-y-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
              <label className="block text-sm font-bold text-purple-800 mb-2 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-purple-600" />
                પ્રતિ કિમી ચાર્જ (₹/km)
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="દા.ત. 5"
                value={settingsForm?.deliveryChargePerKm ?? ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, deliveryChargePerKm: e.target.value === '' ? 0 : parseFloat(e.target.value) } : null)}
                className="w-full p-3 border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white shadow-sm font-bold text-purple-700"
              />
              <p className="text-xs text-purple-600 font-medium">જો તમે અંતર મુજબ વધારાનો ચાર્જ લેવા માંગતા હોવ (ઓપ્શનલ).</p>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-6 p-6 bg-farm-g4/5 rounded-3xl border border-farm-g4/10">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-farm-g1 flex items-center gap-2">
                   <Star className="h-6 w-6 text-farm-s1" />
                   હોમપેજ ડીલ (Homepage Deal)
                </h3>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={settingsForm?.showHomepageDeal !== false} 
                    onChange={(e) => setSettingsForm(prev => prev ? { ...prev, showHomepageDeal: e.target.checked } : null)}
                    className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-farm-g4" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-farm-muted px-1 uppercase tracking-wider">ડીલ ટાઈટલ</label>
                    <input 
                      type="text" 
                      placeholder="પ્રથમ ઓર્ડર? 20% ઓફ!"
                      value={settingsForm?.homepageDealTitle || ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, homepageDealTitle: e.target.value } : null)}
                      className="w-full p-3 border border-farm-border rounded-xl font-bold bg-white"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-farm-muted px-1 uppercase tracking-wider">ડીલ લખાણ</label>
                    <input 
                      type="text" 
                      placeholder="પ્રોમો કોડ વાપરો અને બચત કરો"
                      value={settingsForm?.homepageDealSub || ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, homepageDealSub: e.target.value } : null)}
                      className="w-full p-3 border border-farm-border rounded-xl font-bold bg-white"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-xs font-bold text-farm-muted px-1 uppercase tracking-wider">પ્રોમો કોડ</label>
                    <input 
                      type="text" 
                      placeholder="FRESH20"
                      value={settingsForm?.homepageDealCode || ''}
                      onChange={(e) => setSettingsForm(prev => prev ? { ...prev, homepageDealCode: e.target.value } : null)}
                      className="w-full p-3 border border-farm-border rounded-xl font-bold bg-white uppercase"
                    />
                 </div>
              </div>
              <p className="text-[10px] text-farm-muted font-bold">હોમપેજ પર બતાવાતી મુખ્ય ડીલ અહીંથી બદલી શકાશે. ગ્રાહકોને આકર્ષવા માટે આનો ઉપયોગ કરો.</p>
            </div>

            <div className="space-y-4 p-4 bg-green-50 rounded-xl border border-green-100">
              <label className="block text-sm font-bold text-green-800 mb-2 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-green-600" />
                WhatsApp નંબર
              </label>
              <input
                type="text"
                placeholder="દા.ત. 919876543210"
                value={settingsForm?.whatsappNumber || ''}
                onChange={(e) => setSettingsForm(prev => prev ? { ...prev, whatsappNumber: e.target.value } : null)}
                className="w-full p-3 border border-green-200 rounded-lg outline-none focus:ring-2 focus:ring-green-500 bg-white shadow-sm font-bold text-green-700"
              />
              <p className="text-xs text-green-600 font-medium">ગ્રાહકો આ નંબર પર WhatsApp મેસેજ કરી શકશે. (કન્ટ્રી કોડ સાથે લખો, દા.ત. 91...)</p>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <label className="block text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-600" />
                ડિલિવરી ટાઈમ સ્લોટ (Delivery Slots)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="newSlotInput"
                  placeholder="દા.ત. 09:00 AM - 11:00 AM"
                  className="flex-1 p-3 border border-amber-200 rounded-lg outline-none focus:ring-2 focus:ring-amber-500 bg-white shadow-sm font-bold"
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('newSlotInput') as HTMLInputElement;
                    if (input.value.trim()) {
                      const newSlots = [...(settingsForm?.deliverySlots || []), input.value.trim()];
                      setSettingsForm(prev => prev ? { ...prev, deliverySlots: newSlots } : null);
                      input.value = '';
                    }
                  }}
                  className="bg-amber-600 text-white px-4 rounded-lg font-bold hover:bg-amber-700"
                >
                  ઉમેરો
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {settingsForm?.deliverySlots?.map((slot, idx) => (
                  <div key={idx} className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 flex items-center gap-2 text-sm font-bold text-amber-700">
                    {slot}
                    <button
                      onClick={() => {
                        const newSlots = settingsForm.deliverySlots?.filter((_, i) => i !== idx);
                        setSettingsForm(prev => prev ? { ...prev, deliverySlots: newSlots } : null);
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 space-y-4 p-4 bg-purple-50 rounded-xl border border-purple-100">
              <label className="block text-sm font-bold text-purple-800 mb-2 flex items-center gap-2">
                <Ticket className="h-5 w-5 text-purple-600" />
                પ્રોમો કોડ મેનેજમેન્ટ (Promo Codes)
              </label>
              <div className="overflow-x-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl border border-purple-100 mb-4 min-w-[600px]">
                  <input id="promoCode" placeholder="CODE" className="p-2 border rounded-lg text-sm font-bold uppercase" />
                  <select id="promoType" className="p-2 border rounded-lg text-sm font-bold">
                    <option value="percentage">% Percentage</option>
                    <option value="fixed">₹ Fixed Amount</option>
                  </select>
                  <input id="promoValue" type="number" placeholder="Value" className="p-2 border rounded-lg text-sm font-bold" />
                  <input id="promoMin" type="number" placeholder="Min Order" className="p-2 border rounded-lg text-sm font-bold" />
                  <button
                    onClick={async () => {
                      const code = (document.getElementById('promoCode') as HTMLInputElement).value.toUpperCase();
                      const type = (document.getElementById('promoType') as HTMLSelectElement).value;
                      const value = Number((document.getElementById('promoValue') as HTMLInputElement).value);
                      const min = Number((document.getElementById('promoMin') as HTMLInputElement).value);
                      
                      if (!code || !value) return;
                      
                      try {
                        const promoCodesRef = collection(db, 'promo_codes');
                        await addDoc(promoCodesRef, {
                          code, 
                          type, 
                          value, 
                          min_order_amount: min, 
                          is_active: true,
                          created_at: serverTimestamp()
                        });
                        setSuccess('પ્રોમો કોડ ઉમેરાઈ ગયો!');
                      } catch (err) {
                        console.error('Error adding promo code:', err);
                        setError('પ્રોમો કોડ ઉમેરવામાં ભૂલ થઈ.');
                      }
                    }}
                    className="sm:col-span-2 lg:col-span-4 bg-purple-600 text-white py-2 rounded-lg font-bold hover:bg-purple-700 mt-2"
                  >
                    નવો પ્રોમો કોડ ઉમેરો
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {promoCodes.map(promo => (
                  <div key={promo.id} className="bg-white p-3 rounded-xl border border-purple-100 flex justify-between items-center">
                    <div>
                      <span className="font-black text-purple-700 mr-2">{promo.code}</span>
                      <span className="text-xs font-bold text-slate-500">
                        {promo.type === 'percentage' ? `${promo.value}%` : formatINR(promo.value)} Off | Min: {formatINR(promo.minOrderAmount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const promoRef = doc(db, 'promo_codes', promo.id);
                          await updateDoc(promoRef, { is_active: !promo.isActive });
                        }}
                        className={`px-2 py-1 rounded text-[10px] font-bold ${promo.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {promo.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={async () => {
                          const promoRef = doc(db, 'promo_codes', promo.id);
                          await deleteDoc(promoRef);
                        }}
                        className="text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`space-y-4 p-4 rounded-xl border transition-all ${settingsForm?.isShopOpen ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
              <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                <Store className={`h-5 w-5 ${settingsForm?.isShopOpen ? 'text-green-600' : 'text-red-600'}`} />
                દુકાન ચાલુ/બંધ (Shop Status)
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSettingsForm(prev => {
                    const base = prev || {
                      freeDeliveryDistance: 5,
                      freeDeliveryThreshold: 500,
                      deliveryCharge: 30,
                      whatsappNumber: '',
                      isShopOpen: true,
                      deliverySlots: []
                    };
                    return { ...base, isShopOpen: true };
                  })}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${settingsForm?.isShopOpen ? 'bg-green-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}
                >
                  ચાલુ (Open)
                </button>
                <button
                  onClick={() => setSettingsForm(prev => {
                    const base = prev || {
                      freeDeliveryDistance: 5,
                      freeDeliveryThreshold: 500,
                      deliveryCharge: 30,
                      whatsappNumber: '',
                      isShopOpen: true,
                      deliverySlots: []
                    };
                    return { ...base, isShopOpen: false };
                  })}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${!settingsForm?.isShopOpen ? 'bg-red-600 text-white shadow-lg' : 'bg-white text-slate-400 border border-slate-200'}`}
                >
                  બંધ (Closed)
                </button>
              </div>
              <p className={`text-xs font-medium ${settingsForm?.isShopOpen ? 'text-green-600' : 'text-red-600'}`}>
                {settingsForm?.isShopOpen ? 'દુકાન અત્યારે ચાલુ છે. ગ્રાહકો ઓર્ડર કરી શકશે.' : 'દુકાન અત્યારે બંધ છે. ગ્રાહકો ઓર્ડર કરી શકશે નહીં.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <div className="space-y-6">
          {/* Daily Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm flex items-center gap-4">
              <div className="bg-green-100 p-3 rounded-xl">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">આજના કુલ રૂપિયા</p>
                <p className="text-2xl font-black text-green-700">
                  {formatINR(orders
                    .filter(order => {
                      const orderDate = new Date(order.createdAt);
                      const today = new Date();
                      return orderDate.getDate() === today.getDate() &&
                             orderDate.getMonth() === today.getMonth() &&
                             orderDate.getFullYear() === today.getFullYear() &&
                             order.status !== 'Cancelled';
                    })
                    .reduce((sum, order) => sum + order.totalAmount, 0)
                  )}
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm flex items-center gap-4">
              <div className="bg-blue-100 p-3 rounded-xl">
                <ShoppingBag className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">આજના ઓર્ડર</p>
                <p className="text-2xl font-black text-blue-700">
                  {orders.filter(order => {
                    const orderDate = new Date(order.createdAt);
                    const today = new Date();
                    return orderDate.getDate() === today.getDate() &&
                           orderDate.getMonth() === today.getMonth() &&
                           orderDate.getFullYear() === today.getFullYear();
                  }).length}
                </p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-orange-100 shadow-sm flex items-center gap-4">
              <div className="bg-orange-100 p-3 rounded-xl">
                <Clock className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">બાકી ઓર્ડર (Pending)</p>
                <p className="text-2xl font-black text-orange-700">
                  {orders.filter(order => order.status === 'Pending').length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-green-100 shadow-sm">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ShoppingBag className="h-6 w-6 text-green-600" />
                ગ્રાહક ઓર્ડર્સ
              </h2>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ઓર્ડર શોધો (નામ, ફોન, ID)..."
                    value={orderSearchTerm}
                    onChange={(e) => setOrderSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 transition-all"
                  />
                </div>
                <button
                  onClick={downloadOrdersCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all shadow-md whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  ઓર્ડર લિસ્ટ ડાઉનલોડ કરો
                </button>
                <button
                  onClick={handleDeleteAllOrders}
                  disabled={loading}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-md whitespace-nowrap ${
                    orderDeleteConfirm 
                      ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse' 
                      : 'bg-white text-red-600 border border-red-100 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="h-4 w-4" />
                  {orderDeleteConfirm ? 'ચોક્કસ? અહીં ફરી ક્લિક કરો' : 'બધા ઓર્ડર કાઢી નાખો'}
                </button>
                {orderDeleteConfirm && (
                  <button 
                    onClick={() => setOrderDeleteConfirm(false)}
                    className="p-2 bg-slate-100 text-slate-400 rounded-xl hover:text-slate-600 transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
            
            {orders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>હજુ સુધી કોઈ ઓર્ડર નથી.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders
                  .filter(order => {
                    const term = orderSearchTerm.trim().toLowerCase();
                    if (!term) return true;
                    return (
                      order.customerName.toLowerCase().includes(term) ||
                      order.customerPhone.toLowerCase().includes(term) ||
                      order.id?.toLowerCase().includes(term) ||
                      (order.invoiceNumber && order.invoiceNumber.toLowerCase().includes(term)) ||
                      order.customerAddress.toLowerCase().includes(term)
                    );
                  })
                  .map((order) => (
                  <div key={order.id} className="border border-slate-100 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 p-4 flex flex-wrap justify-between items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shadow-sm">
                          <ShoppingBag className="h-5 w-5 text-green-600" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">
                            ઓર્ડર {order.invoiceNumber ? `#${order.invoiceNumber}` : `#${order.id?.slice(-6).toUpperCase()}`}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {new Date(order.createdAt).toLocaleString('gu-IN')}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => setSelectedOrder(order)}
                          className="p-2 bg-white text-green-600 rounded-lg hover:bg-green-50 transition-all shadow-sm border border-green-100 flex items-center gap-1 text-xs font-bold"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          વિગતો
                        </button>
                        <div className="h-4 w-[1px] bg-slate-200" />
                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            order.paymentMethod === 'ONLINE' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {order.paymentMethod === 'ONLINE' ? 'ઓનલાઇન (UPI)' : 'રોકડ (COD)'}
                          </span>
                          <select
                            value={order.paymentStatus}
                            onChange={(e) => handleUpdatePaymentStatus(order.id!, e.target.value as any)}
                            className={`text-[10px] font-bold border rounded-lg p-1 outline-none focus:ring-2 focus:ring-green-500 ${
                              order.paymentStatus === 'Completed' ? 'bg-green-50 border-green-200 text-green-700' :
                              order.paymentStatus === 'Failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <option value="Pending">પેમેન્ટ બાકી</option>
                            <option value="Completed">પેમેન્ટ થઈ ગયું</option>
                            <option value="Failed">પેમેન્ટ નિષ્ફળ</option>
                          </select>
                        </div>

                        <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

                        <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                            order.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                            order.status === 'Shipped' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {order.status === 'Pending' ? 'ઓર્ડર બાકી' :
                             order.status === 'Shipped' ? 'મોકલેલ' :
                             order.status === 'Delivered' ? 'પહોંચાડેલ' : 'રદ કરેલ'}
                          </span>
                          
                          <div className="flex items-center gap-2">
                            <select
                              value={order.status}
                              onChange={(e) => handleUpdateOrderStatus(order.id!, e.target.value as any, cancelReasons[order.id!] || order.cancelReason)}
                              className="text-[10px] font-bold border border-slate-200 rounded-lg p-1 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                            >
                              <option value="Pending">Pending</option>
                              <option value="Shipped">Shipped</option>
                              <option value="Delivered">Delivered</option>
                              <option value="Cancelled">Cancelled</option>
                            </select>
                            {order.status === 'Cancelled' && (
                              <input
                                type="text"
                                placeholder="રદ કરવાનું કારણ..."
                                value={cancelReasons[order.id!] !== undefined ? cancelReasons[order.id!] : (order.cancelReason || '')}
                                onChange={(e) => setCancelReasons(prev => ({ ...prev, [order.id!]: e.target.value }))}
                                onBlur={() => handleUpdateOrderStatus(order.id!, 'Cancelled', cancelReasons[order.id!])}
                                className="text-[10px] border border-slate-200 rounded-lg p-1 outline-none focus:ring-2 focus:ring-red-500 bg-white w-32"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 grid md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="text-sm font-bold text-slate-600 mb-2 flex items-center gap-2">
                          <User className="h-4 w-4" />
                          ગ્રાહક વિગતો
                        </h3>
                        <div className="text-sm text-slate-700 space-y-1">
                          <p className="font-bold">{order.customerName}</p>
                          <p>{order.customerPhone}</p>
                          <p className="text-slate-500">{order.customerAddress}</p>
                        </div>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-bold text-slate-600 mb-2">ઓર્ડર આઈટમ્સ</h3>
                        <div className="space-y-2">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <div className="flex flex-col">
                                <span className="text-slate-700 font-medium">{item.name} {item.quantity}x{item.unit}</span>
                                {item.englishName && <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.englishName}</span>}
                              </div>
                              <span className="font-bold text-slate-800">{formatINR(item.price * item.quantity)}</span>
                            </div>
                          ))}
                          <div className="border-t border-slate-100 pt-2 mt-2 flex justify-between font-bold text-slate-900">
                            <span>કુલ રકમ</span>
                            <span>{formatINR(order.totalAmount)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success/Error Toasts */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 pointer-events-none">
        {error && (
          <div className="bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 pointer-events-auto">
            <AlertCircle className="h-5 w-5" />
            <span className="font-bold">{error}</span>
          </div>
        )}
        {success && (
          <div className="bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-top duration-300 pointer-events-auto">
            <CheckCircle className="h-5 w-5" />
            <span className="font-bold">{success}</span>
          </div>
        )}
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-green-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2.5 rounded-xl">
                  <ShoppingBag className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">ઓર્ડર વિગતો</h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">#{selectedOrder.id?.slice(-8).toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handlePrintInvoice(selectedOrder)}
                  className="p-2.5 bg-white text-slate-600 rounded-xl hover:bg-slate-50 transition-all shadow-sm border border-slate-200 flex items-center gap-2 text-xs font-bold"
                >
                  <Printer className="h-4 w-4" />
                  પ્રિન્ટ
                </button>
                <button
                  onClick={() => handleDownloadPDF(selectedOrder)}
                  className="p-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-all shadow-md flex items-center gap-2 text-xs font-bold"
                >
                  <Download className="h-4 w-4" />
                  PDF ડાઉનલોડ
                </button>
                <button 
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-white rounded-full transition-all text-slate-400 hover:text-slate-600 shadow-sm"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              {/* Order Status & Payment */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">ઇનવોઇસ નંબર</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={selectedOrder.invoiceNumber || ''}
                      onChange={(e) => handleUpdateInvoiceNumber(selectedOrder.id!, e.target.value)}
                      placeholder="e.g. 001"
                      className="text-xs font-bold border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-green-500 bg-white w-full"
                    />
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">ઓર્ડર સ્ટેટસ</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                        selectedOrder.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        selectedOrder.status === 'Shipped' ? 'bg-blue-100 text-blue-700' :
                        selectedOrder.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {selectedOrder.status === 'Pending' ? 'ઓર્ડર બાકી' :
                         selectedOrder.status === 'Shipped' ? 'મોકલેલ' :
                         selectedOrder.status === 'Delivered' ? 'પહોંચાડેલ' : 'રદ કરેલ'}
                      </span>
                      <select
                        value={selectedOrder.status}
                        onChange={(e) => handleUpdateOrderStatus(selectedOrder.id!, e.target.value as any, cancelReasons[selectedOrder.id!] || selectedOrder.cancelReason)}
                        className="text-xs font-bold border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Shipped">Shipped</option>
                        <option value="Delivered">Delivered</option>
                        <option value="Cancelled">Cancelled</option>
                      </select>
                    </div>
                    {selectedOrder.status === 'Cancelled' && (
                      <input
                        type="text"
                        placeholder="રદ કરવાનું કારણ..."
                        value={cancelReasons[selectedOrder.id!] !== undefined ? cancelReasons[selectedOrder.id!] : (selectedOrder.cancelReason || '')}
                        onChange={(e) => setCancelReasons(prev => ({ ...prev, [selectedOrder.id!]: e.target.value }))}
                        onBlur={() => handleUpdateOrderStatus(selectedOrder.id!, 'Cancelled', cancelReasons[selectedOrder.id!])}
                        className="text-xs border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-red-500 bg-white w-full mt-1"
                      />
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">પેમેન્ટ સ્ટેટસ</p>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${
                      selectedOrder.paymentMethod === 'ONLINE' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {selectedOrder.paymentMethod === 'ONLINE' ? 'UPI' : 'COD'}
                    </span>
                    <select
                      value={selectedOrder.paymentStatus}
                      onChange={(e) => handleUpdatePaymentStatus(selectedOrder.id!, e.target.value as any)}
                      className={`text-xs font-bold border rounded-lg p-1.5 outline-none focus:ring-2 focus:ring-green-500 ${
                        selectedOrder.paymentStatus === 'Completed' ? 'bg-green-50 border-green-200 text-green-700' :
                        selectedOrder.paymentStatus === 'Failed' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <option value="Pending">બાકી</option>
                      <option value="Completed">સફળ</option>
                      <option value="Failed">નિષ્ફળ</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Customer Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <User className="h-4 w-4 text-green-600" />
                  ગ્રાહક વિગતો
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 rounded-2xl border border-slate-100 bg-white shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">નામ</p>
                      <p className="font-bold text-slate-800">{selectedOrder.customerName}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">મોબાઈલ નંબર</p>
                      <p className="font-bold text-slate-800 flex items-center gap-2">
                        {selectedOrder.customerPhone}
                        <a 
                          href={`https://wa.me/${selectedOrder.customerPhone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 bg-green-100 text-green-600 rounded-md hover:bg-green-200 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">સરનામું</p>
                      <p className="text-sm text-slate-600 leading-relaxed font-medium">{selectedOrder.customerAddress}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ઓર્ડર સમય</p>
                      <p className="text-sm text-slate-600 font-medium">{new Date(selectedOrder.createdAt).toLocaleString('gu-IN')}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="space-y-4">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Package className="h-4 w-4 text-green-600" />
                  ઓર્ડર આઈટમ્સ
                </h4>
                <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-3 font-bold text-slate-500 text-xs uppercase">શાકભાજી</th>
                        <th className="px-5 py-3 font-bold text-slate-500 text-xs uppercase text-center">વજન/નંગ</th>
                        <th className="px-5 py-3 font-bold text-slate-500 text-xs uppercase text-right">કિંમત</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {selectedOrder.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="font-bold text-slate-800">{item.name}</div>
                            {item.englishName && <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.englishName}</div>}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="bg-slate-100 px-2 py-1 rounded-lg font-bold text-slate-600 text-xs">
                              {item.quantity}x{item.unit}
                            </span>
                          </td>
                          <td className="px-5 py-4 text-right font-black text-slate-800">
                            {formatINR(item.price * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-green-50/30 font-bold text-slate-600">
                      <tr className="border-t border-slate-100">
                        <td colSpan={2} className="px-5 py-2 text-xs">કુલ સામાન (Subtotal)</td>
                        <td className="px-5 py-2 text-right text-sm">
                          {formatINR(selectedOrder.subtotal || selectedOrder.totalAmount)}
                        </td>
                      </tr>
                      {selectedOrder.deliveryCharge > 0 && (
                        <tr>
                          <td colSpan={2} className="px-5 py-2 text-xs">ડિલિવરી ચાર્જ</td>
                          <td className="px-5 py-2 text-right text-sm text-orange-600">
                            +{formatINR(selectedOrder.deliveryCharge)}
                          </td>
                        </tr>
                      )}
                      {selectedOrder.discountAmount > 0 && (
                        <tr>
                          <td colSpan={2} className="px-5 py-2 text-xs">ડિસ્કાઉન્ટ {selectedOrder.promoCode ? `(${selectedOrder.promoCode})` : ''}</td>
                          <td className="px-5 py-2 text-right text-sm text-green-600">
                            -{formatINR(selectedOrder.discountAmount)}
                          </td>
                        </tr>
                      )}
                      <tr className="text-slate-900 font-black">
                        <td colSpan={2} className="px-5 py-4 text-base">કુલ રકમ (Total)</td>
                        <td className="px-5 py-4 text-right text-green-700 text-xl">
                          {formatINR(selectedOrder.totalAmount)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-8 py-3 bg-white border border-slate-200 rounded-2xl font-black text-slate-600 hover:bg-slate-100 transition-all shadow-sm"
              >
                બંધ કરો
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-red-50 w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 text-center mb-2">શાકભાજી કાઢી નાખવું છે?</h3>
            <p className="text-slate-500 text-center text-sm mb-6">
              શું તમે ખરેખર આ શાકભાજીને લિસ્ટમાંથી કાઢી નાખવા માંગો છો? આ પ્રક્રિયા પાછી ખેંચી શકાશે નહીં.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-all"
              >
                કેન્સલ
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={loading}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                હા, કાઢી નાખો
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
