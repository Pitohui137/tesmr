import React, { useState, useEffect, useRef } from 'react';
import { MenuItem, Order, PaymentMethod, CafeSettings, OrderItem, MAX_TABLES } from '../types';
import { ShoppingBag, Search, ChevronRight, Check, MapPin, Phone, AlertCircle, RefreshCw, X, ArrowLeft, ArrowRight, CreditCard, Plus, Sunrise, Sun, Sunset, Moon, MoonStar, Utensils, Coffee, Cookie, Cake } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

const CATEGORY_LABELS: Record<string, string> = {
  makanan: 'Food Menu',
  kudapan: 'Kudapan',
  dessert: 'Dessert',
  minuman: 'Minuman',
};

const CATEGORY_BADGES: Record<string, string> = {
  makanan: 'bg-red-500/80 text-white',
  kudapan: 'bg-amber-500/80 text-white',
  dessert: 'bg-purple-500/80 text-white',
  minuman: 'bg-blue-500/80 text-white',
};

function CategoryPlaceholder({ category, size = 28 }: { category: string; size?: number }) {
  const Icon = category === 'makanan' ? Utensils : category === 'kudapan' ? Cookie : category === 'dessert' ? Cake : Coffee;
  return (
    <div className={`w-full aspect-[4/3] flex items-center justify-center bg-brand-badge-bg/60 ${category === 'makanan' ? 'text-red-400' : category === 'kudapan' ? 'text-amber-400' : category === 'dessert' ? 'text-purple-400' : 'text-blue-400'}`}>
      <Icon size={size} strokeWidth={1.8} />
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return { text: 'Selamat Pagi', tagline: 'Mulai harimu dengan secangkir hangat!', Icon: Sunrise };
  if (h >= 10 && h < 14) return { text: 'Selamat Siang', tagline: 'Waktunya isi energi, makan siang dulu yuk!', Icon: Sun };
  if (h >= 14 && h < 18) return { text: 'Selamat Sore', tagline: 'Cemilan sore menemani kerja dan ngobrol', Icon: Sunset };
  if (h >= 18 && h < 23) return { text: 'Selamat Malam', tagline: 'Santai sebentar, nikmati menu favoritmu', Icon: Moon };
  return { text: 'Malam yang Larut', tagline: 'Ngabisin malam dengan sesuatu yang hangat?', Icon: MoonStar };
}

interface CustomerViewProps {
  settings: CafeSettings;
  menu: MenuItem[];
  onOrderPlaced: (order: Order) => void;
}

export default function CustomerView({ settings, menu, onOrderPlaced }: CustomerViewProps) {
  // Get table from URL or state
  const [tableNumber, setTableNumber] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>(() => localStorage.getItem('customer_name') || '');
  const [isNameSubmitted, setIsNameSubmitted] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('semua');
  const [cart, setCart] = useState<{ [id: string]: number }>({});
  const [cartNotes, setCartNotes] = useState<{ [id: string]: string }>({});
  const [selectedVariants, setSelectedVariants] = useState<{ [id: string]: string }>({});
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('qris');
  const [isCheckingOut, setIsCheckingOut] = useState<boolean>(false);
  const [placedOrder, setPlacedOrder] = useState<Order | null>(() => {
    const saved = localStorage.getItem('customer_placed_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [orderStatusPoll, setOrderStatusPoll] = useState<Order | null>(() => {
    const saved = localStorage.getItem('customer_placed_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [error, setError] = useState<string>('');
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState<boolean>(false);
  const [isAddItemsOpen, setIsAddItemsOpen] = useState<boolean>(false);
  const [addCart, setAddCart] = useState<{ [id: string]: number }>({});
  const [addCartNotes, setAddCartNotes] = useState<{ [id: string]: string }>({});
  const [showAddItemsConfirm, setShowAddItemsConfirm] = useState<boolean>(false);
  const [isSendingAddItems, setIsSendingAddItems] = useState<boolean>(false);
  const [addItemsMessage, setAddItemsMessage] = useState<string>('');
  const checkoutInFlightRef = useRef(false);
  const addItemsInFlightRef = useRef(false);

  // Extract table number from URL on mount, restore from localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const table = params.get('table');
    if (table) {
      setTableNumber(table);
    }
    const savedOrder = localStorage.getItem('customer_placed_order');
    if (savedOrder) {
      const order = JSON.parse(savedOrder);
      setTableNumber(order.tableNumber);
      setCustomerName(order.customerName);
      setIsNameSubmitted(true);
    }
  }, []);

  // Real-time SSE + polling for order status
  useEffect(() => {
    const orderId = placedOrder?.id;
    if (!orderId) return;
    let cancelled = false;
    let delay = 8000;
    const MAX_DELAY = 60000;

    const loop = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/orders/${orderId}`);
        if (cancelled) return;
        if (res.status === 429) {
          delay = Math.min(delay * 2, MAX_DELAY);
        } else {
          delay = 8000;
          if (res.ok) {
            const current: Order = await res.json();
            setOrderStatusPoll(current);
            localStorage.setItem('customer_placed_order', JSON.stringify(current));
            if (current.status === 'selesai' || current.status === 'dibatalkan') {
              return;
            }
          } else if (res.status === 404) {
            localStorage.removeItem('customer_placed_order');
            setOrderStatusPoll(null);
            setPlacedOrder(null);
          }
        }
      } catch (err) {
        console.error("Error polling order status:", err);
      }
      setTimeout(loop, delay);
    };

    loop();
    return () => { cancelled = true; };
  }, [placedOrder?.id]);

  const handleSaveName = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError('Silakan masukkan nama Anda!');
      return;
    }
    if (!tableNumber) {
      setError('Silakan pilih nomor meja Anda!');
      return;
    }
    localStorage.setItem('customer_name', customerName.trim());
    setIsNameSubmitted(true);
    setError('');
  };

  const updateCartQuantity = (id: string, delta: number) => {
    setCart(prev => {
      const current = prev[id] || 0;
      const next = current + delta;
      if (next <= 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const getCartTotal = () => {
    return Object.entries(cart).reduce((sum, [key, qty]) => {
      return sum + itemPriceOf(key) * (qty as number);
    }, 0);
  };

  const getCartItemCount = () => {
    return Object.values(cart).reduce((sum, qty) => (sum as number) + (qty as number), 0) as number;
  };

  const parseCartKey = (key: string): { menuId: string; variant?: string } => {
    const [menuId, variant] = key.split('::');
    return { menuId, variant };
  };

  const cartKeyOf = (item: MenuItem, variant?: string) =>
    item.variants && item.variants.length ? `${item.id}::${variant || item.variants[0].label}` : item.id;

  const getItemVariant = (item: MenuItem, variant?: string) => {
    if (item.variants && item.variants.length) {
      return item.variants.find(x => x.label === variant) || item.variants[0];
    }
    return undefined;
  };

  const itemPriceOf = (key: string) => {
    const { menuId, variant } = parseCartKey(key);
    const item = menu.find(m => m.id === menuId);
    if (!item) return 0;
    const v = getItemVariant(item, variant);
    return v ? v.price : item.price;
  };

  const getSelectedVariant = (item: MenuItem) => {
    if (!item.variants || !item.variants.length) return undefined;
    const pref = item.variants.find(v => v.label === (selectedVariants[item.id] || item.variants![0].label));
    if (pref && pref.isAvailable !== false) return pref;
    return item.variants.find(v => v.isAvailable !== false) || item.variants[0];
  };

  const reducedMotion = useReducedMotion();
  const [flyingItem, setFlyingItem] = useState<{ id: number; item: MenuItem; fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const flyIdRef = useRef(0);
  const cartBadgeRef = useRef<HTMLSpanElement>(null);
  const cartAnchorRef = useRef<HTMLDivElement>(null);
  const greeting = getGreeting();

  const cartCount = getCartItemCount();
  const [badgePulse, setBadgePulse] = useState(false);
  useEffect(() => {
    if (cartCount === 0) return;
    setBadgePulse(true);
    const t = setTimeout(() => setBadgePulse(false), 400);
    return () => clearTimeout(t);
  }, [cartCount]);

  const getCartTargetRect = (): DOMRect | null => {
    if (cartBadgeRef.current) return cartBadgeRef.current.getBoundingClientRect();
    if (cartAnchorRef.current) return cartAnchorRef.current.getBoundingClientRect();
    return null;
  };

  const triggerFlyToCart = (item: MenuItem, fromEl: HTMLElement) => {
    const target = getCartTargetRect();
    if (!target) return;
    const from = fromEl.getBoundingClientRect();
    flyIdRef.current += 1;
    const id = flyIdRef.current;
    setFlyingItem({
      id,
      item,
      fromX: from.left + from.width / 2,
      fromY: from.top + from.height / 2,
      toX: target.left + target.width / 2,
      toY: target.top + target.height / 2,
    });
    window.setTimeout(() => {
      setFlyingItem(prev => (prev && prev.id === id ? null : prev));
    }, 650);
  };

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current) return;
    if (getCartItemCount() === 0) return;
    checkoutInFlightRef.current = true;
    setIsCheckingOut(true);
    setError('');

    const orderItems: OrderItem[] = Object.entries(cart).map(([key, qty]) => {
      const { menuId, variant } = parseCartKey(key);
      const item = menu.find(m => m.id === menuId)!;
      const v = getItemVariant(item, variant);
      return {
        menuId: item.id,
        name: `${item.name}${v ? ` (${v.label})` : ''}`,
        price: v ? v.price : item.price,
        quantity: qty as number,
        notes: cartNotes[key] || undefined,
        variant: v ? v.label : undefined
      };
    });

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          tableNumber,
          items: orderItems,
          paymentMethod
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan saat memproses pesanan.');
      }

      setPlacedOrder(data.order);
      setOrderStatusPoll(data.order);
      localStorage.setItem('customer_placed_order', JSON.stringify(data.order));
      onOrderPlaced(data.order);
      setCart({}); // Clear cart
      setIsCartOpen(false);
    } catch (err: any) {
      setError(err.message || 'Gagal mengirim pesanan');
    } finally {
      checkoutInFlightRef.current = false;
      setIsCheckingOut(false);
    }
  };

  const updateAddCartQty = (key: string, delta: number) => {
    setAddCart(prev => {
      const current = prev[key] || 0;
      const next = current + delta;
      if (next <= 0) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: next };
    });
  };

  const getAddCartTotal = () => {
    return Object.entries(addCart).reduce((sum, [key, qty]) => {
      return sum + itemPriceOf(key) * (qty as number);
    }, 0);
  };

  const handleAddItemsSubmit = async () => {
    if (addItemsInFlightRef.current) return;
    if (getAddCartTotal() === 0 || !placedOrder) return;
    addItemsInFlightRef.current = true;
    setIsSendingAddItems(true);
    setError('');
    const items: OrderItem[] = Object.entries(addCart).map(([key, qty]) => {
      const { menuId, variant } = parseCartKey(key);
      const item = menu.find(m => m.id === menuId)!;
      const v = getItemVariant(item, variant);
      return {
        menuId: item.id,
        name: `${item.name}${v ? ` (${v.label})` : ''}`,
        price: v ? v.price : item.price,
        quantity: qty as number,
        notes: addCartNotes[key] || undefined,
        variant: v ? v.label : undefined
      };
    });
    try {
      const response = await fetch(`/api/orders/${placedOrder.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items,
          customerName: placedOrder.customerName,
          tableNumber: placedOrder.tableNumber
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Terjadi kesalahan saat menambahkan pesanan.');
      }
      const updatedOrder: Order = data.order;
      setPlacedOrder(updatedOrder);
      setOrderStatusPoll(updatedOrder);
      localStorage.setItem('customer_placed_order', JSON.stringify(updatedOrder));
      setAddCart({});
      setAddCartNotes({});
      setIsAddItemsOpen(false);
      setShowAddItemsConfirm(false);
      setAddItemsMessage('Pesanan tambahan berhasil ditambahkan.');
      setTimeout(() => setAddItemsMessage(''), 6000);
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan pesanan');
    } finally {
      addItemsInFlightRef.current = false;
      setIsSendingAddItems(false);
    }
  };

  const filteredMenu = menu.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'semua' || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  // 1. Initial State: Enter Name and Table Number
  if (!isNameSubmitted && !placedOrder) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-brand-bg">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-brand-badge-border overflow-hidden lg:max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-br from-brand-forest to-brand-deep p-8 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-brand-deep/10" />
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-brand-forest/30 rounded-full blur-3xl" />
            <div className="relative z-10">
              <div className="mx-auto mb-5 w-24 h-24 rounded-full overflow-hidden ring-3 ring-white/20 shadow-2xl">
                <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
              </div>
              <span className="inline-block px-4 py-1.5 bg-white/10 text-brand-light-sage rounded-full text-[10px] font-bold uppercase tracking-[0.15em] mb-3 border border-white/10 backdrop-blur-sm">
                Scan Meja Berhasil
              </span>
              <h1 className="text-3xl font-black tracking-tight drop-shadow-lg">{settings.name}</h1>
              <div className="flex items-baseline justify-center gap-1.5 mt-2 text-brand-light-sage">
                <MapPin size={14} className="shrink-0 relative top-0.5" />
                <span className="text-sm">{settings.address}</span>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveName} className="p-6 space-y-6">
            <h2 className="text-xl font-bold text-gray-800 border-b border-gray-100 pb-3">Selamat Datang!</h2>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Nama Lengkap Pemesan</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Masukkan nama Anda..."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-forest bg-gray-50 focus:bg-white transition-all text-gray-800 font-medium"
              />
              <p className="text-xs text-gray-400">Nama ini akan tercetak di struk belanja Anda.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-700">Nomor Meja Anda</label>
              {tableNumber ? (
                <div className="w-full px-4 py-3 bg-brand-badge-bg border border-brand-badge-border text-brand-forest rounded-xl font-bold flex items-center justify-between">
                  <span>Meja Nomor: {tableNumber}</span>
                  <span className="text-xs px-2 py-1 bg-brand-forest text-white rounded-md uppercase tracking-wider font-semibold">Terkunci</span>
                </div>
              ) : (
                <select
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-forest bg-gray-50 focus:bg-white transition-all text-gray-800 font-medium"
                >
                  <option value="">-- Pilih Nomor Meja --</option>
                  {[...Array(MAX_TABLES)].map((_, i) => (
                    <option key={i + 1} value={String(i + 1)}>Meja {i + 1}</option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-brand-forest hover:bg-brand-deep text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 text-base cursor-pointer"
            >
              Lihat Menu & Pesan <ChevronRight size={18} />
            </button>
          </form>
        </div>

        <p className="text-[10px] text-slate-400 mt-4">© {new Date().getFullYear()} {settings.name} — Semua hak cipta dilindungi.</p>
      </div>
    );
  }

  // 2. Main Menu and Ordering View
  if (!placedOrder) {
    return (
      <div className="min-h-screen bg-brand-bg pb-28">
        {/* Banner Header - Compact */}
        <div className="bg-brand-deep text-white pt-3 pb-4 px-4 relative overflow-hidden">
          <motion.div
            initial={false}
            animate={reducedMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-0 right-0 w-32 h-32 bg-brand-forest/40 rounded-full blur-2xl -mr-8 -mt-8"
          />
          <div className="max-w-md mx-auto lg:max-w-5xl lg:px-4">
            <div className="flex items-center justify-between mb-1">
              <button onClick={() => setIsNameSubmitted(false)} className="text-white/70 hover:text-white flex items-center gap-1 text-[11px] font-medium transition-colors">
                <ArrowLeft size={14} /> Kembali
              </button>
              <div className="text-right">
                <span className="text-[9px] text-brand-light-sage uppercase font-bold tracking-wider">Meja</span>
                <span className="text-white font-bold text-xs ml-1">{tableNumber}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-white/10">
                  <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
                </div>
                <h1 className="text-lg font-black tracking-tight">{settings.name}</h1>
              </div>
              <div className="bg-white/10 px-2.5 py-1.5 rounded-lg border border-white/10 text-right backdrop-blur-sm">
                <span className="block text-[9px] text-brand-light-sage uppercase font-bold tracking-wider">Pemesan</span>
                <span className="text-xs font-semibold text-white">{customerName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Greeting Hero */}
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="max-w-md mx-auto px-4 mt-4 lg:max-w-5xl lg:px-6"
        >
          <div className="flex items-center gap-3 bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3 mx-1">
            <div className="w-10 h-10 shrink-0 rounded-full bg-brand-badge-bg border border-brand-badge-border flex items-center justify-center text-brand-forest">
              <greeting.Icon size={20} strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-brand-deep text-sm leading-tight">
                {greeting.text}{customerName ? `, ${customerName}!` : '!'}
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{greeting.tagline}</p>
            </div>
          </div>
        </motion.div>

        {/* Search Bar - Integrated */}
        <div className="max-w-md mx-auto px-4 mt-4 relative z-10 lg:max-w-5xl lg:px-6">
          <div className="bg-white rounded-2xl shadow-lg p-2.5 flex items-center gap-2 border border-slate-100 mx-1">
            <Search className="text-slate-400 ml-1 shrink-0" size={18} />
            <input
              type="text"
              placeholder="Cari menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full focus:outline-none text-slate-700 placeholder-slate-400 font-medium text-sm bg-transparent"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 shrink-0">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Categories Tab */}
        <div className="max-w-md mx-auto px-4 mt-6 lg:max-w-5xl lg:px-6">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
            {[
              { id: 'semua', label: 'Semua Menu' },
              { id: 'makanan', label: 'Food Menu' },
              { id: 'kudapan', label: 'Kudapan' },
              { id: 'dessert', label: 'Dessert' },
              { id: 'minuman', label: 'Minuman' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full font-semibold text-xs whitespace-nowrap transition-all cursor-pointer ${activeCategory === cat.id
                  ? 'bg-brand-forest text-white shadow-sm shadow-brand-forest/20'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid */}
        <div className="max-w-md mx-auto px-4 mt-4 lg:max-w-5xl lg:px-6">
          {filteredMenu.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100 text-slate-500">
              <p className="font-semibold">Menu tidak ditemukan</p>
              <p className="text-xs text-slate-400 mt-1">Coba kata kunci atau kategori yang lain.</p>
            </div>
          ) : (
            <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 lg:gap-5">
              <AnimatePresence mode="popLayout" initial={false}>
                {filteredMenu.map((item, index) => {
                  const selectedV = getSelectedVariant(item);
                  const cartKey = cartKeyOf(item, selectedV?.label);
                  const allVariantsOut = item.variants && item.variants.length > 0 && item.variants.every(v => v.isAvailable === false);
                  const isOut = !item.isAvailable || !!allVariantsOut;
                  return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.28, ease: 'easeOut', delay: reducedMotion ? 0 : Math.min(index * 0.03, 0.45) }}
                    className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden ${isOut ? 'opacity-45 pointer-events-none select-none' : 'hover:shadow-md'
                      }`}
                  >
                    <div className="relative">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          referrerPolicy="no-referrer"
                          className="w-full aspect-[4/3] object-contain bg-brand-badge-bg/50 p-1"
                        />
                      ) : (
                        <CategoryPlaceholder category={item.category} />
                      )}
                      {isOut && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <span className="bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                            Habis
                          </span>
                        </div>
                      )}
                      <span className={`absolute top-2 left-2 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md ${CATEGORY_BADGES[item.category] || 'bg-slate-500/80 text-white'
                        }`}>
                        {CATEGORY_LABELS[item.category] || item.category}
                      </span>
                    </div>
                    <div className="p-2.5 space-y-1.5">
                      <h3 className="font-bold text-slate-800 text-xs leading-tight line-clamp-2 min-h-[2rem]">{item.name}</h3>
                      {item.variants && item.variants.length > 0 && (
                        <div className="flex gap-1">
                          {item.variants.map(v => {
                            const isSel = (selectedVariants[item.id] || item.variants![0].label) === v.label;
                            const chipOut = v.isAvailable === false;
                            return (
                              <button
                                key={v.label}
                                disabled={chipOut}
                                onClick={() => setSelectedVariants(prev => ({ ...prev, [item.id]: v.label }))}
                                title={chipOut ? `${v.label} sedang habis` : v.label}
                                className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${chipOut ? 'opacity-40 line-through cursor-not-allowed' : 'cursor-pointer ' + (isSel ? 'bg-brand-forest text-white' : 'bg-brand-badge-bg text-slate-600 hover:bg-brand-badge-border')}`}
                              >
                                {v.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-brand-forest text-sm">{formatPrice(selectedV ? selectedV.price : item.price)}</span>
                        {!isOut && (
                          cart[cartKey] ? (
                            <div className="flex items-center bg-brand-badge-bg rounded-lg p-0.5 border border-brand-badge-border">
                              <motion.button
                                whileTap={reducedMotion ? undefined : { scale: 0.8 }}
                                onClick={() => updateCartQuantity(cartKey, -1)}
                                className="w-6 h-6 flex items-center justify-center font-bold text-brand-forest hover:bg-brand-badge-bg rounded-md text-xs cursor-pointer"
                              >
                                -
                              </motion.button>
                              <span className="w-5 text-center text-[10px] font-bold text-brand-deep">{cart[cartKey]}</span>
                              <motion.button
                                whileTap={reducedMotion ? undefined : { scale: 0.8 }}
                                onClick={() => updateCartQuantity(cartKey, 1)}
                                className="w-6 h-6 flex items-center justify-center font-bold text-brand-forest hover:bg-brand-badge-bg rounded-md text-xs cursor-pointer"
                              >
                                +
                              </motion.button>
                            </div>
                          ) : (
                            <motion.button
                              whileTap={reducedMotion ? undefined : { scale: 0.88 }}
                              onClick={(e) => {
                                updateCartQuantity(cartKey, 1);
                                if (!reducedMotion) triggerFlyToCart(item, e.currentTarget);
                              }}
                              className="bg-brand-forest hover:bg-brand-deep text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-sm cursor-pointer transition-all"
                            >
                              + Tambah
                            </motion.button>
                          )
                        )}
                      </div>
                    </div>
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </div>

        {/* Floating Cart Button */}
        {getCartItemCount() > 0 && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-transparent pointer-events-none z-30">
            <div className="max-w-md mx-auto lg:max-w-5xl">
              <button
                onClick={() => setIsCartOpen(true)}
                className="w-full bg-brand-forest hover:bg-brand-deep text-white p-4 rounded-2xl shadow-xl flex items-center justify-between transition-all active:scale-[0.99] pointer-events-auto cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-brand-forest p-2 rounded-xl relative">
                    <ShoppingBag size={20} />
                    <motion.span
                      ref={cartBadgeRef}
                      animate={badgePulse ? { scale: [1, 1.35, 1] } : { scale: 1 }}
                      transition={{ duration: 0.35 }}
                      className="absolute -top-1.5 -right-1.5 bg-yellow-500 text-yellow-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-brand-forest"
                    >
                      {getCartItemCount()}
                    </motion.span>
                  </div>
                  <div className="text-left">
                    <span className="block text-[10px] text-brand-light-sage uppercase font-extrabold tracking-wider">Keranjang Pesanan</span>
                    <span className="text-base font-bold text-white">{formatPrice(getCartTotal())}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 font-bold text-sm text-brand-light-sage">
                  Bayar & Pesan <ChevronRight size={18} />
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Cart anchor (always mounted) sebagai target fly-to-cart */}
        <div ref={cartAnchorRef} className="fixed bottom-8 left-1/2 w-2 h-2 opacity-0 pointer-events-none z-30" />

        {/* Flying item animation */}
        <AnimatePresence>
          {flyingItem && (
            <motion.div
              key={flyingItem.id}
              initial={{ x: flyingItem.fromX - 20, y: flyingItem.fromY - 20, scale: 1, opacity: 1 }}
              animate={{ x: flyingItem.toX - 20, y: flyingItem.toY - 20, scale: 0.4, opacity: 0.85 }}
              exit={{ opacity: 0, scale: 0.3 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="fixed left-0 top-0 z-[60] w-10 h-10 rounded-full overflow-hidden pointer-events-none shadow-lg ring-2 ring-white bg-brand-badge-bg flex items-center justify-center"
            >
              {flyingItem.item.imageUrl ? (
                <img src={flyingItem.item.imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <span className="text-brand-forest w-4 h-4">
                  {flyingItem.item.category === 'makanan' ? <Utensils size={16} /> : flyingItem.item.category === 'kudapan' ? <Cookie size={16} /> : flyingItem.item.category === 'dessert' ? <Cake size={16} /> : <Coffee size={16} />}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Checkout Modal / Drawer */}
        <AnimatePresence>
          {isCartOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="w-full max-w-md bg-white rounded-t-[2rem] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden lg:max-w-lg"
              >
                {/* Drawer Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-800 text-lg">Konfirmasi Pesanan</h3>
                    <p className="text-xs text-slate-400">Meja {tableNumber} • {customerName}</p>
                  </div>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="p-2 bg-slate-100 text-slate-500 hover:bg-slate-200 rounded-full transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Drawer Body (Items list) */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {Object.entries(cart).map(([id, qtyVal]) => {
                    const qty = qtyVal as number;
                    const { menuId, variant } = parseCartKey(id);
                    const item = menu.find(m => m.id === menuId);
                    if (!item) return null;
                    const unitPrice = itemPriceOf(id);
                    return (
                      <div key={id} className="space-y-1.5">
                        <div className="flex justify-between items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-slate-800 text-sm truncate">
                              {item.name}{variant ? ` (${variant})` : ''}
                            </h4>
                            <span className="text-brand-forest font-semibold text-xs">{formatPrice(unitPrice)}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-200">
                              <button
                                onClick={() => updateCartQuantity(id, -1)}
                                className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded"
                              >
                                -
                              </button>
                              <span className="w-6 text-center text-xs font-bold text-slate-800">{qty}</span>
                              <button
                                onClick={() => updateCartQuantity(id, 1)}
                                className="w-6 h-6 flex items-center justify-center font-bold text-slate-600 hover:bg-slate-100 rounded"
                              >
                                +
                              </button>
                            </div>
                            <span className="w-20 text-right font-extrabold text-slate-800 text-sm">
                              {formatPrice(unitPrice * qty)}
                            </span>
                          </div>
                        </div>
                        <textarea
                          value={cartNotes[id] || ''}
                          onChange={(e) => setCartNotes(prev => ({ ...prev, [id]: e.target.value }))}
                          placeholder="Catatan (contoh: tidak pedas, extra gula)"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-brand-forest resize-none"
                          rows={2}
                        />
                      </div>
                    );
                  })}

                  <hr className="border-slate-100" />

                  {/* Payment Method Selector */}
                  <div className="space-y-3">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Metode Pembayaran</label>
            <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setPaymentMethod('qris')}
                        className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer ${paymentMethod === 'qris'
                          ? 'border-brand-forest bg-brand-badge-bg/55 text-brand-deep font-bold shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600 font-medium'
                          }`}
                      >
                        <span className="text-sm">QRIS (Digital)</span>
                        <span className="text-[10px] text-brand-forest font-semibold uppercase tracking-wider px-1.5 bg-brand-badge-bg rounded">
                          Bayar Instan
                        </span>
                      </button>

                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-1.5 transition-all text-center cursor-pointer ${paymentMethod === 'cash'
                          ? 'border-brand-forest bg-brand-badge-bg/55 text-brand-deep font-bold shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 text-slate-600 font-medium'
                          }`}
                      >
                        <span className="text-sm">Bayar di Kasir</span>
                        <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider px-1.5 bg-slate-100 rounded">
                          Cash / Debit
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Drawer Footer (Total and CTA) */}
                <div className="p-5 border-t border-slate-100 bg-slate-50">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-slate-500 font-semibold text-sm">Total Pembayaran</span>
                    <span className="text-xl font-black text-brand-deep">{formatPrice(getCartTotal())}</span>
                  </div>

                  {error && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={() => setShowCheckoutConfirm(true)}
                    disabled={isCheckingOut}
                    className="w-full bg-brand-forest hover:bg-brand-deep disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2 text-base cursor-pointer"
                  >
                    {isCheckingOut ? (
                      <>
                        <RefreshCw className="animate-spin" size={18} />
                        Memproses Pesanan...
                      </>
                    ) : (
                      <>
                        <Check size={18} />
                        Kirim Pesanan Sekarang
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Checkout Final Confirmation Popup */}
        <AnimatePresence>
          {showCheckoutConfirm && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 lg:max-w-lg"
              >
                <div className="p-5 border-b border-slate-100 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-badge-bg flex items-center justify-center flex-shrink-0">
                    <Check size={20} className="text-brand-forest" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base leading-snug">Apakah pesanan Anda sudah benar?</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Periksa kembali daftar pesanan sebelum dikirim.</p>
                  </div>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-3 border-b border-slate-100">
                  <div className="flex justify-between text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Meja {tableNumber} • {customerName}</span>
                    <span className="uppercase">{paymentMethod}</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(cart).map(([id, qtyVal]) => {
                      const qty = qtyVal as number;
                      const item = menu.find(m => m.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="flex justify-between text-sm">
                          <span className="text-slate-700 font-medium">
                            {item.name} <span className="text-slate-400 font-bold">x{qty}</span>
                            {cartNotes[id] ? (
                              <span className="block text-[10px] text-slate-400 italic mt-0.5">Catatan: {cartNotes[id]}</span>
                            ) : null}
                          </span>
                          <span className="font-bold text-slate-800 flex-shrink-0">{formatPrice(item.price * qty)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <hr className="border-slate-100" />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold text-sm">Total Pembayaran</span>
                    <span className="text-lg font-black text-brand-deep">{formatPrice(getCartTotal())}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 flex gap-2">
                  <button
                    onClick={() => setShowCheckoutConfirm(false)}
                    className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all text-sm cursor-pointer hover:bg-slate-100"
                  >
                    Periksa Lagi
                  </button>
                  <button
                    onClick={() => { setShowCheckoutConfirm(false); handleCheckout(); }}
                    disabled={isCheckingOut}
                    className="flex-1 bg-brand-forest hover:bg-brand-deep disabled:bg-slate-300 text-white font-bold py-2.5 rounded-xl transition-all text-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isCheckingOut ? <RefreshCw className="animate-spin" size={16} /> : <Check size={16} />}
                    Ya, Pesan
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="max-w-md mx-auto px-4 pt-2 pb-4 text-center lg:max-w-5xl">
          <p className="text-[10px] text-slate-400">© {new Date().getFullYear()} {settings.name} — Semua hak cipta dilindungi.</p>
        </footer>
      </div>
    );
  }

  // 3. Order Placed Screen (Status Tracking & Payments)
  const currentOrder = orderStatusPoll || placedOrder;

  return (
    <div className="min-h-screen bg-brand-bg p-4 pb-12 flex flex-col items-center justify-start">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-brand-badge-border/65 overflow-hidden mt-4 lg:max-w-2xl">
        {/* Header Status */}
        <div className="bg-brand-deep text-white p-6 text-center relative">
          <span className="inline-block px-2.5 py-0.5 bg-brand-forest text-brand-light-sage rounded-full text-[10px] font-bold uppercase tracking-wider mb-2 border border-brand-sage/20">
            ID Pesanan: {currentOrder.id}
          </span>
          <h2 className="text-xl font-bold">Terima Kasih, {currentOrder.customerName}!</h2>
          <p className="text-xs text-brand-light-sage mt-1">Meja Anda: Meja {currentOrder.tableNumber}</p>
        </div>

        {/* Cancelled order banner */}
        {currentOrder.status === 'dibatalkan' && (
          <div className="p-6 border-b border-slate-100 bg-red-50 text-center space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-2">
              <X size={32} className="text-red-500" />
            </div>
            <h3 className="text-lg font-extrabold text-red-700">Pesanan Dibatalkan</h3>
            <p className="text-sm text-red-600 font-medium">Pesanan Anda telah dibatalkan oleh kasir</p>
            <button
              onClick={() => {
                setPlacedOrder(null);
                setOrderStatusPoll(null);
                localStorage.removeItem('customer_placed_order');
              }}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-sm"
            >
              Kembali ke Menu
            </button>
          </div>
        )}

        {/* Order tracking steps */}
        {currentOrder.status !== 'dibatalkan' && (
          <div className="p-6 border-b border-slate-100 bg-brand-badge-bg/10">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Status Pesanan Anda</h3>

            <div className="space-y-6 relative before:absolute before:left-[15px] before:top-4 before:bottom-4 before:w-[2px] before:bg-slate-200">
              {/* Step 1: Verification */}
              <div className="flex gap-4 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] z-10 transition-all ${currentOrder.status === 'menunggu_verifikasi'
                  ? 'bg-yellow-500 text-yellow-950 ring-2 ring-yellow-100 animate-pulse'
                  : 'bg-brand-forest text-white'
                  }`}>
                  {currentOrder.status !== 'menunggu_verifikasi' ? <Check size={14} /> : '1'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-slate-800 text-sm">Menunggu Verifikasi</h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {currentOrder.paymentMethod === 'qris'
                      ? 'Menunggu verifikasi bukti bayar QRIS oleh kasir.'
                      : 'Silakan lakukan pembayaran tunai di meja kasir.'}
                  </p>
                </div>
              </div>

              {/* Step 2: In progress */}
              <div className="flex gap-4 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] z-10 transition-all ${currentOrder.status === 'diproses'
                  ? 'bg-brand-forest text-white ring-2 ring-brand-badge-bg animate-pulse'
                  : (currentOrder.status === 'siap_diambil' || currentOrder.status === 'selesai')
                    ? 'bg-brand-forest text-white'
                    : 'bg-slate-200 text-slate-500'
                  }`}>
                  {(currentOrder.status === 'siap_diambil' || currentOrder.status === 'selesai') ? <Check size={14} /> : '2'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-bold text-sm ${currentOrder.status === 'diproses' ? 'text-brand-forest' :
                    (currentOrder.status === 'siap_diambil' || currentOrder.status === 'selesai') ? 'text-slate-800' : 'text-slate-400'
                    }`}>
                    Sedang Disiapkan
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">Pesanan Anda sedang diproduksi oleh barista/koki kami.</p>
                </div>
              </div>

              {/* Step 3: Ready to pick up */}
              <div className="flex gap-4 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] z-10 transition-all ${currentOrder.status === 'siap_diambil'
                  ? 'bg-blue-600 text-white ring-2 ring-blue-100 animate-pulse'
                  : currentOrder.status === 'selesai'
                    ? 'bg-brand-forest text-white'
                    : 'bg-slate-200 text-slate-500'
                  }`}>
                  {currentOrder.status === 'selesai' ? <Check size={14} /> : '3'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-bold text-sm ${currentOrder.status === 'siap_diambil' ? 'text-blue-800' :
                    currentOrder.status === 'selesai' ? 'text-slate-800' : 'text-slate-400'
                    }`}>
                    Siap Diambil
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">Pesanan selesai dibuat. Silakan ambil di meja kasir, pager Anda akan bergetar.</p>
                </div>
              </div>

              {/* Step 4: Completed */}
              <div className="flex gap-4 relative">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[13px] z-10 transition-all ${currentOrder.status === 'selesai'
                  ? 'bg-brand-forest text-white ring-2 ring-brand-badge-bg'
                  : 'bg-slate-200 text-slate-500'
                  }`}>
                  {currentOrder.status === 'selesai' ? <Check size={14} /> : '4'}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={`font-bold text-sm ${currentOrder.status === 'selesai' ? 'text-brand-deep' : 'text-slate-400'}`}>
                    Pesanan Selesai
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">Selamat menikmati hidangan lezat kami!</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Additional items message */}
        {addItemsMessage && (
          <div className="p-4 border-b border-slate-100 bg-green-50 text-green-800 text-xs flex items-center gap-2">
            <Check size={14} className="flex-shrink-0" />
            <span>{addItemsMessage}</span>
          </div>
        )}

        {/* Additional payment note */}
        {(currentOrder.additionalAmount || 0) > 0 && (currentOrder.status === 'diproses' || currentOrder.status === 'siap_diambil') && (
          <div className="p-4 border-b border-slate-100 bg-amber-50 text-amber-800 text-xs flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>
              Ada item tambahan pada pesanan Anda. Selisih <span className="font-extrabold">{formatPrice(currentOrder.additionalAmount || 0)}</span> dibayar di meja kasir saat mengambil pesanan.
            </span>
          </div>
        )}

        {/* Add items to active order */}
        {(currentOrder.status === 'menunggu_verifikasi' || currentOrder.status === 'diproses') && (
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-700">Ada menu yang terlupakan?</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Tambahkan item lain ke pesanan yang sedang berjalan.</p>
            </div>
            <button
              onClick={() => { setAddCart({}); setAddCartNotes({}); setError(''); setIsAddItemsOpen(true); }}
              className="flex-shrink-0 bg-brand-forest hover:bg-brand-deep text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
            >
              <Plus size={14} /> Tambah Pesanan
            </button>
          </div>
        )}

        {/* QRIS Payment section if QRIS and waiting verification */}
        {currentOrder.paymentMethod === 'qris' && currentOrder.status === 'menunggu_verifikasi' && (
          <div className="p-6 border-b border-slate-100 bg-brand-badge-bg/25 text-center space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center">Instruksi Pembayaran QRIS</h3>

            {(settings.qrisCodeText || settings.qrisImageUrl) ? (
              <>
                <div className="bg-white p-4 rounded-xl border border-brand-badge-border inline-block">
                  <div className="w-48 h-48 mx-auto flex items-center justify-center bg-slate-100 relative rounded-lg border border-slate-100">
                    {settings.qrisImageUrl ? (
                      <img
                        src={settings.qrisImageUrl}
                        alt="QRIS"
                        referrerPolicy="no-referrer"
                        className="w-full h-full rounded-md object-contain"
                      />
                    ) : (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(settings.qrisCodeText + '?amount=' + currentOrder.totalPrice)}`}
                        alt="QRIS QR Code"
                        referrerPolicy="no-referrer"
                        className="w-full h-full rounded-md"
                      />
                    )}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="inline-block px-3 py-1 bg-brand-forest text-white font-extrabold rounded text-xs tracking-wider">
                      QRIS LENGKAP
                    </span>
                    <p className="text-[10px] text-slate-500 mt-1 font-bold tracking-wider">{settings.qrisMerchantName}</p>
                  </div>
                </div>

                <div className="space-y-1.5 max-w-xs mx-auto">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Total Belanja:</span>
                    <span className="font-extrabold text-brand-deep">{formatPrice(currentOrder.totalPrice)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-normal bg-white p-2.5 rounded-lg border border-slate-100">
                    Silakan scan QR Code di atas menggunakan aplikasi Bank, GoPay, OVO, Dana, atau LinkAja Anda. Infokan nama pemesan ke Kasir untuk validasi cepat.
                  </p>
                </div>
              </>
            ) : (
              <div className="text-center space-y-3 py-4">
                <div className="w-16 h-16 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center">
                  <CreditCard size={28} className="text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-600">QRIS Belum Tersedia</p>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Pembayaran QRIS belum diaktifkan. Silakan melakukan pembayaran <span className="font-bold">Cash</span> di meja kasir atau hubungi staf untuk bantuan.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Bill Summary */}
        <div className="p-6 space-y-3.5">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rincian Belanja</h3>

          <div className="space-y-2">
            {currentOrder.items.map((item, idx) => (
              <div key={idx} className="flex justify-between text-xs text-slate-700 font-medium">
                <span>{item.name} <span className="text-slate-400 font-bold">x{item.quantity}</span></span>
                <span className="font-semibold text-slate-900">{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          <hr className="border-slate-100" />

          <div className="flex justify-between items-center">
            <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Total Pembayaran</span>
            <span className="text-base font-black text-brand-deep">{formatPrice(currentOrder.totalPrice)}</span>
          </div>

          <div className="flex justify-between items-center text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <span>Metode: <span className="font-bold text-slate-600 uppercase">{currentOrder.paymentMethod}</span></span>
            {currentOrder.status === 'selesai' ? (
              <span className="flex items-center gap-1 text-brand-forest font-bold">
                <Check size={12} /> Pesanan Selesai
              </span>
            ) : currentOrder.status === 'dibatalkan' ? (
              <span className="flex items-center gap-1 text-red-500 font-bold">
                <X size={12} /> Pesanan Dibatalkan
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-sage animate-pulse" />
                Auto-Refresh Aktif
              </span>
            )}
          </div>
        </div>

        {/* Back to Order Option if Done */}
        {currentOrder.status === 'selesai' && (
          <div className="p-4 bg-brand-badge-bg/40 border-t border-brand-badge-border text-center">
            <button
              onClick={() => {
                setPlacedOrder(null);
                setOrderStatusPoll(null);
                localStorage.removeItem('customer_placed_order');
              }}
              className="px-6 py-2.5 bg-brand-forest hover:bg-brand-deep text-white font-bold text-sm rounded-xl transition-all cursor-pointer shadow-sm shadow-brand-forest/20"
            >
              Pesan Menu Lainnya
            </button>
          </div>
        )}

        {/* Add Items Modal */}
        <AnimatePresence>
          {isAddItemsOpen && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl w-full max-w-md flex flex-col max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 lg:max-w-lg"
              >
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                      <Plus size={14} /> Tambah Pesanan
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Pilih menu tambahan untuk {currentOrder.id}</p>
                  </div>
                  <button
                    onClick={() => setIsAddItemsOpen(false)}
                    className="p-1 bg-white hover:bg-slate-200 rounded-full border border-slate-200"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-2">
                  {error && (
                    <div className="mb-2 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-2">
                      <AlertCircle size={14} />
                      <span>{error}</span>
                    </div>
                  )}
                  {menu.filter(m => m.isAvailable).map(item => {
                    const sv = getSelectedVariant(item);
                    const aKey = cartKeyOf(item, sv?.label);
                    return (
                    <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-bold text-slate-800 block truncate">{item.name}</span>
                          <span className="text-xs text-slate-500">{formatPrice(sv ? sv.price : item.price)}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          <button
                            onClick={() => updateAddCartQty(aKey, -1)}
                            className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer font-bold text-sm"
                          >
                            -
                          </button>
                          <span className="w-8 text-center font-bold text-sm text-slate-800">{addCart[aKey] || 0}</span>
                          <button
                            onClick={() => updateAddCartQty(aKey, 1)}
                            className="w-7 h-7 bg-brand-forest text-white border border-brand-forest rounded-lg flex items-center justify-center hover:bg-brand-deep cursor-pointer font-bold text-sm"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {item.variants && item.variants.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {item.variants.map(v => {
                            const isSel = (selectedVariants[item.id] || item.variants![0].label) === v.label;
                            const chipOut = v.isAvailable === false;
                            return (
                              <button
                                key={v.label}
                                disabled={chipOut}
                                onClick={() => setSelectedVariants(prev => ({ ...prev, [item.id]: v.label }))}
                                title={chipOut ? `${v.label} sedang habis` : v.label}
                                className={`px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all ${chipOut ? 'opacity-40 line-through cursor-not-allowed' : 'cursor-pointer ' + (isSel ? 'bg-brand-forest text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100')}`}
                              >
                                {v.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {menu.filter(m => m.isAvailable).length === 0 && (
                    <p className="text-center text-slate-400 text-sm py-8 font-medium">Tidak ada menu tersedia</p>
                  )}
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-semibold text-sm">Total Tambahan</span>
                    <span className="text-lg font-black text-brand-deep">{formatPrice(getAddCartTotal())}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAddItemsOpen(false)}
                      className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer hover:bg-slate-100"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => setShowAddItemsConfirm(true)}
                      disabled={getAddCartTotal() === 0}
                      className="flex-1 bg-brand-forest hover:bg-brand-deep disabled:bg-slate-200 text-white font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                    >
                      Kirim Tambahan
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Add Items Confirm Popup */}
        <AnimatePresence>
          {showAddItemsConfirm && (
            <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-100 lg:max-w-lg"
              >
                <div className="p-5 border-b border-slate-100 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-badge-bg flex items-center justify-center flex-shrink-0">
                    <Plus size={20} className="text-brand-forest" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 text-base leading-snug">Apakah pesanan tambahan Anda sudah benar?</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Item akan ditambahkan ke pesanan yang sedang berjalan.</p>
                  </div>
                </div>

                <div className="p-5 overflow-y-auto flex-1 space-y-3 border-b border-slate-100">
                  <div className="space-y-2">
                    {Object.entries(addCart).map(([id, qtyVal]) => {
                      const qty = qtyVal as number;
                      const item = menu.find(m => m.id === id);
                      if (!item) return null;
                      return (
                        <div key={id} className="flex justify-between text-sm">
                          <span className="text-slate-700 font-medium">
                            {item.name} <span className="text-slate-400 font-bold">x{qty}</span>
                          </span>
                          <span className="font-bold text-slate-800 flex-shrink-0">{formatPrice(item.price * qty)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <hr className="border-slate-100" />
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-bold text-sm">Total Tambahan</span>
                    <span className="text-lg font-black text-brand-deep">{formatPrice(getAddCartTotal())}</span>
                  </div>
                  {currentOrder.status === 'diproses' && (
                    <div className="p-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl text-[11px] flex items-start gap-2">
                      <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                      <span>Selisih pembayaran akan ditagih di meja kasir saat Anda mengambil pesanan.</span>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-slate-50 flex gap-2">
                  <button
                    onClick={() => setShowAddItemsConfirm(false)}
                    className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer hover:bg-slate-100"
                  >
                    Periksa Lagi
                  </button>
                  <button
                    onClick={handleAddItemsSubmit}
                    disabled={isSendingAddItems}
                    className="flex-1 bg-brand-forest hover:bg-brand-deep disabled:bg-slate-200 text-white font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isSendingAddItems ? <RefreshCw className="animate-spin" size={14} /> : <Check size={14} />}
                    Ya, Kirim
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <footer className="w-full max-w-md px-4 pt-3 pb-1 text-center lg:max-w-2xl">
          <p className="text-[10px] text-slate-400">© {new Date().getFullYear()} {settings.name} — Semua hak cipta dilindungi.</p>
        </footer>
      </div>
    </div>
  );
}
