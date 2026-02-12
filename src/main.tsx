
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

try {
  const rootEl = document.getElementById("root");
  if (rootEl) {
    createRoot(rootEl).render(<App />);
  }
} catch (err) {
  console.error('Failed to initialize app:', err);
  // Show error in the loading indicator area
  const loading = document.getElementById('app-loading');
  if (loading) {
    loading.innerHTML = `
      <div style="text-align:center;padding:24px;max-width:400px">
        <p style="font-size:18px;font-weight:700;color:#1e293b;margin:0 0 8px">Failed to load</p>
        <p style="font-size:14px;color:#64748b;margin:0 0 16px">The app encountered an error during startup.</p>
        <button onclick="location.reload()" style="padding:12px 24px;background:#3b82f6;color:white;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer">Reload Page</button>
      </div>
    `;
  }
}
