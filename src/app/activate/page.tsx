'use client';

import React, { useState, useEffect } from 'react';
import { activate } from '@/lib/auth-client';

export default function ActivatePage() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = params.get('token');
      if (t) setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 10) {
      setError('Password must be at least 10 characters');
      return;
    }
    if (!token.trim()) {
      setError('Invitation token is required');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await activate(token.trim(), password);
    setLoading(false);
    if (result.success) {
      window.location.href = '/';
    } else {
      setError(result.error || 'Activation failed. Check your token and try again.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">CarpoolCorp</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Activate your account</h1>
          <p className="text-slate-400 text-sm mt-1">
            Create a password to complete your registration
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-950/40 border border-red-800/40 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {!token && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Invitation token
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                placeholder="inv_..."
                className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">
                Check your invitation email for this token.
              </p>
            </div>
          )}

          {token && (
            <div className="bg-emerald-950/30 border border-emerald-800/30 rounded-lg p-3">
              <p className="text-xs text-emerald-400">
                ✓ Invitation token detected from your link
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              New password <span className="text-slate-500">(min. 10 characters)</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
              autoComplete="new-password"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••••"
              autoComplete="new-password"
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg transition text-sm"
          >
            {loading ? 'Activating…' : 'Activate account'}
          </button>

          <div className="text-center text-xs text-slate-500 pt-1">
            Already activated?{' '}
            <a href="/login" className="text-emerald-400 hover:text-emerald-300">
              Sign in
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
