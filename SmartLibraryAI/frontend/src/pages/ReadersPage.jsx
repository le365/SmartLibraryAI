import { useEffect, useState } from "react";
import { Pencil, Plus, Search, Trash2, UserRoundPlus } from "lucide-react";
import { ROLE } from "../auth/roles.js";
import { api } from "../api/client.js";
import { Avatar, Badge, DataTable, Modal, PageHeader, SearchField } from "../components/ui.jsx";
import { dateLabel } from "../data/mockData.js";

const emptyForm = { name: "", email: "", password: "", phone: "", status: "active" };

function mapReader(reader) {
  return {
    ...reader,
    statusValue: reader.status,
    status: reader.status === "active" ? "Đang hoạt động" : "Tạm khóa",
    joined: reader.createdAt,
    borrowed: reader.borrowed || 0,
    tone: "blue",
  };
}

function validateReaderForm(form, mode) {
  if (form.name.trim().length < 2 || form.name.trim().length > 100) return "Họ tên cần có 2–100 ký tự.";
  if (mode === "create") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) || form.email.trim().length > 254) return "Email không hợp lệ.";
    if (form.password.length < 10 || form.password.length > 128) return "Mật khẩu cần có 10–128 ký tự.";
  }
  if (form.phone.trim().length > 30) return "Số điện thoại tối đa 30 ký tự.";
  return "";
}

