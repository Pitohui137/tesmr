import React, { useState, useEffect, useRef } from 'react';
import { Order, OrderStatus, CafeSettings, MenuItem, UserAccount } from '../types';
import { playNotificationOrCustomSound, initAudio, getCustomSound, setCustomSound, clearCustomSound } from '../utils/audio';
import { Play, ClipboardCheck, ArrowUpRight, CheckCircle, Clock, ShoppingCart, UserCheck, DollarSign, Printer, X, Bell, Volume2, Search, ArrowRight, Trash2, Plus, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../utils/api';

interface CashierDashboardProps {
  settings: CafeSettings;
  onLogout: () => void;
  user?: UserAccount | null;
}

export default function CashierDashboard({ settings, onLogout, user }: CashierDashboardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('semua');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState<boolean>(true);
  const [addItemModalOrder, setAddItemModalOrder] = useState<Order | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQuantities, setItemQuantities] = useState<Record<string, number>>({});
  const [addVariants, setAddVariants] = useState<Record<string, string>>({});
  const [isAddingItems, setIsAddingItems] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [newOrderFlash, setNewOrderFlash] = useState(false);

  const prevOrdersRef = useRef<Order[]>([]);
  const audioInitedRef = useRef(false);

  const fetchOrders = async (): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/orders', undefined, onLogout);
      if (res.status === 429) return true;
      if (res.ok) {
        const data: Order[] = await res.json();
        if (prevOrdersRef.current.length > 0) {
          const newOrders = data.filter(
            newOrd => 
              newOrd.status === 'menunggu_verifikasi' && 
              !prevOrdersRef.current.some(oldOrd => oldOrd.id === newOrd.id)
          );
          if (newOrders.length > 0) {
            setNewOrderFlash(true);
            setTimeout(() => setNewOrderFlash(false), 3000);
            if (audioEnabled) {
              playNotificationOrCustomSound();
            }
          }
        }
        setOrders(data);
        prevOrdersRef.current = data;
      }
    } catch (err) {
      console.error("Error fetching orders in Cashier Dashboard:", err);
    }
    return false;
  };

  useEffect(() => {
    const onInteraction = () => {
      if (!audioInitedRef.current) {
        audioInitedRef.current = true;
      }
      initAudio();
    };
    document.addEventListener('click', onInteraction);
    document.addEventListener('touchstart', onInteraction);
    initAudio();

    return () => {
      document.removeEventListener('click', onInteraction);
      document.removeEventListener('touchstart', onInteraction);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let delay = 3000;
    const MAX_DELAY = 30000;

    const loop = async () => {
      if (cancelled) return;
      delay = (await fetchOrders()) ? Math.min(delay * 2, MAX_DELAY) : 3000;
      setTimeout(loop, delay);
    };
    loop();
    return () => { cancelled = true; };
  }, [audioEnabled]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch menu for stock management
  useEffect(() => {
    fetch('/api/menu').then(res => res.ok && res.json()).then(data => data && setMenuItems(data)).catch(() => {});
  }, []);

  const handleToggleAvailability = async (item: MenuItem, value?: boolean) => {
    try {
      const res = await fetch(`/api/menu/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: value !== undefined ? value : !item.isAvailable })
      });
      if (res.ok) {
        const data = await res.json();
        setMenuItems(prev => prev.map(m => m.id === item.id ? data.item : m));
      }
    } catch (err) {
      console.error("Failed to toggle availability:", err);
    }
  };

  const handleSetVariantStock = async (item: MenuItem, label: string, isAvailable: boolean) => {
    try {
      const res = await fetch(`/api/menu/${item.id}/variant`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, isAvailable })
      });
      if (res.ok) {
        const data = await res.json();
        setMenuItems(prev => prev.map(m => m.id === item.id ? data.item : m));
      }
    } catch (err) {
      console.error("Failed to set variant stock:", err);
    }
  };

  const handleUpdateStatus = async (orderId: string, nextStatus: OrderStatus) => {
    setIsUpdatingStatus(orderId);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      const data = await res.json();

      if (res.ok) {
        setOrders(prev =>
          prev.map(ord => ord.id === orderId ? { ...ord, status: nextStatus } : ord)
        );
        fetchOrders();
      } else {
        setError(data.error || 'Gagal memperbarui status');
      }
    } catch (err) {
      setError('Gagal memperbarui status: ' + (err as Error).message);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleCancelOrder = async (orderId: string) => {
    setIsUpdatingStatus(orderId);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev =>
          prev.map(ord => ord.id === orderId ? { ...ord, status: 'dibatalkan' as OrderStatus } : ord)
        );
        fetchOrders();
      } else {
        setError(data.error || 'Gagal membatalkan pesanan');
      }
    } catch (err) {
      setError('Gagal membatalkan pesanan: ' + (err as Error).message);
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.filter(ord => ord.id !== orderId));
      } else {
        setError(data.error || 'Gagal menghapus pesanan');
      }
    } catch (err) {
      setError('Gagal menghapus pesanan: ' + (err as Error).message);
    }
  };

  const handleCancelItem = async (orderId: string, it: Order['items'][number]) => {
    try {
      const qs = it.variant ? `?variant=${encodeURIComponent(it.variant)}` : '';
      const res = await fetch(`/api/orders/${orderId}/items/${it.menuId}/cancel${qs}`, {
        method: 'PUT'
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        }
      }
    } catch (err) {
      console.error("Failed to cancel item:", err);
    }
  };

  const handleDeleteItem = async (orderId: string, it: Order['items'][number]) => {
    try {
      const qs = it.variant ? `?variant=${encodeURIComponent(it.variant)}` : '';
      const res = await fetch(`/api/orders/${orderId}/items/${it.menuId}${qs}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.order) {
          setOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        }
      }
    } catch (err) {
      console.error("Failed to delete item:", err);
    }
  };

  const handleOpenAddItemModal = async (order: Order) => {
    setAddItemModalOrder(order);
    setItemQuantities({});
    try {
      const res = await fetch('/api/menu');
      if (res.ok) {
        const data: MenuItem[] = await res.json();
        setMenuItems(data);
      }
    } catch (err) {
      console.error("Failed to fetch menu:", err);
    }
  };

  const handleAddItems = async () => {
    if (!addItemModalOrder) return;
    const items = Object.entries(itemQuantities)
      .filter(([_, qty]) => (qty as number) > 0)
      .map(([key, quantity]) => {
        const [menuId, variant] = key.split('::');
        return variant ? { menuId, variant, quantity } : { menuId, quantity };
      });

    if (items.length === 0) return;

    setIsAddingItems(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${addItemModalOrder.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const updatedOrder: Order = data.order;
        setOrders(prev => prev.map(o => o.id === addItemModalOrder.id ? updatedOrder : o));
        setAddItemModalOrder(null);
      } else {
        setError(data.error || 'Gagal menambahkan item ke pesanan');
      }
    } catch (err) {
      setError('Gagal menambahkan item: ' + (err as Error).message);
      console.error("Failed to add items:", err);
    } finally {
      setIsAddingItems(false);
    }
  };

  // Calculations for cashier statistics (Today Only)
  const getTodayStats = () => {
    const todayStr = new Date().toDateString();
    const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);
    
    const completedOrders = todayOrders.filter(o => o.status === 'selesai');
    const revenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);
    const qrisCount = completedOrders.filter(o => o.paymentMethod === 'qris').length;
    const cashCount = completedOrders.filter(o => o.paymentMethod === 'cash').length;

    // Menu sold counts
    const menuSold: { [name: string]: number } = {};
    completedOrders.forEach(o => {
      o.items.forEach(it => {
        menuSold[it.name] = (menuSold[it.name] || 0) + it.quantity;
      });
    });

    const topItems = Object.entries(menuSold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      revenue,
      completedCount: completedOrders.length,
      pendingCount: todayOrders.filter(o => o.status === 'menunggu_verifikasi').length,
      qrisCount,
      cashCount,
      topItems
    };
  };

  const todayStats = getTodayStats();

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'menunggu_verifikasi':
        return <span className="bg-yellow-50 text-yellow-700 border border-yellow-250 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Menunggu Verifikasi</span>;
      case 'diproses':
        return <span className="bg-brand-badge-bg text-brand-forest border border-brand-badge-border text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Diproses</span>;
      case 'siap_diambil':
        return <span className="bg-blue-50 text-blue-700 border border-blue-150 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Siap Diambil</span>;
      case 'selesai':
        return <span className="bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Selesai</span>;
      case 'dibatalkan':
        return <span className="bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">Dibatalkan</span>;
    }
  };

  // Filter orders
  const filteredOrders = orders.filter(ord => {
    const matchesFilter = filter === 'semua' || ord.status === filter;
    const matchesSearch = ord.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          ord.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          ord.tableNumber.includes(searchQuery);
    return matchesFilter && matchesSearch;
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col font-sans">
      {/* Top navbar */}
      <header className="bg-brand-deep text-white px-6 py-4 shadow-md flex justify-between items-center z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-white/10 shadow-md shrink-0">
            <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight leading-none text-white">{settings.name}</h1>
            <span className="text-[10px] text-brand-light-sage font-bold uppercase tracking-widest mt-0.5 block">Kasir Dashboard</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Sound Alert Toggle */}
          <button
            onClick={() => setAudioEnabled(!audioEnabled)}
            className={`p-2 rounded-xl border flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-all ${
              audioEnabled 
                ? 'bg-brand-forest border-brand-sage text-white' 
                : 'bg-brand-deep border-brand-forest text-brand-sage hover:text-brand-light-sage'
            }`}
            title={audioEnabled ? 'Alarm Suara Aktif' : 'Alarm Suara Mati'}
          >
            {audioEnabled ? <Volume2 size={16} /> : <Volume2 size={16} className="opacity-50 line-through" />}
            <span className="hidden sm:inline">{audioEnabled ? 'Suara ON' : 'MUTE'}</span>
          </button>

          <span className="text-xs font-bold text-brand-light-sage">{currentTime}</span>
          <span className="text-xs font-bold text-brand-light-sage hidden sm:inline">{user?.name || 'Kasir'}</span>

          <button
            onClick={onLogout}
            className="text-xs bg-brand-forest hover:bg-black text-brand-light-sage hover:text-white px-3 py-2 rounded-xl font-bold transition-all cursor-pointer border border-brand-sage/60"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 overflow-hidden">
        
        {/* Left Side: Stats and Todays Sold items */}
        <aside className="lg:col-span-1 bg-white border-r border-brand-badge-border p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-68px)]">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5 text-brand-forest">
              <Clock size={16} /> Rekap Penjualan Hari Ini
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">{new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>

          {/* Revenue card */}
          <div className="bg-gradient-to-br from-brand-forest to-brand-deep text-white p-5 rounded-2xl shadow-sm space-y-1">
            <span className="text-[10px] uppercase font-bold text-brand-light-sage tracking-wider">Pendapatan Terverifikasi</span>
            <h3 className="text-2xl font-black">{formatPrice(todayStats.revenue)}</h3>
            <div className="flex justify-between items-center text-[10px] text-brand-light-sage/80 pt-2 border-t border-brand-forest/30">
              <span>QRIS: {todayStats.qrisCount} trx</span>
              <span>Tunai: {todayStats.cashCount} trx</span>
            </div>
          </div>

          {/* Count Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-brand-badge-bg/40 p-3.5 rounded-xl border border-brand-badge-border/50">
              <span className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">Antrean Baru</span>
              <span className="text-2xl font-black text-yellow-600 flex items-center gap-1">
                {todayStats.pendingCount}
                {(todayStats.pendingCount > 0 || newOrderFlash) && (
                  <span className={`w-2 h-2 rounded-full ${newOrderFlash ? 'bg-green-500 scale-150' : 'bg-yellow-500'} animate-ping`} />
                )}
              </span>
            </div>
            <div className="bg-brand-badge-bg/40 p-3.5 rounded-xl border border-brand-badge-border/50">
              <span className="block text-slate-500 text-[10px] font-bold uppercase tracking-wider">Selesai Hari Ini</span>
              <span className="text-2xl font-black text-brand-forest">{todayStats.completedCount}</span>
            </div>
          </div>

          {/* Top Selling Items */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Top Menu Terlaris Hari Ini</h3>
            {todayStats.topItems.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium italic">Belum ada transaksi selesai hari ini.</p>
            ) : (
              <div className="space-y-2">
                {todayStats.topItems.map(([name, qty], idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="font-bold text-slate-800 truncate pr-2">{idx + 1}. {name}</span>
                    <span className="bg-brand-badge-bg text-brand-forest font-extrabold px-2 py-0.5 rounded-md text-[10px]">
                      {qty} terjual
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Notification Sound */}
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 size={14} /> Suara Notif Custom
            </h3>
            <div className="space-y-2">
              <label className="block text-[10px] text-slate-500 font-medium">
                Upload file audio (MP3/WAV, maks 500KB)
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 500 * 1024) {
                    setError('File terlalu besar! Maks 500KB.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    setCustomSound(dataUrl);
                    setError('');
                  };
                  reader.readAsDataURL(file);
                }}
                className="w-full text-[10px] text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-bold file:bg-brand-forest file:text-white hover:file:bg-brand-deep cursor-pointer"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    initAudio();
                    playNotificationOrCustomSound();
                  }}
                  className="flex-1 text-[10px] bg-brand-badge-bg border border-brand-badge-border text-brand-forest font-bold py-1.5 rounded-lg hover:bg-brand-badge-bg/80 transition-all cursor-pointer"
                >
                  Test Suara {getCustomSound() ? '(Custom)' : '(Default)'}
                </button>
                {getCustomSound() && (
                  <button
                    onClick={() => {
                      clearCustomSound();
                    }}
                    className="text-[10px] bg-red-50 border border-red-200 text-red-600 font-bold py-1.5 px-3 rounded-lg hover:bg-red-100 transition-all cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
              {getCustomSound() ? (
                <p className="text-[10px] text-green-600 font-medium">Suara custom aktif</p>
              ) : (
                <p className="text-[10px] text-slate-400 font-medium">Default: nada bawaan sistem</p>
              )}
            </div>
          </div>
        </aside>

        {/* Right Side: Main orders view */}
        <main className="lg:col-span-3 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-68px)]">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 font-bold">
              <span>{error}</span>
            </div>
          )}
          {newOrderFlash && (
            <div className="p-3.5 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs flex items-center gap-2 font-bold animate-pulse">
              <Bell size={16} className="text-green-600" /> Pesanan Baru Masuk!
            </div>
          )}
          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
            {/* Tab filters */}
            <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
              {[
                { id: 'semua', label: 'Semua Pesanan' },
                { id: 'menunggu_verifikasi', label: 'Menunggu Verifikasi' },
                { id: 'diproses', label: 'Diproses' },
                { id: 'siap_diambil', label: 'Siap Diambil' },
                { id: 'selesai', label: 'Selesai' },
                { id: 'stok', label: 'Stok Menu' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    filter === tab.id
                      ? 'bg-white text-brand-forest shadow-sm'
                      : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50/50'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="w-full md:w-64 bg-white rounded-xl p-2.5 flex items-center gap-2 border border-slate-200">
              <Search className="text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Cari nama, ID, meja..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full focus:outline-none text-slate-700 text-xs font-medium"
              />
            </div>
          </div>

          {/* Stok Menu Panel */}
          {filter === 'stok' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1.5 rounded-lg border border-green-200">
                  Tersedia: {menuItems.filter(m => m.variants && m.variants.length ? m.variants.some(v => v.isAvailable !== false) : m.isAvailable).length}
                </span>
                <span className="text-xs font-bold bg-red-100 text-red-600 px-3 py-1.5 rounded-lg border border-red-200">
                  Habis: {menuItems.filter(m => m.variants && m.variants.length ? m.variants.every(v => v.isAvailable === false) : !m.isAvailable).length}
                </span>
              </div>
              {(() => {
                const stockList = menuItems.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));
                if (stockList.length === 0) {
                  return (
                    <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 text-slate-500 shadow-sm">
                      <p className="font-bold text-slate-700 text-sm">Tidak ada menu</p>
                      <p className="text-xs text-slate-400 mt-1">Belum ada menu yang cocok dengan pencarian.</p>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {stockList.map(item => {
                      const isAvail = item.isAvailable;
                      return (
                        <div key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col justify-between">
                          <div>
                            <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-brand-badge-bg text-brand-forest">
                                {({ makanan: 'Food Menu', kudapan: 'Kudapan', dessert: 'Dessert', minuman: 'Minuman' } as any)[item.category] || item.category}
                              </span>
                              <span className="text-xs font-extrabold text-brand-forest">{formatPrice(item.price)}</span>
                            </div>
                          </div>
                          {item.variants && item.variants.length > 0 ? (
                            <div className="mt-3 space-y-2">
                              {item.variants.map(v => {
                                const vAvail = v.isAvailable !== false;
                                return (
                                  <div key={v.label} className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 w-12 shrink-0">{v.label}</span>
                                    <div className="flex gap-1.5 flex-1">
                                      <button
                                        onClick={() => handleSetVariantStock(item, v.label, true)}
                                        className={`flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${vAvail ? 'bg-green-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-green-50 hover:text-green-700 border border-slate-200 hover:border-green-300'}`}
                                      >
                                        Tersedia
                                      </button>
                                      <button
                                        onClick={() => handleSetVariantStock(item, v.label, false)}
                                        className={`flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${!vAvail ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-300'}`}
                                      >
                                        Habis
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex gap-1.5 mt-3">
                              <button
                                onClick={() => handleToggleAvailability(item, true)}
                                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${isAvail ? 'bg-green-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-green-50 hover:text-green-700 border border-slate-200 hover:border-green-300'}`}
                              >
                                Tersedia
                              </button>
                              <button
                                onClick={() => handleToggleAvailability(item, false)}
                                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${!isAvail ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600 border border-slate-200 hover:border-red-300'}`}
                              >
                                Habis
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          ) : (
          <>
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 text-slate-500 shadow-sm">
              <p className="font-bold text-slate-700 text-sm">Tidak ada pesanan</p>
              <p className="text-xs text-slate-400 mt-1">Belum ada pesanan masuk yang sesuai dengan kategori ini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {filteredOrders.map(order => (
                <div
                  key={order.id}
                  className={`bg-white rounded-2xl border shadow-sm overflow-hidden flex flex-col justify-between transition-all ${
                    order.status === 'menunggu_verifikasi' 
                      ? 'border-yellow-200 ring-2 ring-yellow-400/10 hover:shadow-yellow-200/20' 
                      : 'border-slate-100 hover:shadow-md'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-800 text-sm">{order.customerName}</span>
                        <span className="px-2 py-0.5 bg-brand-forest text-white font-extrabold text-[10px] rounded">
                          MEJA {order.tableNumber}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium block mt-1">
                        {new Date(order.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} • ID: {order.id}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {order.items.some(it => it.isCancelled) && (
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Dibatalkan
                        </span>
                      )}
                      {getStatusBadge(order.status)}
                    </div>
                  </div>

                  {/* Card Body: Items */}
                  <div className="p-4 flex-1 space-y-3.5">
                    <div className="space-y-1.5">
                      {order.items.map((it, idx) => {
                        const isActive = order.status === 'menunggu_verifikasi' || order.status === 'diproses';
                        const rawVariant = it.variant || ((it.name.match(/\(([^)]+)\)\s*$/) || [])[1] || '').trim();
                        const variantLabel = rawVariant ? rawVariant.charAt(0).toUpperCase() + rawVariant.slice(1) : '';
                        const displayName = variantLabel ? it.name.replace(/\s*\([^)]*\)\s*$/, '') : it.name;
                        const isHot = variantLabel.toLowerCase().includes('hot');
                        return (
                          <div key={idx} className={`flex justify-between text-xs ${it.isCancelled ? 'text-red-400' : 'text-slate-700'}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {!it.isCancelled && isActive && (
                                  <button
                                    onClick={() => handleCancelItem(order.id, it)}
                                    className="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0"
                                    title="Batalkan item"
                                  >
                                    <X size={12} />
                                  </button>
                                )}
                                {it.isCancelled && isActive && (
                                  <button
                                    onClick={() => handleDeleteItem(order.id, it)}
                                    className="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0"
                                    title="Hapus item"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                                <span className={it.isCancelled ? 'line-through truncate' : 'truncate'}>
                                  {displayName}
                                </span>
                                {variantLabel && (
                                  <span className={`flex-shrink-0 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${isHot ? 'bg-red-50 text-red-600 border-red-200' : 'bg-sky-50 text-sky-600 border-sky-200'}`}>
                                    {variantLabel}
                                  </span>
                                )}
                                <span className="text-slate-400 font-extrabold text-[10px] flex-shrink-0">x{it.quantity}</span>
                              </div>
                              {it.notes && (
                                <span className="text-[10px] text-slate-400 italic block ml-1 mt-0.5">Catatan: {it.notes}</span>
                              )}
                            </div>
                            <span className={`font-semibold flex-shrink-0 ${it.isCancelled ? 'text-red-300' : 'text-slate-900'}`}>
                              {formatPrice(it.price * it.quantity)}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <hr className="border-dashed border-slate-100" />

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Metode Bayar</span>
                      <span className="text-xs uppercase font-extrabold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                        {order.paymentMethod}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Total Tagihan</span>
                      <span className="text-sm font-extrabold text-brand-deep">{formatPrice(order.totalPrice)}</span>
                    </div>

                    {(order.additionalAmount || 0) > 0 && (
                      <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-2 py-1.5">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] font-bold leading-tight">
                          Item tambahan — tagih {formatPrice(order.additionalAmount || 0)} saat ambil
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Action Buttons */}
                  <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                    {(order.status === 'menunggu_verifikasi' || order.status === 'diproses') && (
                      <button
                        onClick={() => handleOpenAddItemModal(order)}
                        className="flex-shrink-0 p-2 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
                        title="Tambah Item ke Pesanan"
                      >
                        <Plus size={16} />
                      </button>
                    )}

                    <div className="flex items-center justify-center flex-1 gap-2">
                      {(order.status === 'menunggu_verifikasi' || order.status === 'diproses') && (
                        <button
                          onClick={() => handleCancelOrder(order.id)}
                          disabled={isUpdatingStatus === order.id}
                          className="bg-red-500 hover:bg-red-600 disabled:bg-slate-200 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                          Batalkan Pesanan
                        </button>
                      )}

                      {order.status === 'menunggu_verifikasi' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'diproses')}
                          disabled={isUpdatingStatus === order.id}
                          className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-slate-200 text-yellow-950 font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                          <ClipboardCheck size={14} />
                          Konfirmasi Pembayaran
                        </button>
                      )}

                      {order.status === 'diproses' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'siap_diambil')}
                          disabled={isUpdatingStatus === order.id}
                          className="flex-1 bg-brand-forest hover:bg-brand-deep disabled:bg-slate-200 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                          title="Pesanan selesai dibuat. Nyalakan pager Kolmi CS101 saat menekan tombol."
                        >
                          <Play size={14} className="fill-current" />
                          Set Siap Diambil
                        </button>
                      )}

                      {order.status === 'siap_diambil' && (
                        <button
                          onClick={() => handleUpdateStatus(order.id, 'selesai')}
                          disabled={isUpdatingStatus === order.id}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                          <CheckCircle size={14} />
                          Selesaikan Pesanan
                        </button>
                      )}

                      {order.status === 'selesai' && (
                        <div className="text-brand-forest text-xs font-bold flex items-center gap-1 py-1 px-2 bg-brand-badge-bg border border-brand-badge-border rounded-lg">
                          <CheckCircle size={14} className="stroke-[2.5]" />
                          Transaksi Selesai
                        </div>
                      )}

                      {order.status === 'dibatalkan' && (
                        <button
                          onClick={() => handleDeleteOrder(order.id)}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
                        >
                          <Trash2 size={14} />
                          Hapus Pesanan
                        </button>
                      )}
                    </div>

                    {/* Struk / Printer shortcut */}
                    <button
                      onClick={() => setSelectedReceiptOrder(order)}
                      className="flex-shrink-0 p-2 bg-white hover:bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 rounded-lg transition-all cursor-pointer"
                      title="Cetak Struk Pembelian"
                    >
                      <Printer size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          </>)}

          <p className="text-center text-[10px] text-slate-400 pt-2">© {new Date().getFullYear()} {settings.name} — Semua hak cipta dilindungi.</p>
        </main>
      </div>

      {/* RECEIPT / STRUK POPUP (Aesthetic 58mm Thermal Printer Layout) */}
      <AnimatePresence>
        {selectedReceiptOrder && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-100 flex flex-col"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Printer size={14} /> Tinjauan Struk
                </span>
                <button
                  onClick={() => setSelectedReceiptOrder(null)}
                  className="p-1 bg-white hover:bg-slate-200 rounded-full border border-slate-200"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Receipt Body (Simulation of 58mm Thermal Roll) */}
              <div className="p-6 overflow-y-auto max-h-[60vh] bg-slate-50 flex justify-center">
                <div className="bg-white w-[280px] p-5 shadow-md border border-slate-100 font-mono text-[11px] text-slate-800 space-y-4 leading-normal">
                  {/* Shop name */}
                  <div className="text-center space-y-1">
                    <h4 className="font-extrabold text-sm uppercase">{settings.name}</h4>
                    <p className="text-[9px] text-slate-500">{settings.address}</p>
                    <p className="text-[9px] text-slate-500">Telp: {settings.phone}</p>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Transaction metadata */}
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between">
                      <span>No Resi:</span>
                      <span className="font-bold">{selectedReceiptOrder.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tanggal:</span>
                      <span>{new Date(selectedReceiptOrder.createdAt).toLocaleDateString('id-ID')} {new Date(selectedReceiptOrder.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Meja:</span>
                      <span className="font-bold">MEJA {selectedReceiptOrder.tableNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pelanggan:</span>
                      <span className="font-bold uppercase">{selectedReceiptOrder.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Kasir:</span>
                      <span>Budi (Sistem)</span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Itemized List */}
                  <div className="space-y-2">
                    {selectedReceiptOrder.items.map((it, idx) => (
                      <div key={idx} className="space-y-0.5">
                        <div className="flex justify-between font-bold">
                          <span>{it.name}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[10px]">
                          <span>{it.quantity} x {formatPrice(it.price).replace('Rp', '')}</span>
                          <span>{formatPrice(it.price * it.quantity).replace('Rp', '')}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Totals */}
                  <div className="space-y-1 font-bold">
                    <div className="flex justify-between text-xs">
                      <span>TOTAL:</span>
                      <span>{formatPrice(selectedReceiptOrder.totalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>Metode Bayar:</span>
                      <span className="uppercase">{selectedReceiptOrder.paymentMethod}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-brand-forest font-bold">
                      <span>Status Pembayaran:</span>
                      <span>{selectedReceiptOrder.status === 'menunggu_verifikasi'
                        ? 'BELUM LUNAS'
                        : (selectedReceiptOrder.additionalAmount || 0) > 0
                          ? 'BELUM LUNAS (TAMBAHAN)'
                          : 'LUNAS (VERIFIED)'}</span>
                    </div>
                  </div>

                  <div className="border-t border-dashed border-slate-300 my-2" />

                  {/* Receipt Footer */}
                  <div className="text-center text-[9px] text-slate-500 space-y-1">
                    <p className="font-bold">TERIMA KASIH ATAS KUNJUNGANNYA</p>
                    <p>Selamat menikmati santapan sehat bertema hijau!</p>
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="p-4 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="w-full bg-brand-forest hover:bg-brand-deep text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-xs cursor-pointer"
                >
                  <Printer size={16} />
                  Cetak Struk (Hubungkan Printer)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TAMBAH ITEM MODAL */}
      <AnimatePresence>
        {addItemModalOrder && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[80vh]"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={14} /> Tambah Item ke Pesanan
                </span>
                <button
                  onClick={() => setAddItemModalOrder(null)}
                  className="p-1 bg-white hover:bg-slate-200 rounded-full border border-slate-200"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-2">
                {error && (
                  <div className="mb-2 p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-2">
                    <AlertCircle size={14} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {menuItems.filter(m => m.isAvailable).map(menuItem => {
                  const selV = menuItem.variants && menuItem.variants.length
                    ? (menuItem.variants.find(v => v.label === (addVariants[menuItem.id] || menuItem.variants![0].label) && v.isAvailable !== false)
                      || menuItem.variants.find(v => v.isAvailable !== false)
                      || menuItem.variants[0])
                    : undefined;
                  const mKey = menuItem.variants && menuItem.variants.length
                    ? `${menuItem.id}::${(addVariants[menuItem.id] || menuItem.variants[0].label)}`
                    : menuItem.id;
                  return (
                  <div key={menuItem.id} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-bold text-slate-800 block truncate">{menuItem.name}</span>
                        <span className="text-xs text-slate-500">{formatPrice(selV ? selV.price : menuItem.price)}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <button
                          onClick={() => setItemQuantities(prev => ({
                            ...prev,
                            [mKey]: Math.max(0, (prev[mKey] || 0) - 1)
                          }))}
                          className="w-7 h-7 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-600 hover:bg-slate-100 cursor-pointer font-bold text-sm"
                        >
                          -
                        </button>
                        <span className="w-8 text-center font-bold text-sm text-slate-800">{itemQuantities[mKey] || 0}</span>
                        <button
                          onClick={() => setItemQuantities(prev => ({
                            ...prev,
                            [mKey]: (prev[mKey] || 0) + 1
                          }))}
                          className="w-7 h-7 bg-brand-forest text-white border border-brand-forest rounded-lg flex items-center justify-center hover:bg-brand-deep cursor-pointer font-bold text-sm"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {menuItem.variants && menuItem.variants.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {menuItem.variants.map(v => {
                          const isSel = (addVariants[menuItem.id] || menuItem.variants![0].label) === v.label;
                          const chipOut = v.isAvailable === false;
                          return (
                            <button
                              key={v.label}
                              disabled={chipOut}
                              onClick={() => setAddVariants(prev => ({ ...prev, [menuItem.id]: v.label }))}
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
                {menuItems.filter(m => m.isAvailable).length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-8 font-medium">Tidak ada menu tersedia</p>
                )}
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2">
                <button
                  onClick={() => setAddItemModalOrder(null)}
                  className="flex-1 bg-white border border-slate-200 text-slate-600 font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddItems}
                  disabled={isAddingItems || Object.values(itemQuantities).every(q => q === 0)}
                  className="flex-1 bg-brand-forest hover:bg-brand-deep disabled:bg-slate-200 text-white font-bold py-2.5 rounded-xl transition-all text-xs cursor-pointer disabled:cursor-not-allowed"
                >
                  {isAddingItems ? 'Menambah...' : 'Tambah'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
