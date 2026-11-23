import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { canAccessRoute, getLandingRoute } from "../auth/roles.js";

function AuthLayout({ children, mode }) {
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <Link to="/login" className="auth-brand">
          <span className="brand-symbol"><BookOpen size={22} /></span>
          <span>SMART<span>LIBRARY</span></span>
        </Link>
        <div className="auth-visual-copy">
          <span className="auth-kicker"><Sparkles size={14} /> KHÔNG GIAN TRI THỨC MỚI</span>
          <h1>Thư viện thông minh,<br /><span>tri thức trong tầm tay.</span></h1>
          <p>Quản lý bộ sưu tập, kết nối độc giả và khám phá những gợi ý đọc sách phù hợp với sức mạnh AI.</p>
        </div>
        <div className="auth-art" aria-hidden="true">
          <div className="auth-orbit orbit-one" />
          <div className="auth-orbit orbit-two" />
          <div className="auth-book auth-book-back"><BookOpen size={30} /></div>
          <div className="auth-book auth-book-front"><BookOpen size={34} /></div>
          <span className="auth-art-star star-one">✦</span>
          <span className="auth-art-star star-two">✧</span>
          <span className="auth-art-spark"><Sparkles size={22} /></span>
          <div className="auth-art-note"><span className="online-dot" /><span><b>Thư viện của bạn</b><small>Tri thức luôn sẵn sàng</small></span></div>
        </div>
        <div className="auth-visual-footer"><span>© 2026 SMARTLIBRARY AI</span><span>Đọc để mở ra thế giới mới</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-mobile-brand"><span className="brand-symbol"><BookOpen size={20} /></span><b>SMART<span>LIBRARY</span></b></div>
          <div className="auth-heading">
            <span className="auth-step">{mode === "login" ? "CHÀO MỪNG TRỞ LẠI" : "BẮT ĐẦU HÀNH TRÌNH"}</span>
            <h2>{mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h2>
            <p>{mode === "login" ? "Đăng nhập để tiếp tục quản lý thư viện của bạn." : "Tạo tài khoản độc giả để khám phá thư viện."}</p>
          </div>
          {children}
          <div className="auth-demo-note"><Sparkles size={15} /><span>Đăng nhập được xác thực bởi Worker; mật khẩu không được lưu trong trình duyệt.</span></div>
        </div>
      </section>
    </div>
  );
}

function PasswordField({ value, onChange, label = "Mật khẩu", autoComplete = "current-password", minLength = 8 }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="form-field">
      <span>{label}</span>
      <span className="input-with-icon">
        <LockKeyhole size={17} />
        <input type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Nhập mật khẩu" autoComplete={autoComplete} required minLength={minLength} />
        <button type="button" className="password-toggle" onClick={() => setVisible(!visible)} aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button>
      </span>
    </label>
  );
}

export function LoginPage({ onLogin, serverError = "" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const user = await onLogin({ email, password });
      const requestedPath = location.state?.from?.pathname;
      const destination = canAccessRoute(user.role, requestedPath) ? requestedPath : getLandingRoute(user.role);
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Không thể đăng nhập. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout mode="login">
      <form className="auth-form" onSubmit={submit}>
        <label className="form-field">
          <span>Email</span>
          <span className="input-with-icon"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ten@thuvien.vn" autoComplete="email" required /></span>
        </label>
        <PasswordField value={password} onChange={setPassword} />
        <div className="auth-form-meta"><span className="auth-session-note">Phiên được bảo vệ bằng cookie HttpOnly</span><button type="button" className="text-button" onClick={() => setError("Vui lòng liên hệ quản trị viên để khôi phục tài khoản.")}>Quên mật khẩu?</button></div>
        {(error || serverError) && <p className="form-error auth-error" role="alert">{error || serverError}</p>}
        <button type="submit" className="button button-primary button-wide" disabled={isSubmitting}>{isSubmitting ? "Đang xác thực..." : "Đăng nhập"} {!isSubmitting && <ArrowRight size={17} />}</button>
        <p className="auth-reader-role">Tài khoản thủ thư/quản trị được cấp riêng; đăng ký mới chỉ có quyền Độc giả.</p>
        <p className="auth-switch">Chưa có tài khoản? <Link to="/register">Đăng ký độc giả</Link></p>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage({ onRegister }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    if (!accepted) return;
    if (password !== confirmPassword) {
      setError("Mật khẩu xác nhận chưa khớp.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      await onRegister({ name: name.trim(), email: email.trim(), password });
      navigate("/dashboard", { replace: true });
    } catch (registrationError) {
      setError(registrationError.message || "Không thể tạo tài khoản. Vui lòng thử lại.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout mode="register">
      <form className="auth-form" onSubmit={submit}>
        <label className="form-field">
          <span>Họ và tên</span>
          <span className="input-with-icon"><UserRound size={17} /><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nguyễn Văn An" autoComplete="name" required minLength={2} /></span>
        </label>
        <label className="form-field">
          <span>Email</span>
          <span className="input-with-icon"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="ten@email.com" autoComplete="email" required /></span>
        </label>
        <PasswordField value={password} onChange={setPassword} label="Tạo mật khẩu" autoComplete="new-password" minLength={10} />
        <PasswordField value={confirmPassword} onChange={setConfirmPassword} label="Xác nhận mật khẩu" autoComplete="new-password" minLength={10} />
        <p className="form-hint">Dùng tối thiểu 10 ký tự. Worker băm mật khẩu bằng PBKDF2 trước khi lưu vào D1.</p>
        <label className="checkbox-field register-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Tôi đồng ý với quy định sử dụng thư viện và chính sách bảo mật.</span></label>
        {error && <p className="form-error auth-error" role="alert">{error}</p>}
        <button type="submit" className="button button-primary button-wide" disabled={!accepted || isSubmitting}>{isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"} {!isSubmitting && <ArrowRight size={17} />}</button>
        <div className="auth-benefits"><span><Check size={14} /> Theo dõi lịch sử mượn</span><span><Check size={14} /> Nhận gợi ý sách phù hợp</span></div>
        <p className="auth-reader-role">Tài khoản đăng ký mới chỉ có quyền Độc giả.</p>
        <p className="auth-switch">Đã có tài khoản? <Link to="/login">Đăng nhập</Link></p>
      </form>
    </AuthLayout>
  );
}
