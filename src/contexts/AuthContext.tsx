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
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase().trim())
        .eq('password_hash', password)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return { success: false, error: 'Invalid email or password' };
      }

      const userData: User = {
        id: data.id,
        email: data.email,
        role: data.role,
        driver_id: data.driver_id,
        name: data.name,
        is_active: data.is_active,
      };

      // Update last login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      // Store in localStorage
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
