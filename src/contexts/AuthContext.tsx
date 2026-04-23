import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

export interface User {
  id: string;
  email: string;
  role: 'admin' | 'driver';
  driver_id: string | null;
  name: string;
  is_active: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  loginAsDemo: () => void;
  isAdmin: boolean;
  isDriver: boolean;
  isDemo: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
  startInDemoMode?: boolean;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, startInDemoMode = false }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(startInDemoMode);

  useEffect(() => {
    if (startInDemoMode) {
      // Auto-login as demo user
      const demoUser: User = {
        id: 'demo-user-001',
        email: 'demo@loadtrackerpro.com',
        role: 'admin',
        driver_id: null,
        name: 'Demo User',
        is_active: true,
      };
      setUser(demoUser);
      setIsDemo(true);
      setLoading(false);
      return;
    }

    // Check for stored user session
    const storedUser = localStorage.getItem('tms_user');
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setUser(parsedUser);
      } catch {
        localStorage.removeItem('tms_user');
      }
    }
    setLoading(false);
  }, [startInDemoMode]);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Use RPC function so login works regardless of RLS policies on the users table
      const { data, error } = await supabase
        .rpc('authenticate_user', {
          p_email: email.toLowerCase().trim(),
          p_password: password.trim(),
        });

      if (error || !data || data.length === 0) {
        return { success: false, error: 'Invalid email or password' };
      }

      const row = data[0];
      const userData: User = {
        id: row.id,
        email: row.email,
        role: row.role as 'admin' | 'driver',
        driver_id: row.driver_id,
        name: row.name,
        is_active: row.is_active,
      };

      localStorage.setItem('tms_user', JSON.stringify(userData));
      setUser(userData);

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const loginAsDemo = () => {
    const demoUser: User = {
      id: 'demo-user-001',
      email: 'demo@loadtrackerpro.com',
      role: 'admin',
      driver_id: null,
      name: 'Demo User',
      is_active: true,
    };
    setUser(demoUser);
    setIsDemo(true);
  };

  const logout = () => {
    if (isDemo) {
      setUser(null);
      setIsDemo(false);
      return;
    }
    localStorage.removeItem('tms_user');
    setUser(null);
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    loginAsDemo,
    isAdmin: user?.role === 'admin',
    isDriver: user?.role === 'driver',
    isDemo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
