import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import AppRoutes from './routes/AppRoutes';
import './styles/global.css';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
              fontSize: 13.5,
            },
            success: { duration: 4000 },
            error: { duration: 6000 },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  );
}
