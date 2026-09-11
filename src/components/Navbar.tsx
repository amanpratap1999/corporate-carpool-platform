'use client';

import React, { useState, useEffect } from 'react';
import {
  Car,
  Bell,
  CheckCircle2,
  AlertCircle,
  Building2,
  XCircle,
} from 'lucide-react';
import { Notification } from '@/domain/types';
import { getAuthHeaders } from '@/lib/auth-client';

interface NavbarProps {
  activeUserId: string;
  currentUserName?: string;
  isOrgAdmin?: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeUserId,
  currentUserName,
  isOrgAdmin,
  activeTab,
  onTabChange,
  onLogout,
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [showNotifs, setShowNotifs] = useState(false);

  const fetchNotifications = async () => {
    try {
      const notifRes = await fetch('/api/v1/notifications', {
        headers: { ...getAuthHeaders() },
      });
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.notifications || []);
        setUnreadCount(notifData.unread_count || 0);
      }
    } catch {
      // Ignore poll errors
    }
  };

  useEffect(() => {
    if (!activeUserId) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [activeUserId]);

  const markAsRead = async (notifId: string) => {
    try {
      await fetch(`/api/v1/notifications/${notifId}/read`, {
        method: 'POST',
        headers: { ...getAuthHeaders() },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // ignore
    }
  };

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-sm sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="flex items-center justify-between h-14 gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <Car className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-white text-sm">CarpoolCorp</span>
              <Building2 className="w-3 h-3 text-slate-500 inline ml-1.5" />
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center gap-1 overflow-x-auto">
            {[
              { key: 'search', label: 'Find a Ride' },
              { key: 'bookings', label: 'My Bookings' },
              { key: 'driver', label: 'Host Commutes' },
              { key: 'vehicles', label: 'My Vehicles' },
              ...(Boolean(isOrgAdmin) ? [{ key: 'audit', label: 'Compliance & Audit' }] : []),
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => onTabChange(tab.key)}
                className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right — Notifications + User + Logout */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition relative"
                title="Notifications"
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
                              {new Date(n.sent_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
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

            {/* User identity */}
            {currentUserName && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-[11px]">
                  {currentUserName.charAt(0)}
                </div>
                <span className="text-sm text-slate-200 hidden sm:block">{currentUserName}</span>
              </div>
            )}

            {/* Logout */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                title="Sign out"
              >
                <XCircle className="w-4.5 h-4.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
