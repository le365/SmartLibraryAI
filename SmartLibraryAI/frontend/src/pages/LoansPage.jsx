import { useMemo, useState } from "react";
import { ArrowDownToLine, Plus, RotateCcw } from "lucide-react";
import { Avatar, Badge, DataTable, Modal, PageHeader } from "../components/ui.jsx";
import { dateLabel } from "../data/mockData.js";

const filters = ["Tất cả", "Đang mượn", "Quá hạn", "Đã trả"];
const badgeTone = { "Đang mượn": "blue", "Quá hạn": "danger", "Đã trả": "neutral" };

export function LoansPage({ loans, requests, books, readers, onCreateLoan, onReturnLoan, onReviewRequest }) {
  const [filter, setFilter] = useState("Tất cả");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ bookId: "", readerId: "" });
  const [error, setError] = useState("");
  const [requestBusy, setRequestBusy] = useState("");
  const [requestError, setRequestError] = useState("");

  const filteredLoans = useMemo(() => filter === "Tất cả" ? loans : loans.filter((loan) => loan.status === filter), [filter, loans]);
  const availableBooks = books.filter((book) => book.available > 0);
  const activeReaders = readers.filter((reader) => reader.status === "Đang hoạt động");

  const openNewLoan = () => {
    setForm({ bookId: availableBooks[0]?.id || "", readerId: activeReaders[0]?.id || "" });
    setError("");
    setModalOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    const book = availableBooks.find((item) => item.id === form.bookId);
    const reader = activeReaders.find((item) => item.id === form.readerId);
    if (!book || !reader) {
      setError("Vui lòng chọn sách còn bản và độc giả đang hoạt động.");
      return;
    }
    onCreateLoan({ book, reader });
    setModalOpen(false);
  };

  const reviewRequest = async (request, decision) => {
    setRequestBusy(request.id);
    setRequestError("");
    try {
      await onReviewRequest(request.id, decision);
    } catch (reviewError) {
      setRequestError(reviewError.message || "Không thể xử lý yêu cầu. Vui lòng thử lại.");
    } finally {
      setRequestBusy("");
    }
  };

  const requestColumns = [
    { key: "readerName", label: "ĐỘC GIẢ", render: (request) => <div className="table-person-cell"><Avatar name={request.readerName} tone="violet" size="small" /><span>{request.readerName}<small>{request.readerCode}</small></span></div> },
    { key: "bookTitle", label: "SÁCH", render: (request) => <div className="loan-book-copy"><strong>{request.bookTitle}</strong><small>{request.availableCopies} bản còn tại thời điểm xem</small></div> },
    { key: "requestedAt", label: "NGÀY YÊU CẦU", render: (request) => dateLabel(request.requestedAt) },
    { key: "status", label: "TRẠNG THÁI", render: (request) => <Badge tone={request.status === "pending" ? "warning" : request.status === "approved" ? "success" : "neutral"} dot>{request.status === "pending" ? "Chờ duyệt" : request.status === "approved" ? "Đã duyệt" : request.status === "rejected" ? "Đã từ chối" : "Đã hủy"}</Badge> },
    { key: "actions", label: "", className: "action-cell", render: (request) => request.status === "pending" ? <div className="table-actions"><button type="button" className="button button-primary" disabled={requestBusy === request.id} onClick={() => reviewRequest(request, "approved")}>{requestBusy === request.id ? "Đang xử lý…" : "Duyệt"}</button><button type="button" className="button button-secondary" disabled={requestBusy === request.id} onClick={() => reviewRequest(request, "rejected")}>Từ chối</button></div> : <span className="returned-label">{request.note || "Đã xử lý"}</span> },
  ];

  const columns = [
    { key: "id", label: "MÃ PHIẾU", render: (loan) => <span className="mono-text">{loan.id}</span> },
    { key: "bookTitle", label: "SÁCH", render: (loan) => <div className="loan-book-copy"><strong>{loan.bookTitle}</strong><small>{loan.bookId}</small></div> },
    { key: "readerName", label: "ĐỘC GIẢ", render: (loan) => <div className="table-person-cell"><Avatar name={loan.readerName} tone="violet" size="small" /><span>{loan.readerName}</span></div> },
    { key: "borrowedAt", label: "NGÀY MƯỢN", render: (loan) => dateLabel(loan.borrowedAt) },
    { key: "dueAt", label: "HẠN TRẢ", render: (loan) => <span className={loan.status === "Quá hạn" ? "date-overdue" : ""}>{dateLabel(loan.dueAt)}</span> },
    { key: "status", label: "TRẠNG THÁI", render: (loan) => <Badge tone={badgeTone[loan.status]} dot>{loan.status}</Badge> },
    { key: "actions", label: "", className: "action-cell", render: (loan) => loan.status !== "Đã trả" ? <button type="button" className="button button-return" onClick={() => onReturnLoan(loan.id)}><RotateCcw size={14} /> Trả sách</button> : <span className="returned-label"><ArrowDownToLine size={14} /> Đã hoàn tất</span> },
  ];

  return (
    <>
      <PageHeader eyebrow="NGHIỆP VỤ THƯ VIỆN" title="Mượn & trả sách" description="Theo dõi phiếu mượn, thời hạn trả và tình trạng sách." actions={<button type="button" className="button button-primary" onClick={openNewLoan}><Plus size={17} /> Tạo phiếu mượn</button>} />
      <section className="loan-summary-grid">
        <div className="loan-summary-item"><span className="loan-summary-dot dot-blue" /><div><strong>{loans.filter((loan) => loan.status === "Đang mượn").length}</strong><span>Đang mượn</span></div></div>
        <div className="loan-summary-item"><span className="loan-summary-dot dot-red" /><div><strong>{loans.filter((loan) => loan.status === "Quá hạn").length}</strong><span>Quá hạn</span></div></div>
        <div className="loan-summary-item"><span className="loan-summary-dot dot-green" /><div><strong>{loans.filter((loan) => loan.status === "Đã trả").length}</strong><span>Đã trả</span></div></div>
        <div className="loan-summary-item"><span className="loan-summary-dot dot-violet" /><div><strong>{loans.length}</strong><span>Tổng phiếu</span></div></div>
      </section>
      <section className="panel list-panel">
        <div className="list-toolbar loan-toolbar">
          <div className="toolbar-title"><strong>Danh sách phiếu mượn</strong><Badge tone="neutral">{filteredLoans.length} phiếu</Badge></div>
          <div className="filter-tabs" role="tablist" aria-label="Lọc phiếu mượn">
            {filters.map((item) => <button type="button" role="tab" aria-selected={filter === item} key={item} className={filter === item ? "filter-tab filter-tab-active" : "filter-tab"} onClick={() => setFilter(item)}>{item}</button>)}
          </div>
        </div>
        <DataTable columns={columns} rows={filteredLoans} emptyMessage="Không có phiếu mượn trong trạng thái này." />
        <div className="table-footer"><span>Thời hạn mượn mặc định: 14 ngày</span><span>Dữ liệu chỉ lưu trong phiên demo</span></div>
      </section>

      <section className="panel list-panel">
        <div className="list-toolbar">
          <div className="toolbar-title"><strong>Yêu cầu mượn sách</strong><Badge tone="neutral">{requests.length} yêu cầu</Badge></div>
        </div>
        {requestError && <p className="data-error" role="alert">{requestError}</p>}
        <DataTable columns={requestColumns} rows={requests} emptyMessage="Chưa có yêu cầu mượn sách." />
      </section>

      <Modal open={modalOpen} title="Tạo phiếu mượn" description="Chọn độc giả và đầu sách còn bản để tạo phiếu." onClose={() => setModalOpen(false)}>
        <form className="modal-form" onSubmit={submit}>
          <label className="form-field"><span>Độc giả</span><select className="text-input" value={form.readerId} onChange={(event) => setForm({ ...form, readerId: event.target.value })} required><option value="" disabled>Chọn độc giả</option>{activeReaders.map((reader) => <option value={reader.id} key={reader.id}>{reader.name} · {reader.id}</option>)}</select></label>
          <label className="form-field"><span>Sách còn bản</span><select className="text-input" value={form.bookId} onChange={(event) => setForm({ ...form, bookId: event.target.value })} required><option value="" disabled>Chọn sách</option>{availableBooks.map((book) => <option value={book.id} key={book.id}>{book.title} · còn {book.available} cuốn</option>)}</select></label>
          {(!availableBooks.length || !activeReaders.length) && <p className="form-hint">Cần có ít nhất một sách còn bản và một độc giả đang hoạt động.</p>}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={() => setModalOpen(false)}>Hủy</button><button type="submit" className="button button-primary" disabled={!availableBooks.length || !activeReaders.length}><Plus size={16} /> Tạo phiếu</button></div>
        </form>
      </Modal>
    </>
  );
}
