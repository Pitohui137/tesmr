import React, { useState, useEffect, useRef } from 'react';
import { CafeSettings, MenuItem, UserAccount } from './types';
import CustomerView from './components/CustomerView';
import StaffLogin from './components/StaffLogin';
import CashierDashboard from './components/CashierDashboard';
import OwnerDashboard from './components/OwnerDashboard';
import { RefreshCw, Sparkles } from 'lucide-react';

function Redirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
}

export default function App() {
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [activeUser, setActiveUser] = useState<UserAccount | null>(() => {
    const saved = sessionStorage.getItem('active_staff_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');

  const isGodmode = window.location.pathname === '/godmode';
  const isStaffPage = window.location.pathname === '/staff' || window.location.pathname === '/admin';

  const fetchInitialData = async (): Promise<boolean> => {
    let backedOff = false;
    try {
      setLoadError('');
      const settingsRes = await fetch('/api/settings');
      if (settingsRes.status === 429) {
        backedOff = true;
      } else if (settingsRes.ok) {
        const sData = await settingsRes.json();
        setSettings(sData);
      } else {
        setLoadError('Gagal memuat pengaturan cafe');
      }

      const menuRes = await fetch('/api/menu');
      if (menuRes.status === 429) {
        backedOff = true;
      } else if (menuRes.ok) {
        const mData = await menuRes.json();
        setMenu(mData);
      }
    } catch (err) {
      console.error("Error loading application configurations:", err);
      setLoadError('Tidak dapat terhubung ke server. Pastikan server berjalan.');
    } finally {
      setIsLoading(false);
    }
    return backedOff;
  };

  const pollMenu = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/menu');
      if (res.status === 429) return true;
      if (res.ok) setMenu(await res.json());
    } catch {}
    return false;
  };

  // Polling dengan interval hemat + backoff otomatis saat HTTP 429 (limit kena)
  useEffect(() => {
    let cancelled = false;
    let fullDelay = 60000;
    let menuDelay = 20000;
    const MAX_DELAY = 120000;

    const loopFull = async () => {
      if (cancelled) return;
      fullDelay = (await fetchInitialData()) ? Math.min(fullDelay * 2, MAX_DELAY) : 60000;
      setTimeout(loopFull, fullDelay);
    };
    const loopMenu = async () => {
      if (cancelled) return;
      menuDelay = (await pollMenu()) ? Math.min(menuDelay * 2, MAX_DELAY) : 20000;
      setTimeout(loopMenu, menuDelay);
    };

    loopFull();
    loopMenu();
    return () => { cancelled = true; };
  }, []);

  const handleLoginSuccess = (user: UserAccount) => {
    setActiveUser(user);
    sessionStorage.setItem('active_staff_user', JSON.stringify(user));
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setActiveUser(null);
    sessionStorage.removeItem('active_staff_user');
  };

  const handleOrderPlaced = () => {};

  if (isLoading && !loadError) {
    return (
      <div className="min-h-screen bg-brand-deep flex flex-col items-center justify-center p-4 text-white">
        <div className="text-center space-y-4 max-w-sm">
          <div className="relative inline-block">
              <div className="mx-auto mb-5">
              <div className="relative w-32 h-32 mx-auto">
                <div className="absolute inset-0 bg-brand-forest/40 rounded-full blur-3xl scale-150" />
                <div className="relative w-32 h-32 rounded-full overflow-hidden ring-4 ring-white/20 shadow-2xl">
                  <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
            <Sparkles className="absolute -top-2 -right-2 text-yellow-400 animate-bounce" size={24} />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-lg">Salad Yook</h2>
            <p className="text-brand-light-sage text-xs mt-3 uppercase tracking-[0.2em] font-bold opacity-80">Menyiapkan Menu...</p>
          </div>
          <RefreshCw className="animate-spin text-brand-sage mx-auto" size={20} />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-brand-deep flex flex-col items-center justify-center p-4 text-white">
        <div className="text-center space-y-4 max-w-sm">
          <div className="mx-auto mb-4">
            <div className="w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/15 mx-auto">
              <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Salad Yook</h2>
          <p className="text-sm text-red-300">{loadError}</p>
          <button
            onClick={() => { setIsLoading(true); setLoadError(''); fetchInitialData(); }}
            className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-sm font-bold transition-all cursor-pointer"
          >
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const fallbackSettings: CafeSettings = settings || {
    name: 'Salad Yook', address: '', phone: '', qrisMerchantName: '', qrisCodeText: ''
  };

  // Godmode portal (khusus akun admin)
  if (isGodmode) {
    if (!activeUser) {
      return <StaffLogin onLoginSuccess={handleLoginSuccess} requiredRole="admin" portalLabel="Godmode Admin Monitoring" />;
    }
    if (activeUser.role === 'admin') {
      return (
        <OwnerDashboard
          settings={fallbackSettings}
          menu={menu}
          onLogout={handleLogout}
          onRefreshData={fetchInitialData}
          isAdmin
          portalLabel="Godmode Admin Monitoring"
        />
      );
    }
    return <Redirect to="/staff" />;
  }

  // Staff pages (owner & kasir)
  if (isStaffPage) {
    if (activeUser) {
      if (activeUser.role === 'admin') {
        return <Redirect to="/godmode" />;
      }
      switch (activeUser.role) {
        case 'owner':
          return (
            <OwnerDashboard
              settings={fallbackSettings}
              menu={menu}
              onLogout={handleLogout}
              onRefreshData={fetchInitialData}
            />
          );
        case 'kasir':
          return (
            <CashierDashboard
              settings={fallbackSettings}
              onLogout={handleLogout}
              user={activeUser}
            />
          );
        default:
          return <StaffLogin onLoginSuccess={handleLoginSuccess} />;
      }
    }
    return <StaffLogin onLoginSuccess={handleLoginSuccess} />;
  }

  // Customer page
  return (
    <div className="relative min-h-screen">
      <CustomerView
        settings={fallbackSettings}
        menu={menu}
        onOrderPlaced={handleOrderPlaced}
      />
    </div>
  );
}
