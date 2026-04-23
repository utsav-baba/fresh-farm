import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Order, UserProfile } from '../types';
import { formatINR } from '../lib/utils';
import { Package, Clock, CheckCircle, XCircle, ChevronRight, ShoppingBag, Loader2, Search } from 'lucide-react';
import { motion } from 'motion/react';

export function MyOrders({ profile, language, t }: { profile: UserProfile | null, language: string, t: any }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!profile) return;

    setLoading(true);
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef, 
      where('user_id', '==', profile.uid), 
      orderBy('created_at', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => {
        const o = doc.data();
        return {
          id: doc.id,
          userId: o.user_id,
          customerName: o.customer_name,
          customerPhone: o.customer_phone,
          customerAddress: o.customer_address,
          items: o.items,
          totalAmount: o.total_amount,
          subtotal: o.subtotal || o.total_amount,
          deliveryCharge: o.delivery_charge || 0,
          discountAmount: o.discount_amount || 0,
          promoCode: o.promo_code,
          deliverySlot: o.delivery_slot,
          status: o.status,
          paymentMethod: o.payment_method,
          paymentStatus: o.payment_status,
          createdAt: o.created_at?.toDate?.()?.toISOString() || o.created_at,
          updatedAt: o.updated_at?.toDate?.()?.toISOString() || o.updated_at
        } as Order;
      });
      setOrders(ordersData);
      setLoading(false);
    }, (err) => {
      console.error('Error listening to orders:', err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Delivered': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'Cancelled': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'Shipped': return <Package className="h-5 w-5 text-blue-500" />;
      default: return <Clock className="h-5 w-5 text-amber-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Delivered': return 'bg-green-50 text-green-700 border-green-100';
      case 'Cancelled': return 'bg-red-50 text-red-700 border-red-100';
      case 'Shipped': return 'bg-blue-50 text-blue-700 border-blue-100';
      default: return 'bg-amber-50 text-amber-700 border-amber-100';
    }
  };

  const filteredOrders = orders.filter(order => 
    order.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.items.some(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!profile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-slate-100 shadow-xl">
        <ShoppingBag className="h-16 w-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-800 mb-2">{t.loginToSeeOrders}</h2>
        <p className="text-slate-500 mb-6">{t.loginToSeeOrdersSub}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-32">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-farm-g1 flex items-center gap-3 tracking-tight">
            <div className="w-9 h-9 bg-farm-g2/5 rounded-xl flex items-center justify-center border border-farm-g2/10">
              <ShoppingBag className="h-5 w-5 text-farm-g2" />
            </div>
            {t.myOrders}
          </h1>
          <p className="text-farm-muted text-[10px] font-bold uppercase tracking-widest mt-1 opacity-60 gu">{t.myOrdersSub}</p>
        </div>

        <div className="relative w-full sm:w-72 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-farm-muted group-focus-within:text-farm-g2 transition-colors" />
          <input
            type="text"
            placeholder={t.searchOrderPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white border-2 border-farm-border rounded-[20px] text-sm outline-none focus:border-farm-g2 transition-all font-bold text-farm-g1 placeholder:text-farm-muted placeholder:font-normal gu"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
           <div className="relative">
              <div className="w-16 h-16 border-4 border-farm-border border-t-farm-g2 rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                 <ShoppingBag className="h-6 w-6 text-farm-g2/30" />
              </div>
           </div>
          <p className="text-farm-g2 font-black uppercase tracking-[0.2em] text-xs">{t.loadingOrders}</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-farm-cream rounded-[40px] border border-farm-border p-16 text-center shadow-inner relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-farm-g4 opacity-5 rounded-full blur-3xl" />
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-8 shadow-farm-card border border-farm-border relative">
            <ShoppingBag className="h-10 w-10 text-farm-muted/30" />
            <span className="absolute -top-1 -right-1 text-3xl animate-bounce">🥬</span>
          </div>
          <h3 className="text-xl font-bold text-farm-g1 mb-2">{t.noOrdersFound}</h3>
          <p className="text-farm-muted text-sm font-bold gu opacity-60 max-w-xs mx-auto mb-10">{t.noOrdersFoundSub}</p>
          <button 
            onClick={() => window.location.hash = '/'}
            className="bg-farm-g1 text-farm-s2 px-10 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all"
          >
            {t.startShopping}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredOrders.map((order) => (
            <motion.div 
              key={order.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[32px] border border-farm-border shadow-farm-card overflow-hidden hover:border-farm-g4 transition-all group"
            >
              <div className="p-6 sm:p-8">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="bg-farm-cream p-2.5 rounded-xl border border-farm-border">
                      <ShoppingBag className="h-5 w-5 text-farm-g2" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-farm-muted uppercase tracking-widest leading-none">{t.orderId}</span>
                        <span className="text-xs font-mono font-bold text-farm-g1">#{order.id?.slice(0, 8)}</span>
                      </div>
                      <div className="text-[9px] text-farm-muted font-bold tracking-tight uppercase mt-1">
                        {new Date(order.createdAt).toLocaleDateString(language === 'gu' ? 'gu-IN' : language === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg border-2 text-[9px] font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm ${getStatusColor(order.status)}`}>
                    {getStatusIcon(order.status)}
                    {order.status === 'Pending' ? t.pending : order.status === 'Shipped' ? t.shipped : order.status === 'Delivered' ? t.delivered : t.cancelled}
                  </div>
                </div>

                <div className="bg-slate-50/50 rounded-2xl border border-farm-border/50 p-4 space-y-3">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-white border border-farm-border rounded-lg flex items-center justify-center text-farm-g1 font-bold text-[10px]">
                          {idx + 1}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-farm-g1 gu">{item.name}</p>
                          <p className="text-[9px] text-farm-muted font-bold uppercase tracking-widest">{item.quantity} × {item.unit}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-farm-g1">{formatINR(item.price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 pt-5 border-t border-dashed border-farm-border flex flex-col gap-3">
                  <div className="flex flex-col gap-1.5 text-right w-full">
                    <div className="flex justify-between text-[11px] font-bold text-farm-muted gu">
                      <span>કુલ રકમ (Subtotal)</span>
                      <span>{formatINR(order.subtotal || order.totalAmount - (order.deliveryCharge || 0))}</span>
                    </div>
                    {order.deliveryCharge > 0 && (
                      <div className="flex justify-between text-[11px] font-bold text-slate-500 gu">
                        <span>ડિલિવરી ચાર્જ (Delivery Charge)</span>
                        <span>+ {formatINR(order.deliveryCharge)}</span>
                      </div>
                    )}
                    {order.discountAmount > 0 && (
                      <div className="flex justify-between text-[11px] font-bold text-green-600 gu">
                        <span>પ્રોમો કોડ ડિસ્કાઉન્ટ (Discount)</span>
                        <span>- {formatINR(order.discountAmount)}</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="border-t border-farm-border/50 pt-3 flex flex-wrap justify-between items-end gap-4">
                    <div className="flex flex-col gap-2">
                      {order.deliverySlot && (
                        <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-farm-muted">
                          <Clock className="h-3.5 w-3.5" />
                          <span className="gu">{order.deliverySlot}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[9px] font-bold uppercase tracking-widest text-farm-muted">
                          <CheckCircle className="h-3.5 w-3.5" />
                          <span className="gu">{order.paymentMethod === 'COD' ? t.cod : t.online}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-bold text-farm-muted uppercase tracking-widest mb-1">{t.total}</p>
                      <p className="text-xl font-extrabold text-farm-g1 tracking-tight">{formatINR(order.totalAmount)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
