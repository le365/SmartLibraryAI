import { useEffect, useMemo, useState } from "react";
import { BookPlus, ChevronDown, Eye, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { ROLE, roleLabels } from "../auth/roles.js";
import { API_BASE_URL, api } from "../api/client.js";
import { Badge, BookCover, DataTable, Modal, PageHeader, SearchField } from "../components/ui.jsx";

const emptyForm = {
  title: "",
  author: "",
  publisher: "",
  isbn: "",
  category: "",
  description: "",
  totalCopies: "1",
};

function stockStatus(book) {
  if (book.availableCopies === 0) return { text: "Hết sách", tone: "danger" };
  if (book.availableCopies <= 3) return { text: "Sắp hết", tone: "warning" };
  return { text: "Còn sách", tone: "success" };
}

function CoverThumbnail({ book, compact = false }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [book.coverUrl]);
  if (!book.coverUrl || failed) return <BookCover title={book.title} compact={compact} />;
  const imageUrl = book.coverUrl.startsWith("/")
    ? `${API_BASE_URL}${book.coverUrl}`
    : book.coverUrl;
  return (
    <img
      className={`book-cover-image${compact ? " book-cover-image-compact" : ""}`}
      src={imageUrl}
      alt={`Bìa sách ${book.title}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function validateBookForm(form) {
  if (!form.title.trim() || form.title.trim().length > 200) return "Tên sách cần có 1–200 ký tự.";
  if (!form.author.trim() || form.author.trim().length > 160) return "Tác giả cần có 1–160 ký tự.";
  if (form.publisher.trim().length > 160) return "Nhà xuất bản tối đa 160 ký tự.";
  if (form.isbn.trim().length > 24) return "ISBN tối đa 24 ký tự.";
  if (!form.category.trim() || form.category.trim().length > 80) return "Thể loại cần có 1–80 ký tự.";
  const totalCopies = Number(form.totalCopies);
  if (!Number.isInteger(totalCopies) || totalCopies < 1 || totalCopies > 10000) {
    return "Số lượng phải là số nguyên từ 1 đến 10.000.";
  }
  return "";
}

export function BooksPage({
  books,
  user,
  onAddBook,
  onUpdateBook,
  onDeleteBook,
  onBorrowBook,
  onNotify,
  searchQuery = "",
}) {
  const isReader = user.role === ROLE.READER;
  const canArchive = user.role === ROLE.ADMIN;
  const [query, setQuery] = useState(searchQuery);
  const [category, setCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [rows, setRows] = useState(books);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalMode, setModalMode] = useState("");
  const [selectedBook, setSelectedBook] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [borrowBusy, setBorrowBusy] = useState("");
  const [borrowFeedback, setBorrowFeedback] = useState(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState("");

  useEffect(() => {
    let active = true;
    api.categories.list()
      .then(({ items }) => { if (active) setCategories(items); })
      .catch((error) => { if (active) setLoadError(error.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError("");
      api.books.list({
        search: query.trim(),
        category,
        limit: 100,
        offset: 0,
      }).then((result) => {
        if (!active) return;
        setRows(result.items);
        setTotal(result.pagination.total);
      }).catch((error) => {
        if (active) setLoadError(error.message);
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, category, refreshKey]);

  const visibleBooks = useMemo(() => rows, [rows]);

  const loadMore = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.books.list({
        search: query.trim(),
        category,
        limit: 100,
        offset: rows.length,
      });
      setRows((current) => [...current, ...result.items]);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalMode("");
    setSelectedBook(null);
    setFormError("");
    setCoverError("");
  };

  const openCreate = () => {
    setForm({ ...emptyForm, category: categories[0]?.name || "Khác" });
    setFormError("");
    setModalMode("create");
  };

  const openEdit = (book) => {
    setSelectedBook(book);
    setForm({
      title: book.title || "",
      author: book.author || "",
      publisher: book.publisher || "",
      isbn: book.isbn || "",
      category: book.category || "",
      description: book.description || "",
      totalCopies: String(book.totalCopies ?? 1),
    });
    setFormError("");
    setModalMode("edit");
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateBookForm(form);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError("");
    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      publisher: form.publisher.trim(),
      isbn: form.isbn.trim() || null,
      category: form.category.trim(),
      description: form.description.trim(),
      totalCopies: Number(form.totalCopies),
    };
    try {
      if (modalMode === "edit") {
        await onUpdateBook(selectedBook.id, payload);
        onNotify("Đã cập nhật thông tin sách.");
      } else {
        await onAddBook(payload);
        onNotify("Đã thêm sách vào D1.");
      }
      setRefreshKey((value) => value + 1);
      api.categories.list()
        .then(({ items }) => setCategories(items))
        .catch((error) => setLoadError(error.message));
      closeModal();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const archiveBook = async (book) => {
    if (!window.confirm(`Xóa sách “${book.title}”? Sách sẽ được lưu trữ để bảo toàn lịch sử mượn.`)) return;
    try {
      await onDeleteBook(book.id);
      onNotify("Đã lưu trữ sách.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setLoadError(error.message);
    }
  };

  const borrowBook = async (book) => {
    setBorrowBusy(book.id);
    setBorrowFeedback(null);
    try {
      await onBorrowBook(book);
      setBorrowFeedback({ type: "success", text: `Đã gửi yêu cầu mượn “${book.title}”. Vui lòng chờ thủ thư duyệt.` });
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setBorrowFeedback({ type: "error", text: error.message || "Không thể mượn sách. Vui lòng thử lại." });
    } finally {
      setBorrowBusy("");
    }
  };

  const uploadCover = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !selectedBook) return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const { book, cleanupPending } = await api.books.uploadCover(selectedBook.id, file);
      setSelectedBook(book);
      setRows((current) => current.map((item) => item.id === book.id ? book : item));
      setRefreshKey((value) => value + 1);
      onNotify(cleanupPending
        ? "Đã thay ảnh bìa, nhưng chưa thể dọn ảnh cũ khỏi R2."
        : "Đã tải ảnh bìa lên R2.");
    } catch (error) {
      setCoverError(error.message || "Không thể tải ảnh bìa lên.");
    } finally {
      setCoverBusy(false);
      input.value = "";
    }
  };

  const deleteCover = async () => {
    if (!selectedBook) return;
    setCoverBusy(true);
    setCoverError("");
    try {
      const { book, cleanupPending } = await api.books.deleteCover(selectedBook.id);
      setSelectedBook(book);
      setRows((current) => current.map((item) => item.id === book.id ? book : item));
      setRefreshKey((value) => value + 1);
      onNotify(cleanupPending
        ? "Đã gỡ ảnh bìa, nhưng object cũ chưa được xóa khỏi R2."
        : "Đã xóa ảnh bìa.");
    } catch (error) {
      setCoverError(error.message || "Không thể xóa ảnh bìa.");
    } finally {
      setCoverBusy(false);
    }
  };

  const columns = [
    { key: "title", label: "SÁCH", render: (book) => <div className="table-book-cell"><CoverThumbnail book={book} /><span><strong>{book.title}</strong><small>{book.author} · {book.publisher || "Chưa có NXB"}</small></span></div> },
    { key: "id", label: "MÃ SÁCH", render: (book) => <span className="mono-text" title={book.id}>{book.id.slice(0, 8).toUpperCase()}</span> },
    { key: "isbn", label: "ISBN", render: (book) => <span className="mono-text">{book.isbn || "—"}</span> },
    { key: "category", label: "THỂ LOẠI", render: (book) => <Badge tone="category">{book.category}</Badge> },
    { key: "stock", label: "SỐ LƯỢNG", render: (book) => <div className="stock-cell"><strong>{book.availableCopies}<small> / {book.totalCopies}</small></strong><div className="stock-track"><i className={book.availableCopies === 0 ? "stock-empty" : ""} style={{ width: `${book.totalCopies ? book.availableCopies / book.totalCopies * 100 : 0}%` }} /></div></div> },
    { key: "status", label: "TRẠNG THÁI", render: (book) => { const status = stockStatus(book); return <Badge tone={status.tone} dot>{status.text}</Badge>; } },
    {
      key: "actions",
      label: "THAO TÁC",
      className: "action-cell",
      render: (book) => <div className="table-actions">
      <button type="button" className="icon-button row-action" aria-label={`Xem ${book.title}`} title="Chi tiết" onClick={() => { setSelectedBook(book); setCoverError(""); setModalMode("detail"); }}><Eye size={15} /></button>
        {!isReader && <button type="button" className="icon-button row-action" aria-label={`Sửa ${book.title}`} title="Sửa sách" onClick={() => openEdit(book)}><Pencil size={15} /></button>}
        {canArchive && <button type="button" className="icon-button row-action row-action-danger" aria-label={`Xóa ${book.title}`} title="Lưu trữ sách" onClick={() => archiveBook(book)}><Trash2 size={15} /></button>}
        {isReader && <button type="button" className="button button-return" disabled={book.availableCopies < 1 || borrowBusy === book.id} onClick={() => borrowBook(book)}>{borrowBusy === book.id ? "Đang xử lý…" : book.availableCopies > 0 ? "Mượn sách" : "Hết sách"}</button>}
      </div>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={isReader ? "KHÁM PHÁ TRI THỨC" : "BỘ SƯU TẬP"}
        title={isReader ? "Khám phá sách" : "Quản lý sách"}
        description={isReader ? "Tra cứu sách đang có trong thư viện." : "Thông tin sách được lưu trực tiếp trong cơ sở dữ liệu D1."}
        actions={isReader ? <Badge tone="blue">{roleLabels[user.role]}</Badge> : <button type="button" className="button button-primary" onClick={openCreate}><Plus size={17} /> Thêm sách mới</button>}
      />
      <section className="panel list-panel">
        <div className="list-toolbar">
          <div className="toolbar-title"><strong>{isReader ? "Danh mục sách" : "Tất cả đầu sách"}</strong><Badge tone="neutral">{total} đầu sách</Badge></div>
          <div className="toolbar-filters">
            <SearchField value={query} onChange={setQuery} placeholder="Tìm tên, tác giả, NXB, ISBN..." />
            <label className="select-wrap"><SlidersHorizontal size={15} /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Lọc thể loại"><option value="">Tất cả thể loại</option>{categories.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label>
          </div>
        </div>
        {borrowFeedback && <p className={`book-feedback book-feedback-${borrowFeedback.type}`} role={borrowFeedback.type === "error" ? "alert" : "status"}>{borrowFeedback.text}</p>}
        {loadError && <p className="data-error" role="alert">{loadError}</p>}
        {loading && !visibleBooks.length && <p className="data-loading" role="status">Đang tải sách từ D1…</p>}
        <DataTable columns={columns} rows={visibleBooks} emptyMessage={loading ? "Đang tải…" : "Không tìm thấy đầu sách phù hợp trong D1."} />
        <div className="table-footer"><span>Đang hiển thị <strong>{visibleBooks.length}</strong> / <strong>{total}</strong> đầu sách</span>{visibleBooks.length < total && <button type="button" className="text-button" disabled={loading} onClick={loadMore}>Tải thêm 100</button>}</div>
      </section>

      <Modal open={modalMode === "create" || modalMode === "edit"} title={modalMode === "edit" ? "Cập nhật thông tin sách" : "Thêm sách mới"} description="Thông tin sẽ được kiểm tra và lưu vào D1." onClose={closeModal} size="large">
        <form className="modal-form" onSubmit={submit}>
          <div className="form-grid-two">
            <label className="form-field"><span>Tên sách *</span><input className="text-input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={200} required /></label>
            <label className="form-field"><span>Tác giả *</span><input className="text-input" value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} maxLength={160} required /></label>
          </div>
          <div className="form-grid-two">
            <label className="form-field"><span>Nhà xuất bản</span><input className="text-input" value={form.publisher} onChange={(event) => setForm({ ...form, publisher: event.target.value })} maxLength={160} /></label>
            <label className="form-field"><span>ISBN</span><input className="text-input" value={form.isbn} onChange={(event) => setForm({ ...form, isbn: event.target.value })} maxLength={24} /></label>
          </div>
          <div className="form-grid-two">
            <label className="form-field"><span>Thể loại *</span><input className="text-input" list="book-category-options" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={80} required placeholder="Chọn hoặc nhập thể loại" /><datalist id="book-category-options">{categories.map((item) => <option key={item.id} value={item.name} />)}</datalist></label>
            <label className="form-field"><span>Số lượng bản *</span><input className="text-input" type="number" min="1" max="10000" step="1" value={form.totalCopies} onChange={(event) => setForm({ ...form, totalCopies: event.target.value })} required /></label>
          </div>
          <label className="form-field"><span>Mô tả</span><textarea className="text-input text-area" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={2000} rows={3} /></label>
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>Hủy</button><button type="submit" className="button button-primary" disabled={saving}><BookPlus size={16} />{saving ? "Đang lưu…" : modalMode === "edit" ? "Lưu thay đổi" : "Thêm sách"}</button></div>
        </form>
      </Modal>

      <Modal open={modalMode === "detail" && Boolean(selectedBook)} title="Chi tiết sách" description="Metadata lấy từ D1; ảnh bìa được lưu trên R2." onClose={closeModal}>
        {selectedBook && <div className="book-detail">
          <CoverThumbnail book={selectedBook} />
          <dl>
            <div><dt>Mã sách</dt><dd className="mono-text">{selectedBook.id}</dd></div>
            <div><dt>Tên sách</dt><dd>{selectedBook.title}</dd></div>
            <div><dt>Tác giả</dt><dd>{selectedBook.author}</dd></div>
            <div><dt>Nhà xuất bản</dt><dd>{selectedBook.publisher || "—"}</dd></div>
            <div><dt>ISBN</dt><dd>{selectedBook.isbn || "—"}</dd></div>
            <div><dt>Thể loại</dt><dd>{selectedBook.category}</dd></div>
            <div><dt>Số lượng</dt><dd>{selectedBook.availableCopies} còn / {selectedBook.totalCopies} tổng</dd></div>
            <div><dt>Mô tả</dt><dd>{selectedBook.description || "—"}</dd></div>
          </dl>
          {!isReader && <div className="book-cover-controls">
            <label className="form-field"><span>Ảnh bìa (JPEG, PNG hoặc WebP; tối đa 5 MB)</span><input className="text-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={coverBusy} onChange={uploadCover} /></label>
            {selectedBook.coverUrl && <button type="button" className="button button-secondary" disabled={coverBusy} onClick={deleteCover}>{coverBusy ? "Đang xử lý…" : "Xóa ảnh bìa"}</button>}
            {coverError && <p className="form-error" role="alert">{coverError}</p>}
          </div>}
        </div>}
      </Modal>
    </>
  );
}
