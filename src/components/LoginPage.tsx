import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Truck, Mail, Lock, Loader2, AlertCircle, User, Shield, ArrowLeft, CheckCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
  const { login, signup, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'driver'>('admin');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    
    setLoading(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess(false);
    setLoading(true);

    const result = await resetPassword(resetEmail);
    
    if (result.success) {
      setResetSuccess(true);
    } else {
      setResetError(result.error || 'Failed to send reset email');
    }
    
    setLoading(false);
  };

  const handleBackToLogin = () => {
    setShowResetPassword(false);
    setShowSignup(false);
    setResetEmail('');
    setResetSuccess(false);
    setResetError('');
    setError('');
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signup(email, password, name, loginType);
    
    if (!result.success) {
      setError(result.error || 'Signup failed');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      {/* Left Side - Turtle Logistics Mascot */}
      <div className="hidden lg:flex absolute left-0 top-0 bottom-0 w-[35%] flex-col items-center justify-center pointer-events-none select-none">
        <div className="relative">
          <div className="absolute inset-0 bg-pink-400/10 rounded-full blur-[80px] scale-125"></div>
          <img
            src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770447980201_ca86907e.png"
            alt="Turtle Logistics Mascot"
            className="w-72 h-72 xl:w-96 xl:h-96 object-contain relative z-10 drop-shadow-2xl opacity-85 hover:opacity-100 transition-opacity duration-500"
          />
        </div>
        <div className="mt-4 text-center relative z-10">
          <p className="text-pink-300/70 text-lg font-bold tracking-wide">Turtle Logistics</p>
          <p className="text-slate-400/60 text-sm italic mt-1">"We may be slow, but we deliver fast"</p>
        </div>
      </div>

      {/* Right Side - LoadTracker Pro Logo */}
      <div className="hidden lg:flex absolute right-0 top-0 bottom-0 w-[35%] flex-col items-center justify-center pointer-events-none select-none">
        <div className="relative">
          <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-[80px] scale-125"></div>
          <img
            src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770448023383_8ec7ad56.png"
            alt="LoadTracker Pro Logo"
            className="w-72 h-72 xl:w-96 xl:h-96 object-contain relative z-10 drop-shadow-2xl opacity-80 hover:opacity-100 transition-opacity duration-500 rounded-2xl"
          />
        </div>
        <div className="mt-4 text-center relative z-10">
          <p className="text-cyan-300/70 text-lg font-bold tracking-wide">LoadTracker Pro</p>
          <p className="text-slate-400/60 text-sm italic mt-1">Powering Your Fleet</p>
        </div>
      </div>

      {/* Center Login Form */}
      <div className="relative z-20 w-full max-w-md">
        {/* Logo Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
            <Truck className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">LoadTracker PRO</h1>
          <p className="text-slate-400">Transportation Management System</p>
        </div>

        {/* Login Type Toggle */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-1 mb-6 flex">
          <button
            onClick={() => setLoginType('admin')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
              loginType === 'admin'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-4 h-4" />
            Admin Login
          </button>
          <button
            onClick={() => setLoginType('driver')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-all ${
              loginType === 'driver'
                ? 'bg-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Driver Login
          </button>
        </div>

        {/* Login Form */}
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-8">
          {showResetPassword ? (
            // Password Reset Form
            <>
              <div className="mb-6">
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </button>
              </div>

              <h2 className="text-xl font-semibold text-white mb-2">
                Reset Your Password
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Enter your email address and we'll send you a link to reset your password.
              </p>

              {resetSuccess && (
                <div className="mb-6 p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-xl flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <p className="text-emerald-200 text-sm">Password reset email sent! Check your inbox.</p>
                </div>
              )}

              {resetError && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-red-200 text-sm">{resetError}</p>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@company.com"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                      disabled={resetSuccess}
                    />
                  </div>
                </div>

                {!resetSuccess && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5" />
                        Send Reset Link
                      </>
                    )}
                  </button>
                )}
              </form>
            </>
          ) : showSignup ? (
            // Signup Form
            <>
              <div className="mb-6">
                <button
                  onClick={handleBackToLogin}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </button>
              </div>

              <h2 className="text-xl font-semibold text-white mb-2">
                Create Your Account
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Register as {loginType === 'admin' ? 'an Administrator' : 'a Driver'}
              </p>

              {error && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSignup} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={loginType === 'admin' ? 'you@company.com' : 'driver@company.com'}
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                      minLength={6}
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Password must be at least 6 characters</p>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                    loginType === 'admin'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30'
                      : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-500/30'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <User className="w-5 h-5" />
                      Create Account
                    </>
                  )}
                </button>
              </form>
            </>
          ) : (
            // Login Form
            <>
              <h2 className="text-xl font-semibold text-white mb-6">
                {loginType === 'admin' ? 'Administrator Access' : 'Driver Portal Access'}
              </h2>

              {error && (
                <div className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-red-200 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={loginType === 'admin' ? 'you@company.com' : 'driver@company.com'}
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      required
                    />
                  </div>
                  <div className="mt-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setShowResetPassword(true);
                        setError('');
                        setEmail('');
                        setPassword('');
                      }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2 ${
                    loginType === 'admin'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg shadow-blue-500/30'
                      : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-500/30'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      {loginType === 'admin' ? <Shield className="w-5 h-5" /> : <User className="w-5 h-5" />}
                      Sign In
                    </>
                  )}
                </button>
              </form>
            </>
          )}

          {/* Help text */}
          {!showResetPassword && !showSignup && (
            <div className="mt-6 pt-6 border-t border-slate-700/50">
              <div className="text-center mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSignup(true);
                    setError('');
                    setEmail('');
                    setPassword('');
                    setName('');
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  Don't have an account? Create one now &rarr;
                </button>
              </div>
              <p className="text-xs text-slate-500 text-center">
                {loginType === 'admin' 
                  ? 'Create an admin account to manage your fleet operations.' 
                  : 'Create a driver account to access your portal.'}
              </p>
              <div className="mt-4 text-center">
                <a
                  href="/demo"
                  className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                >
                  New here? See what LoadTracker PRO can do &rarr;
                </a>
              </div>
            </div>
          )}
        </div>


        {/* Powered By Section */}
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 bg-slate-800/40 backdrop-blur-sm rounded-full px-6 py-3 border border-slate-700/30">
            <img
              src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770447980201_ca86907e.png"
              alt="Turtle Logistics"
              className="w-8 h-8 object-contain rounded-full"
            />
            <div className="text-left">
              <p className="text-slate-300 text-xs font-semibold">Powered by <span className="text-pink-400">Turtle Logistics</span></p>
              <p className="text-slate-500 text-[10px] italic">"We may be slow, but we deliver fast"</p>
            </div>
          </div>
        </div>

        {/* Mobile: Show logos below on smaller screens */}
        <div className="lg:hidden mt-8 flex items-center justify-center gap-6">
          <div className="text-center">
            <img
              src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770447980201_ca86907e.png"
              alt="Turtle Logistics Mascot"
              className="w-24 h-24 object-contain mx-auto opacity-70 drop-shadow-lg"
            />
            <p className="text-pink-300/50 text-xs mt-1 font-medium">Turtle Logistics</p>
          </div>
          <div className="text-center">
            <img
              src="https://d64gsuwffb70l.cloudfront.net/69770a8f83fbc738004b0074_1770448023383_8ec7ad56.png"
              alt="LoadTracker Pro Logo"
              className="w-24 h-24 object-contain mx-auto opacity-70 drop-shadow-lg rounded-xl"
            />
            <p className="text-cyan-300/50 text-xs mt-1 font-medium">LoadTracker Pro</p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-slate-500 text-sm mt-6">
          &copy; {new Date().getFullYear()} LoadTracker PRO. All rights reserved.
        </p>

      </div>
    </div>
  );
};

export default LoginPage;
