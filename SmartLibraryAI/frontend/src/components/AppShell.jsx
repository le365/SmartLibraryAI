import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Avatar, Toast } from "./ui.jsx";
import { canAccessRoute, roleLabels } from "../auth/roles.js";

const navigation = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, section: "TỔNG QUAN" },
  { label: "Quản lý sách", path: "/books", icon: BookOpen },
  { label: "Độc giả", path: "/readers", icon: Users },
  { label: "Mượn & trả sách", path: "/loans", icon: ArrowLeftRight, section: "NGHIỆP VỤ" },
  { label: "Phân loại bằng AI", path: "/ai", icon: Sparkles, tag: "AI" },
  { label: "Chat Box", path: "/chat", icon: MessageCircle },
  { label: "Thống kê", path: "/statistics", icon: BarChart3, section: "BÁO CÁO" },
];

export function AppShell({ user, onLogout, children, toast, onNotify, onDismissToast, dataLoading, dataError }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const allowedNavigation = navigation.filter((item) => canAccessRoute(user.role, item.path));

  const submitSearch = (event) => {
    event.preventDefault();
    const query = searchValue.trim();
    if (query) navigate("/books", { state: { query } });
  };

  const logout = async () => {
    try {
      await onLogout();
      navigate("/login", { replace: true });
    } catch (error) {
      onNotify(error.message || "Không thể đăng xuất. Vui lòng thử lại.", "error");
    }
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="app-shell">
      {menuOpen && <button className="sidebar-backdrop" aria-label="Đóng menu" onClick={closeMenu} />}
      <aside className={`sidebar${menuOpen ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-symbol"><BookOpen size={21} /></span>
          <span className="brand-name">SMART<span>LIBRARY</span><small>AI LIBRARY MANAGEMENT</small></span>
          <button type="button" className="icon-button mobile-close" onClick={closeMenu} aria-label="Đóng menu"><X size={18} /></button>
        </div>

        <div className="library-switcher">
          <div className="library-avatar">TV</div>
          <div><strong>Thư viện trung tâm</strong><span>Cơ sở chính</span></div>
          <ChevronDown size={15} />
        </div>

        <nav className="sidebar-nav" aria-label="Điều hướng chính">
          {allowedNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.path}>
                {item.section && <p className="nav-section-label">{item.section}</p>}
                <NavLink to={item.path} onClick={closeMenu} className={({ isActive }) => `nav-link${isActive ? " nav-link-active" : ""}`}>
                  <Icon size={18} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.tag && <span className="nav-tag">{item.tag}</span>}
                </NavLink>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <span className="storage-icon"><Sparkles size={16} /></span>
            <div><strong>Trợ lý AI</strong><span>Được cấu hình theo môi trường</span></div>
          </div>
          <div className="sidebar-footer"><span className={dataError ? "status-dot status-dot-error" : "online-dot"} /> {dataError ? "API chưa sẵn sàng" : "Dữ liệu từ API"}</div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
            <div className="breadcrumb"><span>Thư viện</span><i>/</i><strong>{navigation.find((item) => item.path === location.pathname)?.label || "Dashboard"}</strong></div>
          </div>
          <div className="topbar-actions">
            <form className="global-search" onSubmit={submitSearch}>
              <Search size={16} />
              <input value={searchValue} onChange={(event) => setSearchValue(event.target.value)} placeholder="Tìm sách, độc giả..." aria-label="Tìm kiếm toàn hệ thống" />
              <kbd>⌘ K</kbd>
            </form>
            <div className="popover-anchor">
              <button type="button" className={`icon-button notification-button${notificationsOpen ? " icon-button-selected" : ""}`} onClick={() => { setNotificationsOpen(!notificationsOpen); setAccountOpen(false); }} aria-label="Thông báo">
                <Bell size={18} />
              </button>
              {notificationsOpen && (
                <div className="popover notification-popover">
                  <strong>Thông báo</strong>
                  <p><span className="notification-mark"><Bell size={14} /></span><span><b>Không có thông báo mới</b><small>Thông báo sẽ xuất hiện khi có dữ liệu thực.</small></span></p>
                </div>
              )}
            </div>
            <div className="popover-anchor">
              <button type="button" className="profile-button" onClick={() => { setAccountOpen(!accountOpen); setNotificationsOpen(false); }}>
                <Avatar name={user.name} tone="blue" size="small" />
                <span className="profile-copy"><strong>{user.name}</strong><small>{roleLabels[user.role] || user.role}</small></span>
                <ChevronDown size={15} />
              </button>
              {accountOpen && (
                <div className="popover account-popover">
                  <div className="account-popover-user"><strong>{user.name}</strong><span>{user.email}</span></div>
                  <button type="button" onClick={logout}><LogOut size={15} /> Đăng xuất</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main-content">
          {dataLoading && <p className="data-state-banner" role="status">Đang tải dữ liệu thư viện từ API…</p>}
          {dataError && <p className="data-error data-state-banner" role="alert">{dataError}</p>}
          {children}
        </main>
        <footer className="app-footer"><span>SMARTLIBRARY AI <i>•</i> Sách và độc giả từ Cloudflare D1</span><span>Được thiết kế cho thư viện hiện đại</span></footer>
      </div>
      <Toast toast={toast} onClose={onDismissToast} />
    </div>
  );
}
