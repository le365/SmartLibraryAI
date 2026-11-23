import { ArrowRight, ArrowUpRight, BookOpen, Clock3, Sparkles, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, BookCover, DataTable, PageHeader, StatCard, Avatar } from "../components/ui.jsx";
import { dateLabel } from "../data/mockData.js";
import { ROLE } from "../auth/roles.js";

function statusTone(status) {
  if (status === "Quá hạn") return "danger";
  if (status === "Đã trả") return "neutral";
  return "success";
}

export function DashboardPage({ user, books, readers, loans }) {
  const navigate = useNavigate();
  const activeLoans = loans.filter((loan) => loan.status !== "Đã trả");
  const overdueLoans = loans.filter((loan) => loan.status === "Quá hạn");
  const recentLoans = [...loans].slice(0, 5);
  const popularBooks = books.slice(0, 4);
  const isLibrarian = user.role === ROLE.LIBRARIAN;

  const columns = [
    { key: "bookTitle", label: "SÁCH", render: (loan) => <div className="table-book-cell"><BookCover title={loan.bookTitle} tone="blue" compact /><span><strong>{loan.bookTitle}</strong><small>{loan.id}</small></span></div> },
    { key: "readerName", label: "ĐỘC GIẢ", render: (loan) => <div className="table-person-cell"><Avatar name={loan.readerName} tone="violet" size="small" /><span>{loan.readerName}</span></div> },
    { key: "borrowedAt", label: "NGÀY MƯỢN", render: (loan) => dateLabel(loan.borrowedAt) },
    { key: "dueAt", label: "HẠN TRẢ", render: (loan) => dateLabel(loan.dueAt) },
    { key: "status", label: "TRẠNG THÁI", render: (loan) => <Badge tone={statusTone(loan.status)} dot>{loan.status}</Badge> },
  ];

  return (
    <>
      <PageHeader
        eyebrow={isLibrarian ? "NGHIỆP VỤ THƯ VIỆN" : "TỔNG QUAN HỆ THỐNG"}
        title={`Xin chào, ${user.name} 👋`}
        description={isLibrarian ? "Theo dõi sách, độc giả và các hoạt động mượn trả trong hôm nay." : "Đây là những gì đang diễn ra tại thư viện của bạn hôm nay."}
        actions={<button type="button" className="button button-primary" onClick={() => navigate("/loans")}><ArrowRight size={16} /> Tạo phiếu mượn</button>}
      />

      <section className="stats-grid">
        <StatCard icon={BookOpen} label="Tổng đầu sách" value={books.length.toLocaleString("vi-VN")} change="+8.2% tháng này" tone="blue" />
        <StatCard icon={Users} label="Độc giả hoạt động" value={readers.filter((reader) => reader.status === "Đang hoạt động").length.toLocaleString("vi-VN")} change="+12.5% tháng này" tone="violet" />
        <StatCard icon={ArrowUpRight} label="Đang được mượn" value={activeLoans.length.toLocaleString("vi-VN")} change="Hôm nay" tone="cyan" />
        <StatCard icon={Clock3} label="Phiếu quá hạn" value={overdueLoans.length.toLocaleString("vi-VN")} tone="rose" />
      </section>

      <section className="dashboard-grid">
        <article className="panel recent-panel">
          <div className="panel-heading">
            <div><h2>Hoạt động mượn gần đây</h2><p>Theo dõi các giao dịch mới nhất</p></div>
            <button type="button" className="button button-ghost" onClick={() => navigate("/loans")}>Xem tất cả <ArrowRight size={15} /></button>
          </div>
          <DataTable columns={columns} rows={recentLoans} emptyMessage="Chưa có hoạt động mượn sách." />
        </article>

        <article className="panel popular-panel">
          <div className="panel-heading">
            <div><h2>Sách được quan tâm</h2><p>Lựa chọn nổi bật trong thư viện</p></div>
            <button type="button" className="icon-button subtle-icon-button" onClick={() => navigate("/books")} aria-label="Mở quản lý sách"><ArrowUpRight size={17} /></button>
          </div>
          <div className="popular-list">
            {popularBooks.map((book, index) => (
              <div className="popular-item" key={book.id}>
                <span className="popular-rank">0{index + 1}</span>
                <BookCover title={book.title} tone={book.tone} />
                <div className="popular-book-copy"><strong>{book.title}</strong><span>{book.author}</span><div className="popular-progress"><i style={{ width: `${Math.max(18, book.available / book.total * 100)}%` }} /></div></div>
                <span className="popular-count">{book.total - book.available}<small>lượt mượn</small></span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-callout">
        <span className="callout-icon">{isLibrarian ? <Clock3 size={20} /> : <Sparkles size={20} />}</span>
        <div>
          <strong>{isLibrarian ? "Theo dõi các phiếu mượn trong ngày" : "Khám phá sức mạnh AI trong thư viện"}</strong>
          <p>{isLibrarian ? "Xử lý phiếu mượn và cập nhật trạng thái trả sách." : "Phân loại tài liệu nhanh hơn và gợi ý sách phù hợp cho từng độc giả."}</p>
        </div>
        <button type="button" className="button button-light" onClick={() => navigate(isLibrarian ? "/loans" : "/ai")}>{isLibrarian ? "Mở phiếu mượn" : "Khám phá AI"} <ArrowRight size={15} /></button>
      </section>
    </>
  );
}
