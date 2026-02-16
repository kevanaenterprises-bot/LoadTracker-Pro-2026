import React from 'react';
import AppLayout from '@/components/AppLayout';
import LoginPage from '@/components/LoginPage';
import DriverDashboard from '@/components/tms/DriverDashboard';
import { AppProvider } from '@/contexts/AppContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { UsageProvider } from '@/contexts/UsageContext';

const AuthenticatedApp: React.FC = () => {
  const { user, loading } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in - show login page
  if (!user) {
    return <LoginPage />;
  }

  // Driver role - show driver dashboard
  if (user.role === 'driver') {
    return <DriverDashboard />;
  }

  // Admin role - show full admin dashboard with usage tracking
  return (
    <AppProvider>
      <UsageProvider>
        <AppLayout />
      </UsageProvider>
    </AppProvider>
  );
};

const Index: React.FC = () => {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
};

export default Index;