export function ReadersPage({ readers, user, onAddReader, onUpdateReader, onDeleteReader, onNotify }) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState(readers);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [modalMode, setModalMode] = useState("");
  const [selectedReader, setSelectedReader] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const canDelete = user.role === ROLE.ADMIN;

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError("");
      api.readers.list({ search: query.trim(), limit: 100, offset: 0 })
        .then((result) => {
          if (!active) return;
          setRows(result.items.map(mapReader));
          setTotal(result.pagination.total);
        })
        .catch((error) => { if (active) setLoadError(error.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 220);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, refreshKey]);

  const loadMore = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await api.readers.list({ search: query.trim(), limit: 100, offset: rows.length });
      setRows((current) => [...current, ...result.items.map(mapReader)]);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setModalMode("");
    setSelectedReader(null);
    setFormError("");
  };

  const openCreate = () => {
    setForm(emptyForm);
    setModalMode("create");
  };

  const openEdit = (reader) => {
    setSelectedReader(reader);
    setForm({
      ...emptyForm,
      name: reader.name,
      email: reader.email,
      phone: reader.phone || "",
      status: reader.statusValue || (reader.status === "Tạm khóa" ? "suspended" : "active"),
    });
    setModalMode("edit");
  };

  const submit = async (event) => {
    event.preventDefault();
    const validationError = validateReaderForm(form, modalMode);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setSaving(true);
    setFormError("");
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      ...(modalMode === "create" ? { email: form.email.trim(), password: form.password } : { status: form.status }),
    };
    try {
      if (modalMode === "edit") {
        await onUpdateReader(selectedReader.id, payload);
        onNotify("Đã cập nhật thông tin độc giả.");
      } else {
        await onAddReader(payload);
        onNotify("Đã thêm độc giả vào D1.");
      }
      setRefreshKey((value) => value + 1);
      closeModal();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const removeReader = async (reader) => {
    if (!window.confirm(`Xóa độc giả ${reader.name}? Tài khoản sẽ bị khóa để bảo toàn lịch sử mượn.`)) return;
    try {
      await onDeleteReader(reader.id);
      onNotify("Đã khóa hồ sơ độc giả.");
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setLoadError(error.message);
    }
  };

  const columns = [
    { key: "name", label: "ĐỘC GIẢ", render: (reader) => <div className="table-person-cell reader-name-cell"><Avatar name={reader.name} tone="blue" /><span><strong>{reader.name}</strong><small>{reader.email}</small></span></div> },
    { key: "readerCode", label: "MÃ THẺ", render: (reader) => <span className="mono-text" title={reader.readerCode}>{reader.readerCode}</span> },
    { key: "joined", label: "NGÀY THAM GIA", render: (reader) => dateLabel(reader.joined) },
    { key: "borrowed", label: "ĐANG MƯỢN", render: (reader) => <span className="borrowed-count">{reader.borrowed}<small> cuốn</small></span> },
    { key: "status", label: "TRẠNG THÁI", render: (reader) => <Badge tone={reader.statusValue === "active" ? "success" : "neutral"} dot>{reader.status}</Badge> },
    {
      key: "actions",
      label: "THAO TÁC",
      className: "action-cell",
      render: (reader) => <div className="table-actions">
        <button type="button" className="icon-button row-action" aria-label={`Sửa ${reader.name}`} title="Sửa độc giả" onClick={() => openEdit(reader)}><Pencil size={15} /></button>
        {canDelete && <button type="button" className="icon-button row-action row-action-danger" aria-label={`Xóa ${reader.name}`} title="Khóa hồ sơ" onClick={() => removeReader(reader)}><Trash2 size={15} /></button>}
      </div>,
    },
  ];

  const activeCount = rows.filter((reader) => reader.statusValue === "active").length;
  const borrowedCount = rows.reduce((sum, reader) => sum + reader.borrowed, 0);

  return (
    <>
      <PageHeader eyebrow="CỘNG ĐỒNG ĐỌC" title="Quản lý độc giả" description="Hồ sơ thành viên được lưu trong D1." actions={<button type="button" className="button button-primary" onClick={openCreate}><Plus size={17} /> Thêm độc giả</button>} />
      <section className="reader-summary-row">
        <div className="reader-summary-card"><span className="reader-summary-icon tone-blue"><Search size={18} /></span><div><strong>{total}</strong><span>Tổng độc giả</span></div></div>
        <div className="reader-summary-card"><span className="reader-summary-icon tone-green"><UserRoundPlus size={18} /></span><div><strong>{activeCount}</strong><span>Đang hoạt động trên trang</span></div></div>
        <div className="reader-summary-card"><span className="reader-summary-icon tone-violet"><Plus size={18} /></span><div><strong>{borrowedCount}</strong><span>Lượt mượn của kết quả đang tải</span></div></div>
      </section>
      <section className="panel list-panel">
        <div className="list-toolbar">
          <div className="toolbar-title"><strong>Danh sách độc giả</strong><Badge tone="neutral">{total} thành viên</Badge></div>
          <SearchField value={query} onChange={setQuery} placeholder="Tìm tên, email, mã thẻ..." />
        </div>
        {loadError && <p className="data-error" role="alert">{loadError}</p>}
        {loading && !rows.length && <p className="data-loading" role="status">Đang tải độc giả từ D1…</p>}
        <DataTable columns={columns} rows={rows} emptyMessage={loading ? "Đang tải…" : "Không tìm thấy độc giả trong D1."} />
        <div className="table-footer"><span>Đang hiển thị <strong>{rows.length}</strong> / <strong>{total}</strong> độc giả</span>{rows.length < total && <button type="button" className="text-button" disabled={loading} onClick={loadMore}>Tải thêm 100</button>}</div>
      </section>

      <Modal open={modalMode === "create" || modalMode === "edit"} title={modalMode === "edit" ? "Cập nhật độc giả" : "Thêm độc giả"} description="Thông tin hồ sơ được lưu trực tiếp vào D1." onClose={closeModal}>
        <form className="modal-form" onSubmit={submit}>
          <label className="form-field"><span>Họ và tên *</span><input className="text-input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={100} minLength={2} required /></label>
          {modalMode === "create" && <>
            <label className="form-field"><span>Email *</span><input className="text-input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} maxLength={254} required /></label>
            <label className="form-field"><span>Mật khẩu khởi tạo *</span><input className="text-input" type="password" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} minLength={10} maxLength={128} required /><small className="form-hint">Mật khẩu được băm ở Worker; không lưu dạng thuần.</small></label>
          </>}
          <label className="form-field"><span>Số điện thoại</span><input className="text-input" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} maxLength={30} /></label>
          {modalMode === "edit" && <>
            <label className="form-field"><span>Email</span><input className="text-input" value={form.email} readOnly /></label>
            <label className="form-field"><span>Trạng thái</span><select className="text-input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Đang hoạt động</option><option value="suspended">Tạm khóa</option></select></label>
          </>}
          {formError && <p className="form-error" role="alert">{formError}</p>}
          <div className="modal-actions"><button type="button" className="button button-secondary" onClick={closeModal}>Hủy</button><button type="submit" className="button button-primary" disabled={saving}><UserRoundPlus size={16} />{saving ? "Đang lưu…" : modalMode === "edit" ? "Lưu thay đổi" : "Tạo độc giả"}</button></div>
        </form>
      </Modal>
    </>
  );
}
