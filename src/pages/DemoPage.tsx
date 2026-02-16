import React from 'react';
import AppLayout from '@/components/AppLayout';
import { AppProvider } from '@/contexts/AppContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { UsageProvider } from '@/contexts/UsageContext';

const DemoPage: React.FC = () => {
  return (
    <AuthProvider startInDemoMode={true}>
      <AppProvider>
        <UsageProvider>
          <AppLayout />
        </UsageProvider>
      </AppProvider>
    </AuthProvider>
  );
};

export default DemoPage;
