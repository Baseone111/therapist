import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/patients', label: 'Patients' },
  { to: '/admin/register', label: 'Register Patient' },
  { to: '/admin/reassignments', label: 'Reassignment Requests' },
  { to: '/admin/therapists', label: 'Therapists' },
];

const therapistNav = [
  { to: '/therapist/dashboard', label: 'Dashboard' },
  { to: '/therapist/patients', label: 'All Patients' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const nav = user?.role === 'admin' ? adminNav : therapistNav;

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          Children's Therapy Center
          <span>{user?.role === 'admin' ? 'Administration' : 'Therapist Portal'}</span>
        </div>
        <nav className="sidebar-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => isActive ? 'active' : ''}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ fontSize: 13, color: 'var(--color-text)', marginBottom: 8 }}>
            <strong>{user?.full_name}</strong>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
