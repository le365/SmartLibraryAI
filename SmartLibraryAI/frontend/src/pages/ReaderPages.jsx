import { ArrowRight, BookOpen, Clock3, ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, BookCover, DataTable, PageHeader, StatCard } from "../components/ui.jsx";
import { dateLabel } from "../data/mockData.js";

function loanTone(status) {
  if (status === "Quá hạn") return "danger";
  if (status === "Đã trả") return "neutral";
  return "success";
}

export function ReaderDashboardPage({ user, books, loans }) {
  const navigate = useNavigate();
  const readerLoans = loans.filter((loan) => loan.readerId === user.readerId);
  const activeLoans = readerLoans.filter((loan) => loan.status !== "Đã trả");
  const columns = [
    { key: "bookTitle", label: "ĐẦU SÁCH", render: (loan) => <div className="table-book-cell"><BookCover title={loan.bookTitle} tone="blue" compact /><span><strong>{loan.bookTitle}</strong><small>{loan.id}</small></span></div> },
    { key: "borrowedAt", label: "NGÀY MƯỢN", render: (loan) => dateLabel(loan.borrowedAt) },
    { key: "dueAt", label: "HẠN TRẢ", render: (loan) => dateLabel(loan.dueAt) },
    { key: "status", label: "TRẠNG THÁI", render: (loan) => <Badge tone={loanTone(loan.status)} dot>{loan.status}</Badge> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="KHÔNG GIAN ĐỘC GIẢ"
        title={`Xin chào, ${user.name} 👋`}
        description="Tìm đọc cuốn sách tiếp theo và theo dõi các phiếu mượn của bạn."
        actions={<button type="button" className="button button-primary" onClick={() => navigate("/books")}><BookOpen size={16} /> Khám phá sách</button>}
      />
      <section className="stats-grid">
        <StatCard icon={BookOpen} label="Sách có thể mượn" value={books.reduce((sum, book) => sum + book.available, 0).toLocaleString("vi-VN")} tone="blue" />
        <StatCard icon={Clock3} label="Phiếu đang mượn" value={activeLoans.length.toLocaleString("vi-VN")} tone="violet" />
        <StatCard icon={Clock3} label="Phiếu quá hạn" value={readerLoans.filter((loan) => loan.status === "Quá hạn").length.toLocaleString("vi-VN")} tone="rose" />
        <StatCard icon={BookOpen} label="Đã hoàn thành" value={readerLoans.filter((loan) => loan.status === "Đã trả").length.toLocaleString("vi-VN")} tone="green" />
      </section>
      <section className="panel reader-loan-panel">
        <div className="panel-heading">
          <div><h2>Phiếu mượn của tôi</h2><p>Theo dõi hạn trả và trạng thái các đầu sách.</p></div>
          <button type="button" className="button button-ghost" onClick={() => navigate("/loans")}>Xem chi tiết <ArrowRight size={15} /></button>
        </div>
        <DataTable columns={columns} rows={readerLoans.slice(0, 5)} emptyMessage="Bạn chưa có phiếu mượn nào." />
      </section>
      <section className="dashboard-callout reader-callout">
        <span className="callout-icon"><BookOpen size={19} /></span>
        <div><strong>Đang tìm cảm hứng đọc?</strong><p>Duyệt danh mục và tìm các đầu sách còn sẵn tại thư viện.</p></div>
        <button type="button" className="button button-light" onClick={() => navigate("/books")}>Tìm sách <ArrowRight size={15} /></button>
      </section>
    </>
  );
}

export function ReaderLoansPage({ loans, requests }) {
  const navigate = useNavigate();
  const columns = [
    { key: "id", label: "MÃ PHIẾU", render: (loan) => <span className="mono-text">{loan.id}</span> },
    { key: "bookTitle", label: "ĐẦU SÁCH", render: (loan) => <div className="loan-book-copy"><strong>{loan.bookTitle}</strong><small>{loan.bookId}</small></div> },
    { key: "borrowedAt", label: "NGÀY MƯỢN", render: (loan) => dateLabel(loan.borrowedAt) },
    { key: "dueAt", label: "HẠN TRẢ", render: (loan) => <span className={loan.status === "Quá hạn" ? "date-overdue" : ""}>{dateLabel(loan.dueAt)}</span> },
    { key: "status", label: "TRẠNG THÁI", render: (loan) => <Badge tone={loanTone(loan.status)} dot>{loan.status}</Badge> },
  ];
  const requestColumns = [
    { key: "bookTitle", label: "ĐẦU SÁCH", render: (request) => <div className="loan-book-copy"><strong>{request.bookTitle}</strong><small>{request.bookId}</small></div> },
    { key: "requestedAt", label: "NGÀY YÊU CẦU", render: (request) => dateLabel(request.requestedAt) },
    { key: "status", label: "TRẠNG THÁI", render: (request) => <Badge tone={request.status === "pending" ? "warning" : request.status === "approved" ? "success" : "neutral"} dot>{request.status === "pending" ? "Chờ duyệt" : request.status === "approved" ? "Đã duyệt" : request.status === "rejected" ? "Đã từ chối" : "Đã hủy"}</Badge> },
    { key: "note", label: "GHI CHÚ", render: (request) => request.note || "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="TÀI KHOẢN ĐỘC GIẢ"
        title="Phiếu mượn của tôi"
        description="Danh sách và thời hạn các đầu sách bạn đang mượn."
        actions={<button type="button" className="button button-primary" onClick={() => navigate("/books")}><BookOpen size={16} /> Tìm sách</button>}
      />
      <section className="reader-loan-summary">
        <div><strong>{loans.filter((loan) => loan.status !== "Đã trả").length}</strong><span>Đang mượn</span></div>
        <div><strong>{loans.filter((loan) => loan.status === "Quá hạn").length}</strong><span>Quá hạn</span></div>
        <div><strong>{loans.filter((loan) => loan.status === "Đã trả").length}</strong><span>Đã trả</span></div>
      </section>
      <section className="panel list-panel">
        <div className="list-toolbar"><div className="toolbar-title"><strong>Lịch sử mượn</strong><Badge tone="neutral">{loans.length} phiếu</Badge></div></div>
        <DataTable columns={columns} rows={loans} emptyMessage="Bạn chưa có phiếu mượn nào. Hãy khám phá các đầu sách hiện có." />
        <div className="table-footer"><span>Để gia hạn hoặc trả sách, vui lòng liên hệ thủ thư.</span></div>
      </section>
      <section className="panel list-panel">
        <div className="list-toolbar"><div className="toolbar-title"><strong>Yêu cầu mượn sách</strong><Badge tone="neutral">{requests.length} yêu cầu</Badge></div></div>
        <DataTable columns={requestColumns} rows={requests} emptyMessage="Bạn chưa gửi yêu cầu mượn sách nào." />
      </section>
    </>
  );
}

export function AccessDeniedPage() {
  const navigate = useNavigate();
  return (
    <section className="access-denied panel">
      <span className="access-denied-icon"><ShieldAlert size={25} /></span>
      <h1>Không đủ quyền truy cập</h1>
      <p>Vai trò hiện tại không được phép mở trang này. Nếu bạn cần quyền quản trị, hãy liên hệ thủ thư hoặc quản trị viên.</p>
      <button type="button" className="button button-primary" onClick={() => navigate("/dashboard", { replace: true })}>Về trang của tôi <ArrowRight size={15} /></button>
    </section>
  );
}
