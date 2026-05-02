import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Vegetable, AppSettings, UserProfile } from '../types';
import { formatINR, getUnitMultiplier } from '../lib/utils';
import { ShoppingCart, Truck, Search, ShoppingBasket, ShieldCheck, ShoppingBag, Plus, Minus, Store, Clock, ImageIcon, Cookie, Star, Users, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

export function Home({ 
  profile, 
  settings: externalSettings,
  vegetables: externalVegetables,
  loading: externalLoading,
  language,
  t
}: { 
  profile: UserProfile | null, 
  settings: AppSettings | null,
  vegetables?: Vegetable[],
  loading?: boolean,
  language: string,
  t: any
}) {
  const { cart, addToCart, updateQuantity } = useCart();
  const { showToast } = useToast();
  const [vegetables, setVegetables] = useState<Vegetable[]>(externalVegetables || []);

  const getVegWeightInCart = (vegId: string) => {
    return cart
      .filter(item => item.id === vegId)
      .reduce((sum, item) => sum + (item.quantity * getUnitMultiplier(item.selectedUnit)), 0);
  };
  const [internalSettings, setInternalSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(externalLoading !== undefined ? externalLoading : true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'vegetable' | 'grocery' | 'namkeen'>('all');
  const [selectedVegForDetail, setSelectedVegForDetail] = useState<Vegetable | null>(null);

  const openDetail = (veg: Vegetable) => {
    setSelectedVegForDetail(veg);
  };

  const settings = externalSettings || internalSettings;

  useEffect(() => {
    if (externalVegetables) {
      setVegetables(externalVegetables);
    }
    if (externalLoading !== undefined) {
      setLoading(externalLoading);
    }
  }, [externalVegetables, externalLoading]);

  useEffect(() => {
    // Only fetch if not provided by parent
    if (externalVegetables && externalSettings) return;

    const fetchVegetables = async () => {
      if (externalVegetables) return;
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
            pricingOptions: (v.pricing_options || v.pricingOptions || []).map((opt: any) => ({
              unit: opt.unit,
              price: opt.price,
              discountPrice: opt.discountPrice || opt.discount_price,
              costPrice: opt.costPrice || opt.cost_price,
              stock: opt.stock
            })),
            totalStock: (v as any).total_stock ?? (v as any).totalStock ?? (( (v.pricing_options || v.pricingOptions || []).length > 0) ? ((v.pricing_options || v.pricingOptions)[0].stock || 0) : 0),
            inStock: v.in_stock ?? v.inStock ?? true,
            createdAt: v.created_at || v.createdAt,
            updatedAt: v.updated_at || v.updatedAt
          } as Vegetable)));
        }
      } catch (err) {
        console.error('Error fetching vegetables in Home:', err);
      } finally {
        setLoading(false);
      }
    };

    const fetchSettings = async () => {
      if (externalSettings) return;
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
            showHomepageDeal: data.show_homepage_deal ?? data.showHomepageDeal ?? true,
            homepageDealTitle: data.homepage_deal_title || data.homepageDealTitle || '',
            homepageDealSub: data.homepage_deal_sub || data.homepageDealSub || '',
            homepageDealCode: data.homepage_deal_code || data.homepageDealCode || '',
            updatedAt: data.updated_at || data.updatedAt
          } as AppSettings);
        }
      } catch (err) {
        console.error('Error fetching settings in Home:', err);
      }
    };

    fetchVegetables();
    fetchSettings();

    // Realtime subscriptions via Firestore
    let unsubVeg: () => void = () => {};
    if (!externalVegetables) {
      unsubVeg = onSnapshot(collection(db, 'vegetables'), () => {
        fetchVegetables();
      });
    }

    return () => {
      unsubVeg();
    };
  }, [externalSettings, externalVegetables]);

  const filteredVegetables = vegetables
    .filter(v => {
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = v.name.toLowerCase().includes(term) ||
                           v.englishName?.toLowerCase().includes(term) ||
                           v.description?.toLowerCase().includes(term);
      const matchesCategory = selectedCategory === 'all' || v.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (a.inStock === b.inStock) return 0;
      return a.inStock ? -1 : 1;
    });

  if (settings && settings.isShopOpen === false && profile?.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white rounded-3xl border border-red-100 shadow-xl animate-in fade-in zoom-in duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-red-100 rounded-full blur-2xl opacity-50 animate-pulse" />
          <div className="relative bg-red-50 p-8 rounded-full border-4 border-white shadow-lg">
            <Store className="h-20 w-20 text-red-600" />
            <Clock className="absolute -bottom-2 -right-2 h-10 w-10 text-orange-500 bg-white rounded-full p-2 shadow-md border border-orange-100" />
          </div>
        </div>
        
        <h2 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">
          {t.shopClosed}
        </h2>
        <p className="text-slate-500 max-w-md mx-auto mb-8 leading-relaxed font-medium">
          {t.shopClosedSub}
        </p>
        
        <div className="flex items-center gap-3 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100">
          <ShoppingBasket className="h-6 w-6 text-green-600" />
          <span className="text-xl font-bold text-green-800 tracking-tight">Fresh Farm</span>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-pulse text-green-600 font-medium">{t.loadingVeg}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 px-1 sm:px-0">
      {/* Hero Section */}
      <div className="bg-gradient-to-br from-farm-g1 via-farm-g2 to-farm-g1 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl min-h-[220px] flex items-center">
        <div className="absolute top-[-40px] right-[-40px] w-64 h-64 bg-farm-s2 opacity-10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-[-30px] left-[-20px] w-32 h-32 bg-farm-g4 opacity-10 rounded-full blur-2xl" />
        <div className="absolute top-6 right-6 text-6xl opacity-20 rotate-12 animate-float pointer-events-none">🥦</div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-farm-s1 border border-farm-s2/20 px-3 py-1 rounded-full text-[9px] font-bold tracking-[0.2em] text-farm-g1 mb-4 uppercase animate-in fade-in slide-in-from-left duration-700 shadow-sm">
             <Star className="h-2.5 w-2.5 fill-current" />
             {t.gujaratFinest}
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-[1.1] tracking-tight animate-in fade-in slide-in-from-bottom duration-700 delay-100">
            {language === 'gu' ? 'તાજા' : language === 'hi' ? 'ताजी' : 'Fresh'} <span className="text-farm-s2"> {language === 'gu' ? 'શાકભાજી' : language === 'hi' ? 'सब्जियां' : 'Vegetables'}</span><br />
            <span className="text-2xl sm:text-3xl font-bold opacity-90 tracking-tight">{language === 'gu' ? 'સીધા તમારા ઘરે!' : language === 'hi' ? 'सीधे आपके घर!' : 'Directly to you!'}</span>
          </h1>
          
          <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom duration-700 delay-200">
            {settings && (
              <>
                <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl text-[10px] font-black border border-white/20 whitespace-nowrap">
                  <Truck className="h-3 w-3 text-farm-s2" />
                  {t.marqueeFreeTill.replace('{{distance}}', (settings.freeDeliveryDistance || 0).toString())}
                </div>
                {settings.freeDeliveryThreshold > 0 && (
                  <div className="inline-flex items-center gap-1.5 bg-farm-s1 text-farm-g1 px-4 py-2 rounded-xl text-[10px] font-black shadow-lg animate-bounce border-2 border-farm-s2/50">
                    <ShoppingBag className="h-3 w-3" />
                    {t.marqueeFreeAbove.replace('{{threshold}}', formatINR(settings.freeDeliveryThreshold))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="flex gap-2 sm:gap-4 overflow-x-auto no-scrollbar pb-1">
        <div className="flex-1 min-w-[90px] bg-white p-3 rounded-xl border border-farm-border shadow-sm text-center">
          <div className="text-lg font-bold text-farm-g1 leading-none mb-1">500+</div>
          <div className="text-[8px] font-bold text-farm-muted uppercase tracking-widest leading-none">{t.statFarmers}</div>
        </div>
        <div className="flex-1 min-w-[90px] bg-white p-3 rounded-xl border border-farm-border shadow-sm text-center">
          <div className="text-lg font-bold text-farm-g1 leading-none mb-1">4.9★</div>
          <div className="text-[8px] font-bold text-farm-muted uppercase tracking-widest leading-none">{t.statRating}</div>
        </div>
        <div className="flex-1 min-w-[90px] bg-white p-3 rounded-xl border border-farm-border shadow-sm text-center">
          <div className="text-lg font-bold text-farm-g1 leading-none mb-1">2K+</div>
          <div className="text-[8px] font-bold text-farm-muted uppercase tracking-widest leading-none">{t.statOrders}</div>
        </div>
        <div className="flex-1 min-w-[90px] bg-white p-3 rounded-xl border border-farm-border shadow-sm text-center">
          <div className="text-lg font-bold text-farm-g1 leading-none mb-1">1hr</div>
          <div className="text-[8px] font-bold text-farm-muted uppercase tracking-widest leading-none">{t.statDelivery}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-lg mx-auto w-full px-2 sm:px-0">
        <div className="bg-white flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-farm-border shadow-sm group focus-within:border-farm-g3 transition-all">
          <Search className="h-4 w-4 text-farm-muted group-focus-within:text-farm-g1" />
          <input
            type="text"
            placeholder={t.search}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-transparent outline-none text-sm font-medium text-farm-g1 placeholder:text-farm-muted/40 gu"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar px-2 sm:px-0 scroll-smooth">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-6 py-2.5 rounded-full text-xs font-black transition-all whitespace-nowrap gu border-2 ${
            selectedCategory === 'all' 
              ? 'bg-farm-g1 text-farm-s2 border-farm-g1 shadow-lg' 
              : 'bg-white text-farm-g2 border-farm-border hover:border-farm-g4'
          }`}
        >
          🛒 {t.all}
        </button>
        <button
          onClick={() => setSelectedCategory('vegetable')}
          className={`px-6 py-2.5 rounded-full text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 gu border-2 ${
            selectedCategory === 'vegetable' 
              ? 'bg-farm-g1 text-farm-s2 border-farm-g1 shadow-lg' 
              : 'bg-white text-farm-g2 border-farm-border hover:border-farm-g4'
          }`}
        >
          🥦 {t.vegetable}
        </button>
        <button
          onClick={() => setSelectedCategory('grocery')}
          className={`px-6 py-2.5 rounded-full text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 gu border-2 ${
            selectedCategory === 'grocery' 
              ? 'bg-farm-g1 text-farm-s2 border-farm-g1 shadow-lg' 
              : 'bg-white text-farm-g2 border-farm-border hover:border-farm-g4'
          }`}
        >
          📦 {t.grocery}
        </button>
        <button
          onClick={() => setSelectedCategory('namkeen')}
          className={`px-6 py-2.5 rounded-full text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 gu border-2 ${
            selectedCategory === 'namkeen' 
              ? 'bg-farm-g1 text-farm-s2 border-farm-g1 shadow-lg' 
              : 'bg-white text-farm-g2 border-farm-border hover:border-farm-g4'
          }`}
        >
          🍪 {t.namkeen}
        </button>
      </div>

      {/* Promo Card */}
      {settings?.showHomepageDeal !== false && (settings?.homepageDealCode || settings?.homepageDealTitle) && (
        <div className="px-2 sm:px-0">
          <div className="bg-gradient-to-tr from-farm-g1 to-farm-g2 rounded-[24px] p-6 text-white relative overflow-hidden group cursor-pointer border border-white/5">
            <div className="absolute right-[-10px] top-[-10px] text-7xl opacity-10 group-hover:rotate-12 transition-transform duration-500">🎊</div>
            <div className="relative z-10">
                <h3 className="text-lg font-black font-syne gu mb-1">
                  {settings.homepageDealTitle || (language === 'gu' ? 'પ્રથમ ઓર્ડર? 20% ઓફ!' : 'First Order? 20% OFF!')}
                </h3>
                <p className="text-xs text-white/60 mb-4 gu">
                  {settings.homepageDealSub || (language === 'gu' ? 'પ્રોમો કોડ વાપરો અને બચત કરો' : 'Use promo code and save big')}
                </p>
                {settings.homepageDealCode && (
                  <div className="inline-block bg-farm-s2/20 border-2 border-dashed border-farm-s2 text-farm-s2 px-5 py-2 rounded-xl text-lg font-black tracking-[0.2em] font-syne">
                    {settings.homepageDealCode}
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Vegetable Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-2 sm:px-0">
        <AnimatePresence mode="popLayout">
          {filteredVegetables.map((veg) => (
            <motion.div 
              layout
              key={veg.id} 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-[24px] border border-farm-border overflow-hidden shadow-farm-card hover:shadow-xl transition-all group flex flex-col relative"
            >
              <div className="p-3">
                <div className="bg-gradient-to-br from-farm-cream to-[#dff0e1] h-32 sm:h-40 rounded-[18px] flex items-center justify-center text-6xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-radial-at-tr from-white/50 to-transparent" />
                  {veg.imageUrl && veg.imageUrl.trim() !== '' ? (
                    <img
                      src={veg.imageUrl}
                      alt={veg.name}
                      loading="lazy"
                      className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${!veg.inStock ? 'grayscale opacity-60' : ''}`}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className={`transition-transform duration-500 group-hover:scale-125 ${!veg.inStock ? 'opacity-30' : ''}`}>
                      {veg.category === 'vegetable' ? '🥦' : veg.category === 'namkeen' ? '🍪' : '📦'}
                    </span>
                  )}
                  {veg.inStock && veg.totalStock && veg.totalStock <= 5 && (
                    <div className="absolute top-2 left-2 bg-farm-s1 text-farm-g1 text-[9px] font-black px-2 py-1 rounded-full border border-farm-s2 shadow-sm animate-pulse uppercase tracking-wider">
                      LOW STOCK
                    </div>
                  )}
                  {!veg.inStock && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                      <span className="bg-white/95 backdrop-blur-sm text-red-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg border border-red-100 gu">
                        {t.outOfStock}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 pt-0 flex-1 flex flex-col">
                <div className="mb-3">
                  <h3 className={`text-sm font-black leading-tight ${language === 'gu' ? 'gu' : ''} ${(!veg.inStock || (veg.totalStock || 0) <= 0) ? 'text-slate-400' : 'text-farm-g1'}`}>
                    {language === 'gu' ? (veg.name_gu || veg.name) : language === 'hi' ? (veg.name_hi || veg.name) : (veg.name_en || veg.englishName || veg.name)}
                  </h3>
                  {veg.englishName && <p className="text-[9px] text-farm-muted font-bold uppercase tracking-[0.1em]">{veg.englishName}</p>}
                </div>
                
                <div className="space-y-3 mt-auto">
                  {veg.pricingOptions ? (
                    veg.pricingOptions.filter(opt => opt.price > 0).map(option => {
                      const multiplier = getUnitMultiplier(option.unit);
                      const isOutOfStock = (veg.totalStock || 0) < multiplier;
                      const cartItem = cart.find(item => item.id === veg.id && item.selectedUnit === option.unit);
                      
                      const hasDiscount = option.discountPrice && option.discountPrice > 0 && option.discountPrice < option.price;
                      
                      return (
                        <div key={option.unit} className="flex items-center justify-between py-2 border-t first:border-t-0 border-farm-border/50">
                          <div className="flex flex-col">
                            {hasDiscount ? (
                              <div className="flex flex-col">
                                <span className="text-[14px] font-black text-farm-g1 font-syne">
                                  {formatINR(option.discountPrice!)} <span className="text-[10px] text-farm-muted">/{option.unit}</span>
                                </span>
                                <span className="text-[10px] text-red-400 line-through font-bold">
                                  {formatINR(option.price)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[14px] font-black text-farm-g1 font-syne">
                                {formatINR(option.price)} <span className="text-[10px] text-farm-muted">/{option.unit}</span>
                              </span>
                            )}
                          </div>
                          
                          {veg.inStock && !isOutOfStock && (
                            <div className="flex items-center gap-1">
                              {cartItem ? (
                                <div className="flex items-center gap-2 bg-farm-g1 p-1 rounded-full shadow-lg scale-90 origin-right">
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); updateQuantity(veg.id!, option.unit, -1); }}
                                    className="w-6 h-6 flex items-center justify-center text-white hover:text-farm-s2 transition-colors bg-white/10 rounded-full"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="text-[10px] font-black text-farm-s2 min-w-[1rem] text-center font-syne">
                                    {cartItem.quantity}
                                  </span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const totalRequestedWeight = getVegWeightInCart(veg.id!) + multiplier;
                                      if (totalRequestedWeight > (veg.totalStock || 0)) {
                                        showToast(t.stockError.replace('{{name}}', veg.name), 'error');
                                        return;
                                      }
                                      updateQuantity(veg.id!, option.unit, 1);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center text-white hover:text-farm-s2 transition-colors bg-white/10 rounded-full"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const totalRequestedWeight = getVegWeightInCart(veg.id!) + multiplier;
                                    if (totalRequestedWeight > (veg.totalStock || 0)) {
                                      showToast(t.stockError.replace('{{name}}', veg.name), 'error');
                                      return;
                                    }
                                    addToCart(veg, option);
                                  }}
                                  className="w-8 h-8 bg-farm-g1 text-farm-s2 hover:bg-farm-g2 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-90 border border-farm-g3/30"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {filteredVegetables.length === 0 && (
        <div className="text-center py-20 bg-white/50 rounded-3xl border-2 border-dashed border-farm-border mx-2">
          <p className="text-farm-muted font-bold gu">{language === 'gu' ? 'કોઈ શાકભાજી મળ્યા નથી.' : 'No vegetables found.'}</p>
        </div>
      )}

      {selectedVegForDetail && (
        <ProductDetailModal 
          veg={selectedVegForDetail} 
          onClose={() => setSelectedVegForDetail(null)} 
          addToCart={addToCart}
          updateQuantity={updateQuantity}
          cart={cart}
          getVegWeightInCart={getVegWeightInCart}
          t={t}
          language={language}
        />
      )}
    </div>
  );
}

function ProductDetailModal({ veg, onClose, addToCart, updateQuantity, cart, getVegWeightInCart, t, language }: any) {
  const { showToast } = useToast();
  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-farm-g1/40 backdrop-blur-[5px] animate-in fade-in duration-300">
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        className="bg-white w-full max-w-xl rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 z-10 bg-white/80 p-2 rounded-full shadow-lg backdrop-blur-md">
          <Minus className="h-5 w-5 text-farm-g1 rotate-45" />
        </button>

        <div className="relative h-64 sm:h-80 bg-gradient-to-br from-farm-cream to-[#dff0e1] flex items-center justify-center text-8xl">
           {veg.imageUrl ? (
              <img src={veg.imageUrl} className="w-full h-full object-cover" alt={veg.name} />
           ) : (
              <span>{veg.category === 'vegetable' ? '🥦' : '📦'}</span>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-white via-white/10 to-transparent" />
        </div>

        <div className="p-8 space-y-6">
           <div>
              <div className="flex gap-2 mb-3">
                 <span className="bg-farm-g1/5 text-farm-g1 text-[10px] font-black px-3 py-1 rounded-full border border-farm-border">🌱 ORGANIC</span>
                 <span className="bg-farm-g1/5 text-farm-g1 text-[10px] font-black px-3 py-1 rounded-full border border-farm-border">✨ FARM FRESH</span>
              </div>
              <h2 className={`text-3xl font-black text-farm-g1 font-syne mb-1 italic ${language === 'gu' ? 'gu' : ''}`}>
                {language === 'gu' ? (veg.name_gu || veg.name) : language === 'hi' ? (veg.name_hi || veg.name) : (veg.name_en || veg.englishName || veg.name)}
              </h2>
              <p className={`text-farm-muted font-bold text-lg mb-4 ${language === 'gu' ? 'gu' : ''}`}>
                {language === 'gu' ? (veg.description_gu || veg.description) : language === 'hi' ? (veg.description_hi || veg.description) : (veg.description_en || veg.description)}
              </p>
           </div>

           <div className="space-y-4">
              <h4 className="text-[10px] font-black text-farm-muted tracking-[0.2em] uppercase">Pricing Options</h4>
              <div className="grid gap-3">
                {veg.pricingOptions.map((opt: any) => {
                  const multiplier = getUnitMultiplier(opt.unit);
                  const isOutOfStock = (veg.totalStock || 0) < multiplier;
                  const cartItem = cart.find((item: any) => item.id === veg.id && item.selectedUnit === opt.unit);

                  return (
                    <div key={opt.unit} className="flex items-center justify-between p-4 bg-farm-cream rounded-2xl border border-farm-border">
                       <div>
                          <p className="text-[10px] font-black text-farm-muted uppercase tracking-wider mb-1">{opt.unit}</p>
                          {opt.discountPrice && opt.discountPrice > 0 && opt.discountPrice < opt.price ? (
                            <div className="flex flex-col">
                              <p className="text-xl font-black text-farm-g1 font-syne">{formatINR(opt.discountPrice)}</p>
                              <p className="text-xs text-red-400 line-through font-bold">{formatINR(opt.price)}</p>
                            </div>
                          ) : (
                            <p className="text-xl font-black text-farm-g1 font-syne">{formatINR(opt.price)}</p>
                          )}
                       </div>
                       
                       <div className="flex items-center gap-1">
                          {cartItem ? (
                            <div className="flex items-center gap-3 bg-farm-g1 p-1 rounded-full shadow-lg">
                              <button 
                                onClick={() => updateQuantity(veg.id!, opt.unit, -1)}
                                className="w-8 h-8 flex items-center justify-center text-white hover:text-farm-s2 transition-colors bg-white/10 rounded-full"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="text-sm font-black text-farm-s2 min-w-[1.5rem] text-center font-syne">
                                {cartItem.quantity}
                              </span>
                              <button 
                                onClick={() => {
                                  const totalRequestedWeight = getVegWeightInCart(veg.id!) + multiplier;
                                  if (totalRequestedWeight > (veg.totalStock || 0)) {
                                    showToast(t.stockError.replace('{{name}}', veg.name), 'error');
                                    return;
                                  }
                                  updateQuantity(veg.id!, opt.unit, 1);
                                }}
                                className="w-8 h-8 flex items-center justify-center text-white hover:text-farm-s2 transition-colors bg-white/10 rounded-full"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              disabled={isOutOfStock || !veg.inStock}
                              onClick={() => {
                                const totalRequestedWeight = getVegWeightInCart(veg.id!) + multiplier;
                                if (totalRequestedWeight > (veg.totalStock || 0)) {
                                  showToast(t.stockError.replace('{{name}}', veg.name), 'error');
                                  return;
                                }
                                addToCart(veg, opt);
                              }}
                              className="bg-farm-g1 text-farm-s2 px-5 py-2.5 rounded-xl text-xs font-black shadow-lg border border-farm-g3/30 disabled:opacity-30 flex items-center gap-2"
                            >
                              <ShoppingCart className="h-4 w-4" />
                              {t.addToCart}
                            </button>
                          )}
                       </div>
                    </div>
                  );
                })}
              </div>
           </div>

           <div className="pt-4 border-t border-farm-border flex justify-between items-center bg-farm-cream/50 -mx-8 -mb-8 px-8 py-6">
              <div className="flex items-center gap-3 text-farm-muted text-xs font-bold">
                 <CheckCircle className="h-4 w-4 text-green-500" />
                 100% Satisfaction Guarantee
              </div>
              <button onClick={onClose} className="text-farm-g1 font-black text-sm uppercase tracking-widest font-syne italic">Close</button>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
