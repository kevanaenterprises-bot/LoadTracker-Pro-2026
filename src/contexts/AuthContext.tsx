import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { query } from '@/lib/database';

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
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  isAdmin: boolean;
  isDriver: boolean;
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
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await query(
        `SELECT id, email, role, driver_id, name, is_active 
         FROM users 
         WHERE email = $1 AND password_hash = $2 AND is_active = true`,
        [email.toLowerCase().trim(), password]
      );

      if (result.rows.length === 0) {
        return { success: false, error: 'Invalid email or password' };
      }

      const data = result.rows[0];

      const userData: User = {
        id: data.id,
        email: data.email,
        role: data.role,
        driver_id: data.driver_id,
        name: data.name,
        is_active: data.is_active,
      };

      // Update last login
      await query(
        'UPDATE users SET last_login = $1 WHERE id = $2',
        [new Date().toISOString(), data.id]
      );

      // Store in localStorage
      localStorage.setItem('tms_user', JSON.stringify(userData));
      setUser(userData);

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = () => {
    localStorage.removeItem('tms_user');
    setUser(null);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Password reset functionality would need to be implemented separately
      // For now, return a message indicating this feature is not yet available
      return { 
        success: false, 
        error: 'Password reset functionality is not yet implemented. Please contact your administrator.' 
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reset email';
      return { success: false, error: errorMessage };
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    resetPassword,
    isAdmin: user?.role === 'admin',
    isDriver: user?.role === 'driver',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
