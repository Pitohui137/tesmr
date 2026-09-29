import React, { useState } from 'react';
import { UserAccount, Role } from '../types';
import { Key, User, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';

interface StaffLoginProps {
  onLoginSuccess: (user: UserAccount) => void;
  requiredRole?: Role;
  portalLabel?: string;
}

export default function StaffLogin({ onLoginSuccess, requiredRole, portalLabel }: StaffLoginProps) {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username dan Password wajib diisi!');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login gagal. Periksa kembali username & password.');
      }

      if (requiredRole && data.user?.role !== requiredRole) {
        setError(`Akun ini tidak memiliki akses ke halaman ini (khusus ${requiredRole}). Login ${requiredRole} hanya di /${requiredRole === 'admin' ? 'godmode' : 'staff'}.`);
        return;
      }

      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message || 'Koneksi ke server gagal.');
    } finally {
      setIsLoading(false);
    }
  };

  const isGodmode = requiredRole === 'admin';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-brand-bg">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-brand-badge-border overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-brand-forest via-brand-sage to-brand-deep" />

        {/* Header decoration */}
        <div className="p-8 text-center bg-gradient-to-b from-brand-forest to-brand-deep relative overflow-hidden">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative z-10">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full overflow-hidden ring-2 ring-white/15 shadow-xl">
              <img src="/logo.png" alt="Salad Yook" className="w-full h-full object-cover" />
            </div>
            <h2 className="text-xl font-black text-white tracking-tight drop-shadow-lg">{portalLabel || 'Portal Staf Cafe'}</h2>
            <p className="text-brand-light-sage text-xs mt-0.5 font-medium opacity-80">
              {isGodmode ? 'Khusus akun admin untuk pemantauan jarak jauh' : 'Gunakan kredensial Anda untuk masuk'}
            </p>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleLogin} className="p-8 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <User size={12} /> Username
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={isGodmode ? 'cth: admin' : 'cth: owner atau kasir'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-forest bg-gray-50 focus:bg-white transition-all text-sm text-gray-800 font-medium"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Key size={12} /> Password
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-forest bg-gray-50 focus:bg-white transition-all text-sm text-gray-800 font-medium"
              />
            </div>
          </div>

          {/* No demo credentials shown publicly */}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-brand-forest hover:bg-brand-deep disabled:bg-brand-forest/60 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-brand-forest/10 active:scale-[0.98] flex items-center justify-center gap-2 text-sm cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={16} />
                Memverifikasi...
              </>
            ) : (
              'Masuk Ke Dashboard'
            )}
          </button>
        </form>

        {/* Footer */}
        {isGodmode && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center">
            <a
              href="/staff"
              className="text-slate-500 hover:text-brand-forest font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft size={14} /> Bukan admin? Login staf di /staff
            </a>
          </div>
        )}
      </div>

      <p className="text-[10px] text-slate-400 mt-4">© {new Date().getFullYear()} Salad Yook — Semua hak cipta dilindungi.</p>
    </div>
  );
}
