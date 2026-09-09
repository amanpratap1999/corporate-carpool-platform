'use client';

import React, { useState, useEffect } from 'react';
import {
  Car,
  Bell,
  CheckCircle2,
  AlertCircle,
  Building2,
  ChevronDown,
  UserCheck,
  ShieldCheck,
} from 'lucide-react';
import { Notification } from '@/domain/types';

interface UserOption {
  id: string;
  full_name: string;
  email: string;
  work_department?: string;
  capabilities?: {
    can_ride: boolean;
    can_drive: boolean;
    is_org_admin: boolean;
  };
}

interface NavbarProps {
  activeUserId: string;
  onUserChange: (userId: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeUserId,
  onUserChange,
  activeTab,
  onTabChange,
}) => {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [currentUser, setCurrentUser] = useState<UserOption | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  const fetchProfileAndNotifications = async () => {
    try {
      // 1. Fetch Profile & available users
      const profileRes = await fetch('/api/v1/me', {
        headers: { 'x-user-id': activeUserId },
      });
      if (profileRes.ok) {
        const data = await profileRes.json();
        setUsers(data.available_users || []);
        const current = (data.available_users || []).find((u: UserOption) => u.id === activeUserId);
        setCurrentUser(current || null);
      }

      // 2. Fetch Notifications
      const notifRes = await fetch('/api/v1/notifications', {
        headers: { 'x-user-id': activeUserId },
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unread_count || 0);
      }
    } catch {
      // Ignore initial network poll errors
    }
  };

  useEffect(() => {
    fetchProfileAndNotifications();
    const interval = setInterval(fetchProfileAndNotifications, 5000);
    return () => clearInterval(interval);
  }, [activeUserId]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/v1/notifications/${id}/read`, {
      method: 'PATCH',
      headers: { 'x-user-id': activeUserId },
    });
    fetchProfileAndNotifications();
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Organization Badge */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Car className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">Corporate Carpool</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  V1 Web
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <span>Acme Global Corporation</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1">
            <button
              onClick={() => onTabChange('search')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'search'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Find a Ride
            </button>
            <button
              onClick={() => onTabChange('bookings')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'bookings'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              My Bookings
            </button>
            <button
              onClick={() => onTabChange('driver')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'driver'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Host Commutes
            </button>
            <button
              onClick={() => onTabChange('vehicles')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'vehicles'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              My Vehicles
            </button>
            <button
              onClick={() => onTabChange('audit')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'audit'
                  ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              Compliance & Audit
            </button>
          </nav>

          {/* User Impersonator & Notifications */}
          <div className="flex items-center gap-3">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition relative"
                title="In-App Notifications"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-slate-950 font-bold text-[10px] rounded-full flex items-center justify-center animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifs && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="p-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                    <span className="font-semibold text-sm">Notifications</span>
                    <span className="text-xs text-slate-400">{notifications.length} alerts</span>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">No notifications yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markAsRead(n.id)}
                          className={`p-3 text-xs transition cursor-pointer hover:bg-slate-800/60 ${
                            !n.read_at ? 'bg-emerald-950/20 border-l-2 border-emerald-500' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-200">{n.title}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(n.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-300 leading-relaxed">{n.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Impersonation Persona Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowUserDropdown(!showUserDropdown)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs hover:border-slate-600 transition"
              >
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-[11px]">
                  {currentUser?.full_name?.charAt(0) || 'U'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="font-medium text-slate-100 flex items-center gap-1">
                    {currentUser?.full_name || 'Select User'}
                    {currentUser?.capabilities?.can_drive && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1 rounded">Driver</span>
                    )}
                    {currentUser?.capabilities?.is_org_admin && (
                      <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1 rounded">Admin</span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400">{currentUser?.work_department}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showUserDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-2">
                  <div className="text-[10px] uppercase font-bold text-slate-400 px-2 py-1 mb-1">
                    Switch Persona (Interactive Testing)
                  </div>
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        onUserChange(u.id);
                        setShowUserDropdown(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition ${
                        u.id === activeUserId
                          ? 'bg-emerald-600/20 text-emerald-300 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div>{u.full_name}</div>
                        <div className="text-[10px] text-slate-400">{u.work_department}</div>
                      </div>
                      <div className="flex gap-1">
                        {u.capabilities?.can_drive && (
                          <span className="text-[9px] px-1 bg-emerald-900/60 text-emerald-300 rounded">Host</span>
                        )}
                        {u.capabilities?.is_org_admin && (
                          <span className="text-[9px] px-1 bg-purple-900/60 text-purple-300 rounded">Admin</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
