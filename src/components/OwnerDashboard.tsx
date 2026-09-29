import React, { useState, useEffect } from 'react';
import { MenuItem, Order, CafeSettings, UserAccount, Role, MenuCategory, MenuVariant, ReportData, AppLog, MAX_TABLES } from '../types';
import { 
  TrendingUp, Users, Coffee, Settings, Plus, Edit, Trash2, Check, X, 
  MapPin, Phone, CreditCard, DollarSign, BarChart2, Calendar, FileText, 
  AlertCircle, ChevronRight, HelpCircle, Eye, Printer, LayoutGrid, CheckCircle2, Clock, RefreshCw,
  Smartphone, Monitor, Tablet, Bot, Server, Globe, ShieldCheck, Utensils, Cake, Cookie
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../utils/api';
import { compressImage } from '../utils/image';

function Row({ k, v, key }: { k: string; v: any; key?: React.Key }) {
  return (
    <div key={key} className="flex justify-between gap-2 text-xs">
      <span className="text-slate-500 font-semibold flex-shrink-0">{k}</span>
      <span className="text-slate-800 font-bold text-right break-words">{v ?? '—'}</span>
    </div>
  );
}

interface OwnerDashboardProps {
  settings: CafeSettings;
  menu: MenuItem[];
  onLogout: () => void;
  onRefreshData: () => void;
  isAdmin?: boolean;
  portalLabel?: string;
}

export default function OwnerDashboard({ settings, menu, onLogout, onRefreshData, isAdmin = false, portalLabel }: OwnerDashboardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activeTab, setActiveTab] = useState<string>('stats');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [currentTime, setCurrentTime] = useState<string>('');

  // Edit states
  const [cafeName, setCafeName] = useState<string>(settings.name);
  const [cafeAddress, setCafeAddress] = useState<string>(settings.address);
  const [cafePhone, setCafePhone] = useState<string>(settings.phone);
  const [qrisMerchant, setQrisMerchant] = useState<string>(settings.qrisMerchantName);
  const [qrisText, setQrisText] = useState<string>(settings.qrisCodeText);
  const [qrisImageUrl, setQrisImageUrl] = useState<string>(settings.qrisImageUrl || '');

  // Modal / Form states for MENU CRUD
  const [isMenuModalOpen, setIsMenuModalOpen] = useState<boolean>(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [menuFormName, setMenuFormName] = useState<string>('');
  const [menuFormCategory, setMenuFormCategory] = useState<MenuCategory>('makanan');
  const [menuFormPrice, setMenuFormPrice] = useState<string>('');
  const [menuFormDescription, setMenuFormDescription] = useState<string>('');
  const [menuFormImageUrl, setMenuFormImageUrl] = useState<string>('');
  const [menuFormAvailable, setMenuFormAvailable] = useState<boolean>(true);
  const [menuFormVariants, setMenuFormVariants] = useState<MenuVariant[]>([]);

  // Report period state
  const [reportPeriod, setReportPeriod] = useState<string>('daily');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Modal / Form states for STAFF CRUD
  const [isStaffModalOpen, setIsStaffModalOpen] = useState<boolean>(false);
  const [editingStaff, setEditingStaff] = useState<UserAccount | null>(null);
  const [staffFormUsername, setStaffFormUsername] = useState<string>('');
  const [staffFormName, setStaffFormName] = useState<string>('');
  const [staffFormRole, setStaffFormRole] = useState<Role>('kasir');
  const [staffFormEmail, setStaffFormEmail] = useState<string>('');
  const [staffFormPassword, setStaffFormPassword] = useState<string>('');
  const [showStaffPassword, setShowStaffPassword] = useState<boolean>(false);
  const [staffPasswordChanged, setStaffPasswordChanged] = useState<boolean>(false);
  const [newStaffTempPassword, setNewStaffTempPassword] = useState<string>('');

  // Ubah sandi sendiri (owner/admin)
  const [myOldPassword, setMyOldPassword] = useState<string>('');
  const [myNewPassword, setMyNewPassword] = useState<string>('');
  const [myNewPasswordConfirm, setMyNewPasswordConfirm] = useState<string>('');
  const [showMyPassword, setShowMyPassword] = useState<boolean>(false);

  // Log & Aktivitas state (khusus admin)
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('semua');

  // Akses & info server (khusus admin)
  const [accessStats, setAccessStats] = useState<{ requests: number; uniqueVisitors: number; orders: number; mobile: number; desktop: number; tablet: number; bot: number; devices: { ip: string; device: string; isBot: boolean; count: number; lastSeen: string }[] } | null>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);

  const navTabs = [
    { id: 'stats', label: 'Laporan Pendapatan', icon: <BarChart2 size={16} /> },
    { id: 'menu', label: 'Kelola Menu Cafe', icon: <Coffee size={16} /> },
    { id: 'staf', label: 'Kelola Akun Staf', icon: <Users size={16} /> },
    { id: 'qrcodes', label: 'QR Code Meja', icon: <Printer size={16} /> },
    { id: 'settings', label: 'Pengaturan Cafe', icon: <Settings size={16} /> },
    ...(isAdmin
      ? [
          { id: 'logs', label: 'Log & Aktivitas', icon: <AlertCircle size={16} /> },
          { id: 'akses', label: 'Akses Hari Ini', icon: <BarChart2 size={16} /> },
          { id: 'wrangler', label: 'Wrangler Info', icon: <Settings size={16} /> }
        ]
      : [])
  ];

  const fetchLogs = async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch('/api/logs', undefined, onLogout);
      if (res.ok) {
        const data: AppLog[] = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error("Error fetching logs:", err);
    }
  };

  const fetchAccessStats = async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch('/api/stats', undefined, onLogout);
      if (res.ok) {
        const data = await res.json();
        setAccessStats(data.today);
      }
    } catch (err) {
      console.error("Error fetching access stats:", err);
    }
  };

  const fetchServerInfo = async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch('/api/info', undefined, onLogout);
      if (res.ok) setServerInfo(await res.json());
    } catch (err) {
      console.error("Error fetching server info:", err);
    }
  };

  const levelBadge = (level: string) => {
    const map: Record<string, string> = {
      ERROR: 'bg-red-50 text-red-700 border-red-200',
      WARN: 'bg-amber-50 text-amber-700 border-amber-200',
      INFO: 'bg-emerald-50 text-emerald-700 border-emerald-200'
    };
    return `px-2 py-0.5 rounded-full text-[10px] font-bold border ${map[level] || 'bg-slate-100 text-slate-600 border-slate-200'}`;
  };

  // Load orders and users data
  const loadDashboardData = async () => {
    try {
      const ordersRes = await apiFetch('/api/orders', undefined, onLogout);
      if (ordersRes.ok) {
        const oData = await ordersRes.json();
        setOrders(oData);
      }

      const usersRes = await apiFetch('/api/users', undefined, onLogout);
      if (usersRes.ok) {
        const uData = await usersRes.json();
        setUsers(uData);
      }
    } catch (err) {
      console.error("Error loading owner dashboard stats:", err);
    }
  };

  const fetchReportData = async (period: string, startDate?: string, endDate?: string) => {
    try {
      let url = `/api/report?period=${period}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      const res = await apiFetch(url, undefined, onLogout);
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error("Error fetching report:", err);
    }
  };

  useEffect(() => {
    loadDashboardData();
    fetchReportData('daily');
    const interval = setInterval(loadDashboardData, 6000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (reportPeriod !== 'custom') {
      fetchReportData(reportPeriod);
    }
  }, [reportPeriod]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchLogs();
    const logInterval = setInterval(fetchLogs, 10000);
    return () => clearInterval(logInterval);
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAccessStats();
    fetchServerInfo();
    const interval = setInterval(() => {
      fetchAccessStats();
      fetchServerInfo();
    }, 15000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Menu Form Handler
  const openMenuModal = (item?: MenuItem) => {
    if (item) {
      setEditingMenuItem(item);
      setMenuFormName(item.name);
      setMenuFormCategory(item.category);
      setMenuFormPrice(String(item.price));
      setMenuFormDescription(item.description);
      setMenuFormImageUrl(item.imageUrl);
      setMenuFormAvailable(item.isAvailable);
      setMenuFormVariants(item.variants?.length ? item.variants.map(v => ({ ...v })) : []);
    } else {
      setEditingMenuItem(null);
      setMenuFormName('');
      setMenuFormCategory('makanan');
      setMenuFormPrice('');
      setMenuFormDescription('');
      setMenuFormImageUrl('');
      setMenuFormAvailable(true);
      setMenuFormVariants([]);
    }
    setIsMenuModalOpen(true);
    setError('');
    setSuccess('');
  };

  const handleSaveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanVariants = menuFormVariants
      .filter(v => v.label.trim() && v.price > 0)
      .map(v => ({ label: v.label.trim(), price: v.price, isAvailable: v.isAvailable !== false }));

    if (!menuFormName.trim() || (cleanVariants.length === 0 && !menuFormPrice.trim())) {
      setError('Nama menu dan harga harus diisi!');
      return;
    }

    const payload = {
      name: menuFormName.trim(),
      category: menuFormCategory,
      price: cleanVariants.length ? cleanVariants[0].price : Number(menuFormPrice),
      description: menuFormDescription.trim(),
      imageUrl: menuFormImageUrl.trim(),
      isAvailable: menuFormAvailable,
      variants: cleanVariants.length ? cleanVariants : undefined
    };

    try {
      const url = editingMenuItem ? `/api/menu/${editingMenuItem.id}` : '/api/menu';
      const method = editingMenuItem ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan menu');

      setSuccess(editingMenuItem ? 'Menu berhasil diperbarui!' : 'Menu berhasil ditambahkan!');
      onRefreshData(); // Refresh App state
      setIsMenuModalOpen(false);
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan menu');
    }
  };

  const handleDeleteMenu = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus menu ini?')) return;

    try {
      const res = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus menu');

      setSuccess('Menu berhasil dihapus!');
      onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus');
    }
  };

  // Staff Form Handler
  const openStaffModal = (staf?: UserAccount) => {
    if (staf) {
      setEditingStaff(staf);
      setStaffFormUsername(staf.username);
      setStaffFormName(staf.name);
      setStaffFormRole(staf.role);
      setStaffFormEmail(staf.email || '');
      setStaffFormPassword('');
      setShowStaffPassword(false);
      setStaffPasswordChanged(false);
    } else {
      setEditingStaff(null);
      setStaffFormUsername('');
      setStaffFormName('');
      setStaffFormRole('kasir');
      setStaffFormEmail('');
      setStaffFormPassword('');
      setShowStaffPassword(false);
      setStaffPasswordChanged(false);
    }
    setIsStaffModalOpen(true);
    setError('');
    setSuccess('');
    setNewStaffTempPassword('');
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormUsername.trim() || !staffFormName.trim()) {
      setError('Username dan Nama Lengkap harus diisi!');
      return;
    }

    const payload: any = {
      username: staffFormUsername.trim().toLowerCase(),
      name: staffFormName.trim(),
      role: staffFormRole,
      email: staffFormEmail.trim()
    };

    try {
      const url = editingStaff ? `/api/users/${editingStaff.id}` : '/api/users';
      const method = editingStaff ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan akun staf');

      // Update password separately if changed
      if (editingStaff && staffPasswordChanged && staffFormPassword.trim()) {
        const passRes = await fetch(`/api/users/${editingStaff.id}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: staffFormPassword.trim() })
        });
        if (!passRes.ok) {
          const passData = await passRes.json();
          throw new Error(passData.error || 'Gagal mengubah password');
        }
      }

      setSuccess(editingStaff ? 'Akun staf berhasil diperbarui!' : 'Akun staf berhasil dibuat!');
      loadDashboardData();
      if (!editingStaff && data.user?._tempPassword) {
        setNewStaffTempPassword(data.user._tempPassword);
        setIsStaffModalOpen(true);
      } else {
        setIsStaffModalOpen(false);
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan akun');
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (id === 'user-owner') {
      alert('Akun Owner utama tidak bisa dihapus!');
      return;
    }
    if (!confirm('Apakah Anda yakin ingin menghapus akun staf ini?')) return;

    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus akun staf');

      setSuccess('Akun staf berhasil dihapus!');
      loadDashboardData();
    } catch (err: any) {
      setError(err.message || 'Gagal menghapus');
    }
  };

  // Ubah sandi sendiri (owner/admin) — via /api/auth/password
  const handleChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!myOldPassword || !myNewPassword || !myNewPasswordConfirm) {
      setError('Semua kolom sandi wajib diisi');
      return;
    }
    if (myNewPassword !== myNewPasswordConfirm) {
      setError('Konfirmasi sandi baru tidak cocok');
      return;
    }
    if (myNewPassword.length < 3) {
      setError('Sandi baru minimal 3 karakter');
      return;
    }
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: myOldPassword, newPassword: myNewPassword })
      }, onLogout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengubah sandi');
      setSuccess('Sandi Anda berhasil diubah!');
      setMyOldPassword('');
      setMyNewPassword('');
      setMyNewPasswordConfirm('');
      setShowMyPassword(false);
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah sandi');
    }
  };

  // Settings Save Handler
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cafeName.trim(),
          address: cafeAddress.trim(),
          phone: cafePhone.trim(),
          qrisMerchantName: qrisMerchant.trim(),
          qrisCodeText: qrisText.trim(),
          qrisImageUrl: qrisImageUrl.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memperbarui pengaturan');

      setSuccess('Pengaturan Cafe berhasil diperbarui secara global!');
      onRefreshData();
    } catch (err: any) {
      setError(err.message || 'Gagal menyimpan pengaturan');
    }
  };

  // CALCULATION LOGIC FOR INCOME & METRICS
  const getOverviewMetrics = () => {
    const todayStr = new Date().toDateString();
    
    // Revenue calculations
    const completedOrders = orders.filter(o => o.status === 'selesai');
    const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === todayStr);
    
    const todayRevenue = todayOrders
      .filter(o => o.status === 'selesai')
      .reduce((sum, o) => sum + o.totalPrice, 0);

    // Let's treat all completed orders as "This Month's" because they span our mock past dates
    const monthlyRevenue = completedOrders.reduce((sum, o) => sum + o.totalPrice, 0);

    const reportCompleted = reportData?.orders?.filter(o => o.status === 'selesai') || completedOrders;
    const reportTotalRevenue = reportData?.totalRevenue ?? monthlyRevenue;
    const reportTotalOrders = reportData?.totalOrders ?? orders.length;
    const reportQrisRevenue = reportData?.qrisRevenue ?? 0;
    const reportCashRevenue = reportData?.cashRevenue ?? 0;

    // Category Sales breakdown
    let makananCount = 0;
    let minumanCount = 0;
    let kudapanCount = 0;
    let dessertCount = 0;

    reportCompleted.forEach(o => {
      o.items.forEach(it => {
        const item = menu.find(m => m.id === it.menuId);
        if (item) {
          if (item.category === 'makanan') makananCount += it.quantity;
          else if (item.category === 'minuman') minumanCount += it.quantity;
          else if (item.category === 'kudapan') kudapanCount += it.quantity;
          else if (item.category === 'dessert') dessertCount += it.quantity;
        }
      });
    });

    return {
      todayRevenue: reportData ? reportTotalRevenue : todayRevenue,
      monthlyRevenue: reportData ? reportTotalRevenue : monthlyRevenue,
      totalOrdersCount: reportData ? reportTotalOrders : orders.length,
      staffCount: users.length,
      categorySales: { makanan: makananCount, minuman: minumanCount, kudapan: kudapanCount, dessert: dessertCount },
      reportTotalRevenue,
      reportTotalOrders,
      reportQrisRevenue,
      reportCashRevenue
    };
  };

  const metrics = getOverviewMetrics();

  // Past 4 days chart data calculation (Simple Bar & Line SVG generator coordinates)
  const getChartData = () => {
    const dates = [...Array(4)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (3 - i));
      return d;
    });

    return dates.map(date => {
      const dateStr = date.toDateString();
      const dayName = date.toLocaleDateString('id-ID', { weekday: 'short' });
      const dayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === dateStr && o.status === 'selesai');
      const dailyRevenue = dayOrders.reduce((sum, o) => sum + o.totalPrice, 0);
      return { dayName, dailyRevenue };
    });
  };

  const chartData = getChartData();
  const maxRevenue = Math.max(...chartData.map(c => c.dailyRevenue), 10000);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(price);
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col lg:flex-row font-sans overflow-x-hidden">
      {/* Sidebar - hidden on mobile, visible on lg */}
      <aside className="w-64 bg-brand-deep text-white flex-col shrink-0 hidden lg:flex">
        <div className="p-6 border-b border-brand-forest flex flex-col items-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-brand-forest/20 to-transparent" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="mb-4 w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/15 shadow-xl">
              <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-white drop-shadow-lg">{settings.name}</h1>
            <p className="text-[10px] uppercase tracking-[0.15em] text-brand-light-sage mt-0.5 font-semibold opacity-80">{portalLabel || 'Management Suite'}</p>
          </div>
        </div>
        <nav className="flex-1 py-4 space-y-0.5">
          {navTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setError('');
                setSuccess('');
              }}
              className={`w-full flex items-center px-6 py-3.5 text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-brand-forest border-r-4 border-brand-sage text-white font-black'
                  : 'text-gray-300 hover:bg-brand-forest/50 hover:text-white font-medium'
              }`}
            >
              <span className="mr-3 opacity-85">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-brand-forest mt-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-brand-sage flex items-center justify-center text-xs font-bold mr-3 text-brand-deep">AD</div>
              <div>
                <p className="text-xs font-semibold text-white">{portalLabel ? 'Godmode Admin' : 'Admin Owner'}</p>
                <p className="text-[10px] text-brand-sage font-medium">System Online</p>
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full text-center text-xs bg-brand-forest hover:bg-red-900 hover:text-white text-brand-light-sage py-2 rounded-lg font-bold transition-all cursor-pointer border border-brand-forest/60"
          >
            Logout Portal
          </button>
        </div>
      </aside>

      {/* Mobile Top Navigation */}
      <div className="lg:hidden bg-brand-deep text-white px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/10 shrink-0">
            <img src="/logo.png" alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight">{settings.name}</h1>
            <span className="text-[9px] text-brand-sage font-bold uppercase tracking-widest block">{portalLabel || 'Owner Portal'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 hover:bg-brand-forest rounded-lg text-brand-light-sage cursor-pointer text-xs font-bold border border-brand-forest/60"
          >
            Menu
          </button>
          <button
            onClick={onLogout}
            className="text-[10px] bg-brand-forest/40 hover:bg-red-950 text-red-200 px-2.5 py-1.5 rounded-lg font-bold transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-brand-deep border-t border-brand-forest text-white divide-y divide-brand-forest/40">
          {navTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsMobileMenuOpen(false);
                setError('');
                setSuccess('');
              }}
              className={`w-full flex items-center px-6 py-3 text-xs font-bold transition-all cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-brand-forest text-white border-l-4 border-brand-sage'
                  : 'text-gray-300 hover:bg-brand-forest/30'
              }`}
            >
              <span className="mr-3 opacity-80">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between gap-2 px-4 md:px-8 shadow-xs">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full overflow-hidden ring-2 ring-brand-badge-border shadow-sm shrink-0 hidden sm:block">
              <img src="/logo.png" alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col min-w-0">
              <h2 className="text-base md:text-lg font-black text-gray-900 tracking-tight truncate">{settings.name}</h2>
              <p className="text-[10px] md:text-xs text-gray-500 font-medium truncate max-w-[200px] md:max-w-md">{settings.address || 'Jl. Senopati No. 42, Jakarta'}</p>
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-3 items-center justify-end min-w-0 flex-wrap">
            <div className="bg-brand-badge-bg text-brand-forest px-2.5 py-1 rounded-lg flex items-center text-[10px] md:text-xs font-bold border border-brand-badge-border shrink-0">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-1.5 animate-pulse shrink-0"></span>
              <span className="md:hidden" title="Real-time Sync Active">Sync</span>
              <span className="hidden md:inline">Real-time Sync Active</span>
            </div>
            <div className="bg-brand-badge-bg text-brand-forest px-2.5 py-1 rounded-lg flex items-center text-[10px] md:text-xs font-bold border border-brand-badge-border gap-1.5 shrink-0">
              <Clock size={14} className="shrink-0" />
              {currentTime}
            </div>
          </div>
        </header>

        {/* Inner Content Padding */}
        <div className="flex-1 p-4 md:p-6 space-y-6">
          {/* Notifications */}
          {success && (
            <div className="p-3.5 bg-brand-badge-bg border border-brand-badge-border text-brand-forest rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
              <CheckCircle2 size={16} className="text-brand-forest shrink-0" />
              <span>{success}</span>
            </div>
          )}
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2 font-bold animate-fadeIn">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

        {/* TABS CONTENT */}

        {/* TAB 1: OVERVIEW STATS & INTRADAY CUSTOM GRAPH */}
        {activeTab === 'stats' && (
          <div className="space-y-6">
            {/* Period Selector */}
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: 'daily', label: 'Hari Ini' },
                { id: 'weekly', label: 'Minggu Ini' },
                { id: 'monthly', label: 'Bulan Ini' },
                { id: 'custom', label: 'Kustom' }
              ].map(period => (
                <button
                  key={period.id}
                  onClick={() => setReportPeriod(period.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    reportPeriod === period.id
                      ? 'bg-emerald-700 text-white shadow'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {period.label}
                </button>
              ))}
              {reportPeriod === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <span className="text-xs text-slate-400">s/d</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => fetchReportData('custom', customStartDate, customEndDate)}
                    className="px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800 transition-all cursor-pointer"
                  >
                    Tampilkan
                  </button>
                </div>
              )}
            </div>

            {/* Top Cards Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              <div className="bg-gradient-to-br from-emerald-800 to-emerald-700 text-white p-5 rounded-2xl shadow-sm space-y-1">
                <span className="text-[10px] uppercase font-bold text-emerald-200 tracking-wider">Pendapatan</span>
                <h3 className="text-2xl font-black">{formatPrice(metrics.reportTotalRevenue)}</h3>
                <span className="text-[9px] text-emerald-200 block">Total revenue periode ini</span>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">QRIS</span>
                <h3 className="text-2xl font-black text-emerald-950">{formatPrice(metrics.reportQrisRevenue)}</h3>
                <span className="text-[9px] text-slate-400 block">Pembayaran via QRIS</span>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Cash</span>
                <h3 className="text-2xl font-black text-slate-800">{formatPrice(metrics.reportCashRevenue)}</h3>
                <span className="text-[9px] text-slate-400 block">Pembayaran tunai</span>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Total Pesanan</span>
                <h3 className="text-2xl font-black text-slate-800">{metrics.reportTotalOrders} orders</h3>
                <span className="text-[9px] text-slate-400 block">Periode terpilih</span>
              </div>
            </div>

            {/* Export CSV Button */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  const rows = reportData?.orders || [];
                  const csvHeader = 'ID Pesanan,Pelanggan,Meja,Items,Total,Metode,Status,Tanggal';
                  const esc = (v: any) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
                  const csvRows = rows.map(o => {
                    const items = o.items.map(it => `${it.name} x${it.quantity}`).join('; ');
                    return [o.id, o.customerName, o.tableNumber, items, o.totalPrice, o.paymentMethod, o.status, new Date(o.createdAt).toLocaleString('id-ID')].map(esc).join(',');
                  });
                  const csv = '\uFEFF' + [csvHeader, ...csvRows].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const link = document.createElement('a');
                  link.href = URL.createObjectURL(blob);
                  link.download = `laporan-${reportPeriod}-${new Date().toISOString().split('T')[0]}.csv`;
                  link.click();
                  URL.revokeObjectURL(link.href);
                }}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <FileText size={14} /> Export CSV
              </button>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Sales Trend Area Chart (SVG rendered) */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Tren Penjualan 4 Hari Terakhir</h3>
                  <p className="text-xs text-slate-400">Akumulasi pendapatan harian cafe</p>
                </div>

                {/* SVG Area Chart */}
                <div className="h-64 w-full flex items-end justify-between pt-6 px-4 relative">
                  {/* Grid Lines helper */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none border-b border-slate-100 py-6">
                    <div className="border-t border-slate-100 w-full text-[9px] text-slate-400 text-right pr-2"></div>
                    <div className="border-t border-slate-100 w-full"></div>
                    <div className="border-t border-slate-100 w-full"></div>
                  </div>

                  {/* SVG Line / Path drawing */}
                  <svg className="absolute inset-0 h-full w-full px-12 py-6 overflow-visible" viewBox="0 0 400 150">
                    {/* Render Area fill */}
                    <path
                      d={`M 10 150 
                          L 10 ${150 - (chartData[0].dailyRevenue / maxRevenue) * 120} 
                          L 130 ${150 - (chartData[1].dailyRevenue / maxRevenue) * 120} 
                          L 260 ${150 - (chartData[2].dailyRevenue / maxRevenue) * 120} 
                          L 390 ${150 - (chartData[3].dailyRevenue / maxRevenue) * 120} 
                          L 390 150 Z`}
                      fill="url(#emeraldGradient)"
                      opacity="0.15"
                    />

                    {/* Render Stroke line */}
                    <path
                      d={`M 10 ${150 - (chartData[0].dailyRevenue / maxRevenue) * 120} 
                          L 130 ${150 - (chartData[1].dailyRevenue / maxRevenue) * 120} 
                          L 260 ${150 - (chartData[2].dailyRevenue / maxRevenue) * 120} 
                          L 390 ${150 - (chartData[3].dailyRevenue / maxRevenue) * 120}`}
                      fill="none"
                      stroke="#047857"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                    />

                    {/* Gradient Definitions */}
                    <defs>
                      <linearGradient id="emeraldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#047857" />
                        <stop offset="100%" stopColor="#ffffff" />
                      </linearGradient>
                    </defs>

                    {/* Dot overlays */}
                    {[
                      { cx: 10, cy: 150 - (chartData[0].dailyRevenue / maxRevenue) * 120 },
                      { cx: 130, cy: 150 - (chartData[1].dailyRevenue / maxRevenue) * 120 },
                      { cx: 260, cy: 150 - (chartData[2].dailyRevenue / maxRevenue) * 120 },
                      { cx: 390, cy: 150 - (chartData[3].dailyRevenue / maxRevenue) * 120 }
                    ].map((dot, idx) => (
                      <g key={idx}>
                        <circle cx={dot.cx} cy={dot.cy} r="6" fill="#047857" />
                        <circle cx={dot.cx} cy={dot.cy} r="3" fill="#ffffff" />
                      </g>
                    ))}
                  </svg>

                  {/* Bottom Labels */}
                  {chartData.map((d, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center z-10">
                      <span className="font-extrabold text-emerald-800 text-[11px] mb-1">
                        {formatPrice(d.dailyRevenue).replace('Rp', '')}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold uppercase">{d.dayName}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Category sold distribution (Custom Visual list block) */}
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-5">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">Kategori Paling Diminati</h3>
                  <p className="text-xs text-slate-400">Total item terkirim per kategori</p>
                </div>

                <div className="space-y-4 pt-2">
                  {[
                    { label: 'Food Menu', count: metrics.categorySales.makanan, color: 'bg-red-500', bg: 'bg-red-50' },
                    { label: 'Kudapan', count: metrics.categorySales.kudapan, color: 'bg-amber-500', bg: 'bg-amber-50' },
                    { label: 'Dessert', count: metrics.categorySales.dessert, color: 'bg-purple-500', bg: 'bg-purple-50' },
                    { label: 'Minuman', count: metrics.categorySales.minuman, color: 'bg-blue-500', bg: 'bg-blue-50' }
                  ].map((cat, idx) => {
                    const total = metrics.categorySales.makanan + metrics.categorySales.minuman + metrics.categorySales.kudapan + metrics.categorySales.dessert || 1;
                    const percent = Math.round((cat.count / total) * 100);

                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>{cat.label}</span>
                          <span>{cat.count} porsi ({percent}%)</span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${cat.color} rounded-full`} style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="bg-emerald-50/50 p-3.5 border border-emerald-100/40 rounded-xl">
                  <p className="text-[10px] font-bold text-emerald-800 leading-normal">
                    💡 Insight Cafe: Pasang strategi bundling (Makanan + Minuman) dengan harga hemat untuk melipatgandakan omset bulanan Anda!
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: MENU CRUD MANAGEMENT */}
        {activeTab === 'menu' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Katalog Menu Cafe</h2>
                <p className="text-xs text-slate-400">Tambah, ubah ketersediaan, atau hapus menu makanan & minuman</p>
              </div>
              <button
                onClick={() => openMenuModal()}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1"
              >
                <Plus size={14} /> Tambah Menu Baru
              </button>
            </div>

            {/* Menu List Table / Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {menu.map(item => (
                <div key={item.id} className="bg-white rounded-2xl border border-slate-150 p-4 flex gap-3.5 shadow-sm">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-20 h-20 rounded-xl object-cover bg-slate-50 border border-slate-100"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-100 text-slate-300">
                      {item.category === 'makanan' ? <Utensils size={26} strokeWidth={1.6} /> : item.category === 'kudapan' ? <Cookie size={26} strokeWidth={1.6} /> : item.category === 'dessert' ? <Cake size={26} strokeWidth={1.6} /> : <Coffee size={26} strokeWidth={1.6} />}
                    </div>
                  )}
                  
                  <div className="flex-1 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex justify-between items-start gap-1">
                        <h4 className="font-bold text-slate-800 text-sm leading-tight truncate">{item.name}</h4>
                        <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                          item.category === 'makanan' ? 'bg-red-50 text-red-600' :
                          item.category === 'minuman' ? 'bg-blue-50 text-blue-600' :
                          item.category === 'kudapan' ? 'bg-amber-50 text-amber-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {item.category === 'makanan' ? 'Food Menu' : item.category === 'minuman' ? 'Minuman' : item.category === 'kudapan' ? 'Kudapan' : 'Dessert'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1 leading-snug">{item.description}</p>
                      {item.variants && item.variants.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {item.variants.map(v => {
                            const vOut = v.isAvailable === false;
                            return (
                              <span key={v.label} className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${vOut ? 'bg-red-50 text-red-500 line-through' : 'bg-emerald-50 text-emerald-700'}`}>
                                {v.label}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-50">
                      <span className="font-extrabold text-slate-800 text-xs">{formatPrice(item.price)}</span>
                      
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openMenuModal(item)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 rounded-lg transition-all"
                          title="Edit Menu"
                        >
                          <Edit size={12} />
                        </button>
                        <button
                          onClick={() => handleDeleteMenu(item.id)}
                          className="p-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-all"
                          title="Hapus Menu"
                        >
                          <Trash2 size={12} />
                        </button>

                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          item.isAvailable ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {item.isAvailable ? 'Tersedia' : 'Habis'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: STAFF CRUD (KASIR / WAITER MANAGEMENT) */}
        {activeTab === 'staf' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Manajemen Akun Staf</h2>
                <p className="text-xs text-slate-400">Kelola akses, edit username, atau tambah akun staf baru</p>
              </div>
              <button
                onClick={() => openStaffModal()}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs py-2 px-4 rounded-xl shadow transition-all cursor-pointer flex items-center gap-1"
              >
                <Plus size={14} /> Tambah Staf Baru
              </button>
            </div>

            {/* Staff list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <th className="p-4">Nama Lengkap</th>
                      <th className="p-4">Username Login</th>
                      <th className="p-4">Peran (Hak Akses)</th>
                      <th className="p-4">Kata Sandi Standar</th>
                      <th className="p-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-slate-50/40">
                        <td className="p-4 font-bold text-slate-800">{u.name}</td>
                        <td className="p-4"><code className="bg-slate-100 px-2 py-0.5 rounded text-red-600 font-mono text-[11px]">{u.username}</code></td>
                        <td className="p-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            u.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                            u.role === 'admin' ? 'bg-red-100 text-red-800' :
                            u.role === 'kasir' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-850'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400 font-medium">
                          {u.role}123 <span className="text-[10px] text-slate-400/70">(cth: {u.role}123)</span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => openStaffModal(u)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-950 rounded-lg transition-all"
                              title="Edit Staf"
                            >
                              <Edit size={12} />
                            </button>
                            {u.id !== 'user-owner' && (
                              <button
                                onClick={() => handleDeleteStaff(u.id)}
                                className="p-1.5 bg-slate-100 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-lg transition-all"
                                title="Hapus Staf"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                            {u.id === 'user-owner' && (
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sistem Utama</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TABLE QR CODE GENERATOR */}
        {activeTab === 'qrcodes' && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Generate QR Code Meja Cafe</h2>
              <p className="text-xs text-slate-400">Cetak kartu QR Code di bawah untuk diletakkan di meja cafe pelanggan (Meja 1 - {MAX_TABLES})</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
              {[...Array(MAX_TABLES)].map((_, i) => {
                const tableNum = String(i + 1);
                // URL customer selalu ke halaman utama (root) + nomor meja.
                // JANGAN pakai window.location.pathname (bisa /staff, /admin, /godmode
                // saat owner membuka halaman ini -> QR jadi salah alamat).
                const customerUrl = `${window.location.origin}/?table=${tableNum}`;
                
                return (
                  <div key={tableNum} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between text-center">
                    <div className="bg-emerald-900 text-emerald-100 p-3 font-extrabold text-xs uppercase tracking-wider">
                      MEJA NOMOR {tableNum}
                    </div>

                    <div className="p-5 flex flex-col items-center justify-center space-y-3">
                      <div className="w-32 h-32 bg-slate-50 rounded-lg border border-slate-100 p-1 flex items-center justify-center">
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(customerUrl)}`}
                          alt={`QR Code Meja ${tableNum}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full"
                        />
                      </div>
                      
                      <p className="text-[9px] text-slate-400 font-semibold truncate w-full" title={customerUrl}>
                        {customerUrl}
                      </p>
                    </div>

                    <div className="p-2.5 bg-slate-50 border-t border-slate-100">
                      <button
                        onClick={() => {
                          const printWindow = window.open('', '_blank');
                          if (printWindow) {
                            printWindow.document.write(`
                              <html>
                                <head>
                                  <title>Cetak QR Code Meja ${tableNum}</title>
                                  <style>
                                    body { font-family: sans-serif; text-align: center; padding: 50px; }
                                    .card { border: 4px solid #064e3b; border-radius: 20px; padding: 40px; display: inline-block; max-width: 300px; }
                                    h1 { color: #064e3b; margin-bottom: 5px; font-size: 24px; }
                                    p { color: #475569; font-size: 14px; margin-top: 5px; }
                                    .qr { margin: 30px 0; }
                                    .table { background: #064e3b; color: white; font-weight: bold; font-size: 28px; padding: 10px 20px; border-radius: 10px; display: inline-block; }
                                  </style>
                                </head>
                                <body>
                                  <div class="card">
                                    <h1>${settings.name}</h1>
                                    <p>Scan QR ini untuk memesan langsung dari HP Anda!</p>
                                    <div class="qr">
                                      <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(customerUrl)}" style="width: 200px; height: 200px;" />
                                    </div>
                                    <div class="table">MEJA ${tableNum}</div>
                                  </div>
                                  <script>window.onload = function() { window.print(); }</script>
                                </body>
                              </html>
                            `);
                            printWindow.document.close();
                          }
                        }}
                        className="w-full bg-white hover:bg-slate-100 border border-slate-250 text-slate-600 font-bold py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Printer size={12} /> Cetak Kartu Meja
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 5: SYSTEM SETTINGS */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
            <div>
              <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Pengaturan Cafe & QRIS</h2>
              <p className="text-xs text-slate-400">Sesuaikan profil cafe, alamat, nomor telepon, dan data merchant QRIS Anda</p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-semibold">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-slate-500 uppercase tracking-wider">Nama Cafe / Toko</label>
                  <input
                    type="text"
                    value={cafeName}
                    onChange={(e) => setCafeName(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    placeholder="cth: Salad Yook"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-slate-500 uppercase tracking-wider">Alamat Cafe Lengkap</label>
                  <textarea
                    value={cafeAddress}
                    onChange={(e) => setCafeAddress(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    placeholder="Jl. Lembah Pinus No. 12, Bandung"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">No Telepon / WhatsApp</label>
                  <input
                    type="text"
                    value={cafePhone}
                    onChange={(e) => setCafePhone(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    placeholder="0812-3456-7890"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Nama Merchant QRIS</label>
                  <input
                    type="text"
                    value={qrisMerchant}
                    onChange={(e) => setQrisMerchant(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    placeholder="SALAD YOOK"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-slate-500 uppercase tracking-wider">Upload Gambar QRIS</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        setError('File terlalu besar! Maks 5MB.');
                        return;
                      }
                      try {
                        const dataUrl = await compressImage(file);
                        setQrisImageUrl(dataUrl);
                      } catch (err) {
                        setError('Gagal memproses gambar QRIS');
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs"
                  />
                  {qrisImageUrl && (
                    <div className="mt-2">
                      <img src={qrisImageUrl} alt="QRIS Preview" className="w-32 h-32 object-contain rounded-xl border border-slate-200" />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5 col-span-2">
                  <label className="text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    Payload Text QRIS Nasional
                  </label>
                  <input
                    type="text"
                    value={qrisText}
                    onChange={(e) => setQrisText(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-[10px] text-slate-800"
                    placeholder="String standard QRIS..."
                  />
                  <p className="text-[10px] text-slate-400 font-normal leading-normal">
                    *Masukkan data payload QRIS Statis merchant Anda dari Bank/E-Wallet. Sistem akan otomatis merekonstruksinya menjadi QR Code yang siap discan pelanggan.
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5 text-right">
                <button
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-6 rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Check size={16} /> Simpan Pengaturan Cafe
                </button>
              </div>
            </form>

            {/* Ubah Sandi Saya */}
            <div className="border-t border-slate-100 pt-6">
              <h2 className="font-bold text-slate-800 text-sm uppercase tracking-tight mb-1">Ubah Sandi Saya</h2>
              <p className="text-xs text-slate-400 mb-4">Ganti sandi untuk login akun Anda sendiri.</p>
              <form onSubmit={handleChangeMyPassword} className="space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Sandi Lama</label>
                  <input
                    type="password"
                    value={myOldPassword}
                    onChange={(e) => setMyOldPassword(e.target.value)}
                    placeholder="Sandi saat ini"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Sandi Baru</label>
                    <div className="relative">
                      <input
                        type={showMyPassword ? 'text' : 'password'}
                        value={myNewPassword}
                        onChange={(e) => setMyNewPassword(e.target.value)}
                        placeholder="Sandi baru"
                        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowMyPassword(!showMyPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        tabIndex={-1}
                      >
                        {showMyPassword ? <Eye size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Konfirmasi Sandi Baru</label>
                    <input
                      type={showMyPassword ? 'text' : 'password'}
                      value={myNewPasswordConfirm}
                      onChange={(e) => setMyNewPasswordConfirm(e.target.value)}
                      placeholder="Ulangi sandi baru"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    />
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-4 text-right">
                  <button
                    type="submit"
                    className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 px-5 rounded-xl shadow transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Check size={16} /> Ubah Sandi
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {activeTab === 'logs' && isAdmin && (
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Log & Aktivitas</h2>
                <p className="text-xs text-slate-400">Pemantauan error dan aktivitas penting sistem secara real-time.</p>
              </div>
              <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl self-start">
                {[
                  { id: 'semua', label: 'Semua' },
                  { id: 'ERROR', label: 'Error' },
                  { id: 'WARN', label: 'Warning' },
                  { id: 'INFO', label: 'Info' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setLogLevelFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      logLevelFilter === f.id
                        ? 'bg-white text-brand-forest shadow-sm'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50/50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">200 entri terakhir • auto-refresh 10 dtk</span>
                <button
                  onClick={fetchLogs}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw size={12} /> Muat Ulang
                </button>
              </div>
              <div className="divide-y divide-slate-100 max-h-[65vh] overflow-y-auto">
                {logs.filter(l => logLevelFilter === 'semua' || l.level === logLevelFilter).length === 0 ? (
                  <p className="p-10 text-center text-slate-400 text-sm font-medium">Belum ada log.</p>
                ) : logs.filter(l => logLevelFilter === 'semua' || l.level === logLevelFilter).map(log => (
                  <div key={log.id} className="p-3.5 flex items-start gap-3">
                    <span className={`flex-shrink-0 ${levelBadge(log.level)}`}>{log.level}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800 break-words leading-snug">{log.message}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(log.createdAt).toLocaleString('id-ID')}</p>
                      {log.meta && log.meta !== '{}' && (
                        <pre className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-2 mt-1 overflow-x-auto whitespace-pre-wrap break-words">{log.meta}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'akses' && isAdmin && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Akses Hari Ini</h2>
              <p className="text-xs text-slate-400">Statistik pengunjung web hari ini, dipecah per perangkat dan manusia/AI. Auto-refresh 15 detik.</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Total Request</span>
                <h3 className="text-2xl font-black text-brand-deep">{accessStats?.requests ?? 0}</h3>
                <span className="text-[9px] text-slate-400 block">Semua permintaan ke API</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Pengunjung Unik</span>
                <h3 className="text-2xl font-black text-brand-deep">{accessStats?.uniqueVisitors ?? 0}</h3>
                <span className="text-[9px] text-slate-400 block">IP unik hari ini</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Pesanan Hari Ini</span>
                <h3 className="text-2xl font-black text-brand-deep">{accessStats?.orders ?? 0}</h3>
                <span className="text-[9px] text-slate-400 block">Order masuk hari ini</span>
              </div>
              <div className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm space-y-1">
                <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">Bot / AI</span>
                <h3 className="text-2xl font-black text-red-500">{accessStats?.bot ?? 0}</h3>
                <span className="text-[9px] text-slate-400 block">Diakses oleh mesin/AI</span>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Globe size={15} className="text-brand-forest" /> Perangkat Pengunjung
                </h3>
                {(() => {
                  const t = (accessStats?.mobile ?? 0) + (accessStats?.desktop ?? 0) + (accessStats?.tablet ?? 0);
                  const pct = (v: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
                  const rows = [
                    { label: 'HP / Smartphone', icon: <Smartphone size={14} />, val: accessStats?.mobile ?? 0, cls: 'bg-emerald-500' },
                    { label: 'Laptop / Komputer', icon: <Monitor size={14} />, val: accessStats?.desktop ?? 0, cls: 'bg-blue-500' },
                    { label: 'Tablet', icon: <Tablet size={14} />, val: accessStats?.tablet ?? 0, cls: 'bg-purple-500' }
                  ];
                  return (
                    <div className="space-y-3">
                      {rows.map(r => (
                        <div key={r.label}>
                          <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                            <span className="flex items-center gap-1.5">{r.icon} {r.label}</span>
                            <span>{r.val} <span className="text-slate-400 font-medium">({pct(r.val)}%)</span></span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${r.cls} rounded-full transition-all`} style={{ width: `${pct(r.val)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-brand-forest" /> Manusia vs AI / Bot
                </h3>
                {(() => {
                  const bot = accessStats?.bot ?? 0;
                  const human = Math.max(0, (accessStats?.requests ?? 0) - bot);
                  const t = human + bot;
                  const pct = (v: number) => (t > 0 ? Math.round((v / t) * 100) : 0);
                  const rows = [
                    { label: 'Manusia', icon: <Users size={14} />, val: human, cls: 'bg-emerald-500' },
                    { label: 'AI / Bot / Script', icon: <Bot size={14} />, val: bot, cls: 'bg-red-500' }
                  ];
                  return (
                    <div className="space-y-3">
                      {rows.map(r => (
                        <div key={r.label}>
                          <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                            <span className="flex items-center gap-1.5">{r.icon} {r.label}</span>
                            <span>{r.val} <span className="text-slate-400 font-medium">({pct(r.val)}%)</span></span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full ${r.cls} rounded-full transition-all`} style={{ width: `${pct(r.val)}%` }} />
                          </div>
                        </div>
                      ))}
                      <p className="text-[10px] text-slate-400 pt-1 leading-relaxed">AI/script terdeteksi dari User-Agent (bot, crawler, curl, python, Playwright, dll).</p>
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-3">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-1.5">
                <Smartphone size={15} className="text-brand-forest" /> Detail Perangkat (per IP)
              </h3>
              <p className="text-[10px] text-slate-400">Label perangkat terdeteksi dari User-Agent tiap IP unik, diurutkan dari request terbanyak.</p>
              {!accessStats?.devices?.length ? (
                <p className="text-xs text-slate-400 italic">Belum ada data perangkat.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {accessStats.devices.slice(0, 20).map((d, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] bg-slate-100 rounded px-1.5 py-0.5 text-slate-600">{d.ip}</span>
                        {d.isBot && (
                          <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full uppercase">Bot</span>
                        )}
                      </div>
                      <span className="font-semibold text-slate-700 truncate">{d.device}</span>
                      <span className="text-slate-400 font-bold">{(d.count || 0).toLocaleString('id-ID')}×</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400">Menampilkan 20 IP tersibuk dari hari ini.</p>
            </div>
          </div>
        )}

        {activeTab === 'wrangler' && isAdmin && (
          <div className="space-y-4">
            <div>
              <h2 className="font-bold text-slate-800 text-lg uppercase tracking-tight flex items-center gap-1.5">
                <Server size={18} className="text-brand-forest" /> Wrangler / Server Info
              </h2>
              <p className="text-xs text-slate-400">Konfigurasi worker & informasi request dari Cloudflare. Auto-refresh 15 detik.</p>
            </div>

            {serverInfo ? (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Aplikasi</h4>
                  <Row k="Nama Worker" v={serverInfo.app?.name} />
                  <Row k="Versi" v={serverInfo.app?.version} />
                  <Row k="Entry file" v={serverInfo.app?.main} />
                  {serverInfo.app?.compatibilityDate && <Row k="Compatibility Date" v={serverInfo.app?.compatibilityDate} />}
                  {serverInfo.app?.node && <Row k="Node.js" v={serverInfo.app?.node} />}
                  {serverInfo.app?.platform && <Row k="Platform" v={`${serverInfo.app?.platform} (${serverInfo.app?.arch})`} />}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Binding & Environment</h4>
                  {Array.isArray(serverInfo.bindings) && (
                    serverInfo.bindings.map(b => <Row key={b} k="Binding" v={b} />)
                  )}
                  <Row k="APP_URL" v={serverInfo.env?.APP_URL} />
                  <Row k="JWT_SECRET" v={serverInfo.env?.JWT_SECRET} />
                  {serverInfo.port != null && <Row k="Port" v={serverInfo.port} />}
                  {serverInfo.uptimeSec != null && <Row k="Uptime" v={`${Math.round((serverInfo.uptimeSec ?? 0) / 60)} menit`} />}
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Waktu Server</h4>
                  <Row k="Server Time" v={serverInfo.serverTime ? new Date(serverInfo.serverTime).toLocaleString('id-ID') : '—'} />
                </div>

                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5 space-y-2.5">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Request Saat Ini (Cloudflare)</h4>
                  {serverInfo.request?.colo ? (
                    <>
                      <Row k="Datacenter (Colo)" v={serverInfo.request?.colo} />
                      <Row k="Kota" v={serverInfo.request?.city} />
                      <Row k="Negara" v={serverInfo.request?.country} />
                      <Row k="Wilayah" v={serverInfo.request?.region} />
                      <Row k="ASN" v={serverInfo.request?.asn} />
                      <Row k="Organisasi" v={serverInfo.request?.asOrganization} />
                      <Row k="HTTP" v={serverInfo.request?.httpProtocol} />
                      <Row k="TLS" v={serverInfo.request?.tlsVersion ? `${serverInfo.request.tlsVersion} / ${serverInfo.request.tlsCipher}` : '—'} />
                      <Row k="RTT Klien" v={serverInfo.request?.clientTcpRtt != null ? `${serverInfo.request.clientTcpRtt} ms` : '—'} />
                      <Row k="Zona Waktu" v={serverInfo.request?.timezone} />
                      <Row k="Bot Management" v={serverInfo.request?.bot ? `skor ${serverInfo.request.bot.score}${serverInfo.request.bot.verifiedBot ? ' (verified)' : ''}` : '—'} />
                    </>
                  ) : (
                    <Row k="IP Klien (Express)" v={serverInfo.request?.ip} />
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400 bg-white rounded-2xl border border-slate-200/60 p-8 text-center">Memuat info server...</p>
            )}
          </div>
        )}

        </div>

        <p className="text-center text-[10px] text-slate-400 pb-4">© {new Date().getFullYear()} {settings.name} — Semua hak cipta dilindungi.</p>
      </main>

      {/* MENU FORM MODAL */}
      <AnimatePresence>
        {isMenuModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-150"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                  <Coffee size={14} /> {editingMenuItem ? 'Edit Menu Cafe' : 'Tambah Menu Baru'}
                </span>
                <button
                  onClick={() => setIsMenuModalOpen(false)}
                  className="p-1.5 bg-white hover:bg-slate-200 border border-slate-250 rounded-full"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveMenu} className="p-6 space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Nama Menu</label>
                  <input
                    type="text"
                    value={menuFormName}
                    onChange={(e) => setMenuFormName(e.target.value)}
                    placeholder="cth: Matcha Frappe"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Kategori</label>
                    <select
                      value={menuFormCategory}
                      onChange={(e) => setMenuFormCategory(e.target.value as MenuCategory)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="makanan">Food Menu</option>
                      <option value="kudapan">Kudapan</option>
                      <option value="dessert">Dessert</option>
                      <option value="minuman">Minuman</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Harga (IDR)</label>
                    <input
                      type="number"
                      value={menuFormPrice}
                      onChange={(e) => setMenuFormPrice(e.target.value)}
                      placeholder="cth: 22000"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    />
                  </div>
                </div>

                <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-500 uppercase tracking-wider text-xs font-bold">Varian Harga (opsional)</label>
                    <button
                      type="button"
                      onClick={() => setMenuFormVariants(prev => [...prev, { label: '', price: 0 }])}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus size={12} /> Tambah Varian
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400">Contoh: Ice & Hot dengan harga berbeda. Jika diisi, pelanggan wajib memilih varian.</p>
                  {menuFormVariants.length === 0 && (
                    <p className="text-[11px] text-slate-500">Belum ada varian. Harga tunggal cukup di kolom "Harga".</p>
                  )}
                  {menuFormVariants.map((variant, vIdx) => {
                    const vAvail = variant.isAvailable !== false;
                    return (
                    <div key={vIdx} className="bg-slate-50 border border-slate-100 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={variant.label}
                          onChange={(e) => setMenuFormVariants(prev => prev.map((vv, i) => i === vIdx ? { ...vv, label: e.target.value } : vv))}
                          placeholder="Label (cth: Ice)"
                          className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-xs"
                        />
                        <input
                          type="number"
                          value={variant.price || ''}
                          onChange={(e) => setMenuFormVariants(prev => prev.map((vv, i) => i === vIdx ? { ...vv, price: Number(e.target.value) || 0 } : vv))}
                          placeholder="Harga"
                          className="w-28 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setMenuFormVariants(prev => prev.filter((_, i) => i !== vIdx))}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg cursor-pointer"
                          title="Hapus varian"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between pl-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stok</span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setMenuFormVariants(prev => prev.map((vv, i) => i === vIdx ? { ...vv, isAvailable: true } : vv))}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${vAvail ? 'bg-green-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-green-50'}`}
                          >
                            Tersedia
                          </button>
                          <button
                            type="button"
                            onClick={() => setMenuFormVariants(prev => prev.map((vv, i) => i === vIdx ? { ...vv, isAvailable: false } : vv))}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${!vAvail ? 'bg-red-600 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:bg-red-50'}`}
                          >
                            Habis
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Upload Foto (dari Gallery)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) {
                        setError('File terlalu besar! Maks 5MB.');
                        return;
                      }
                      try {
                        const dataUrl = await compressImage(file);
                        setMenuFormImageUrl(dataUrl);
                      } catch (err) {
                        setError('Gagal memproses gambar menu');
                      }
                    }}
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">atau URL Gambar</label>
                  <input
                    type="text"
                    value={menuFormImageUrl}
                    onChange={(e) => setMenuFormImageUrl(e.target.value)}
                    placeholder="cth: https://images.unsplash.com/..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Deskripsi Singkat</label>
                  <textarea
                    value={menuFormDescription}
                    onChange={(e) => setMenuFormDescription(e.target.value)}
                    rows={2}
                    placeholder="Tulis bahan, rasa, atau penyajian..."
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="isAvailable"
                    checked={menuFormAvailable}
                    onChange={(e) => setMenuFormAvailable(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500"
                  />
                  <label htmlFor="isAvailable" className="text-slate-700 font-bold select-none cursor-pointer">
                    Stok Tersedia (Aktifkan Menu)
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsMenuModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow transition-all cursor-pointer"
                  >
                    Simpan Menu
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* STAFF FORM MODAL */}
      <AnimatePresence>
        {isStaffModalOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-slate-150"
            >
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <span className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1">
                  <Users size={14} /> {editingStaff ? 'Edit Akun Staf' : 'Tambah Staf Baru'}
                </span>
                <button
                  onClick={() => setIsStaffModalOpen(false)}
                  className="p-1.5 bg-white hover:bg-slate-200 border border-slate-250 rounded-full"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSaveStaff} className="p-6 space-y-4 text-xs font-semibold">
                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Nama Lengkap Staf</label>
                  <input
                    type="text"
                    value={staffFormName}
                    onChange={(e) => setStaffFormName(e.target.value)}
                    placeholder="cth: Siti Fatimah"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Username Login</label>
                    <input
                      type="text"
                      value={staffFormUsername}
                      onChange={(e) => setStaffFormUsername(e.target.value)}
                      placeholder="cth: sitikasir"
                      disabled={!!editingStaff}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 disabled:bg-slate-50"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Peran (Role)</label>
                    <select
                      value={staffFormRole}
                      onChange={(e) => setStaffFormRole(e.target.value as Role)}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                    >
                      <option value="kasir">Kasir</option>
                      <option value="owner">Owner</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-slate-500 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={staffFormEmail}
                    onChange={(e) => setStaffFormEmail(e.target.value)}
                    placeholder="cth: siti@cafe.com"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800"
                  />
                </div>

                {editingStaff && (
                  <div className="space-y-1.5">
                    <label className="text-slate-500 uppercase tracking-wider">Kata Sandi Baru</label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showStaffPassword ? 'text' : 'password'}
                          value={staffFormPassword}
                          onChange={(e) => {
                            setStaffFormPassword(e.target.value);
                            setStaffPasswordChanged(true);
                          }}
                          placeholder="Biarkan kosong jika tidak ingin ubah"
                          className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-slate-800 pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowStaffPassword(!showStaffPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showStaffPassword ? <Eye size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer text-xs whitespace-nowrap"
                      >
                        {showStaffPassword ? 'Sembunyikan' : 'Lihat Password'}
                      </button>
                    </div>
                  </div>
                )}

                {editingStaff ? (
                  <p className="text-[10px] text-slate-400 font-normal leading-normal">
                    *Isi kata sandi baru jika ingin mengubah password staf.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 font-normal leading-normal">
                    *Sistem akan membuat password acak otomatis. Password ditampilkan setelah akun dibuat — catat dan bagikan ke staf.
                  </p>
                )}

                {newStaffTempPassword && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                      <Check size={12} /> Akun Berhasil Dibuat
                    </span>
                    <p className="text-xs text-emerald-800">
                      Username: <b>{staffFormUsername}</b><br />
                      Sandi sementara: <b className="font-mono text-sm">{newStaffTempPassword}</b>
                    </p>
                    <p className="text-[10px] text-emerald-600">Catat dan bagikan ke staf. Ganti sandi kapan saja via Kelola Akun Staf.</p>
                  </div>
                )}

                <div className="border-t border-slate-100 pt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsStaffModalOpen(false)}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
                  >
                    Batal
                  </button>
                  {newStaffTempPassword ? (
                    <button
                      type="button"
                      onClick={() => { setNewStaffTempPassword(''); setIsStaffModalOpen(false); }}
                      className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow transition-all cursor-pointer"
                    >
                      Selesai
                    </button>
                  ) : (
                    <button
                      type="submit"
                      className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl shadow transition-all cursor-pointer"
                    >
                      Simpan Akun Staf
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
