import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { from as supabaseFrom } from '@/lib/supabaseCompat';

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
  signup: (email: string, password: string, name: string, role: 'admin' | 'driver') => Promise<{ success: boolean; error?: string }>;
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
      // Sign in with Supabase auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authError) {
        return { success: false, error: authError.message || 'Login failed' };
      }

      if (!authData.user) {
        return { success: false, error: 'No user data returned' };
      }

      // Fetch user role and additional info from users table
      // First try by ID, then by email (in case of ID mismatch from incomplete signup)
      let { data: userData, error: userError } = await supabaseFrom('users')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      // If not found by ID, try by email
      if (userError || !userData) {
        console.log('User not found by ID, trying email...');
        const { data: userByEmail, error: emailError } = await supabaseFrom('users')
          .select('*')
          .eq('email', email.toLowerCase().trim())
          .single();

        if (userByEmail) {
          // User exists but with different ID - update the ID to match auth
          console.log('Found user by email, updating ID to match auth...');
          const { error: updateError } = await supabaseFrom('users')
            .update({ id: authData.user.id })
            .eq('email', email.toLowerCase().trim());

          if (updateError) {
            console.error('Error updating user ID:', updateError);
            // Continue anyway, use the existing user data
          }
          
          userData = { ...userByEmail, id: authData.user.id };
        } else {
          // User doesn't exist at all - create new record
          console.log('User record not found, creating one...');
          
          const newUser = {
            id: authData.user.id,
            email: email.toLowerCase().trim(),
            password_hash: 'supabase_auth',
            name: authData.user.email?.split('@')[0] || 'User',
            role: 'admin',
            is_active: true,
            created_at: new Date().toISOString(),
          };
          
          const { error: insertError } = await supabaseFrom('users').insert(newUser);

          if (insertError) {
            console.error('Error creating user record:', insertError);
            return { success: false, error: `Could not create user profile: ${insertError.message}` };
          }

          userData = newUser;
        }
      }

      const user: User = {
        id: userData.id,
        email: userData.email,
        role: userData.role || 'driver',
        driver_id: userData.driver_id,
        name: userData.name,
        is_active: userData.is_active !== false,
      };

      // Store in localStorage
      localStorage.setItem('tms_user', JSON.stringify(user));
      setUser(user);

      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const signup = async (email: string, password: string, name: string, role: 'admin' | 'driver' = 'driver'): Promise<{ success: boolean; error?: string }> => {
    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password,
      });

      if (authError) {
        return { success: false, error: authError.message || 'Signup failed' };
      }

      if (!authData.user) {
        return { success: false, error: 'No user data returned' };
      }

      // Create user record in users table
      const { error: insertError } = await supabaseFrom('users').insert({
        id: authData.user.id,
        email: email.toLowerCase().trim(),
        password_hash: 'supabase_auth', // Placeholder - actual password stored in Supabase Auth
        name: name,
        role: role,
        is_active: true,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('Error creating user record:', insertError);
        // Auth user is created but table record failed - user can still try to login
        return { success: false, error: 'Account created but profile setup failed. Please contact support.' };
      }

      // Auto-login after signup
      const user: User = {
        id: authData.user.id,
        email: email.toLowerCase().trim(),
        role: role,
        driver_id: null,
        name: name,
        is_active: true,
      };

      localStorage.setItem('tms_user', JSON.stringify(user));
      setUser(user);

      return { success: true };
    } catch (err) {
      console.error('Signup error:', err);
      return { success: false, error: 'An unexpected error occurred' };
    }
  };

  const logout = () => {
    localStorage.removeItem('tms_user');
    setUser(null);
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { success: false, error: error.message || 'Failed to send reset email' };
      }

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send reset email';
      return { success: false, error: errorMessage };
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    signup,
    logout,
    resetPassword,
    isAdmin: user?.role === 'admin',
    isDriver: user?.role === 'driver',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
