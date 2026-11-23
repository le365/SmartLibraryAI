import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, Sparkles, Upload } from "lucide-react";
import { api } from "../api/client.js";
import { Badge, PageHeader } from "../components/ui.jsx";

const categories = [
  "Công nghệ thông tin",
  "Toán học",
  "Khoa học",
  "Ngoại ngữ",
  "Kinh tế",
  "Văn học",
];

function percentage(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? `${(value * 100).toFixed(1)}%`
    : "—";
}

function statusLabel(status) {
  if (status === "confirmed") return "Đã xác nhận";
  if (status === "corrected") return "Đã sửa nhãn";
  return "Chờ thủ thư";
}

export function AIPage() {
  const [books, setBooks] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [bookId, setBookId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [selectedLabels, setSelectedLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [isClassifying, setIsClassifying] = useState(false);
  const [reviewingId, setReviewingId] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [bookData, classificationData] = await Promise.all([
      api.books.list({ limit: 100 }),
      api.ai.classifications({ limit: 50 }),
    ]);
    setBooks(bookData.items);
    setClassifications(classificationData.items);
  }, []);

  useEffect(() => {
    let active = true;
    refresh()
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refresh]);

  const classify = async (event) => {
    event.preventDefault();
    if (isClassifying) return;
    setError("");
    setIsClassifying(true);
    try {
      await api.ai.classifyCover({
        file,
        bookId,
        title: bookId ? "" : title.trim(),
      });
      setFile(null);
      setTitle("");
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setIsClassifying(false);
    }
  };

  const review = async (classification) => {
    const category = selectedLabels[classification.id] || classification.category || classification.result.category;
    setError("");
    setReviewingId(classification.id);
    try {
      await api.ai.reviewClassification(classification.id, category);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setReviewingId("");
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="TRÍ TUỆ NHÂN TẠO"
        title="Phân loại bìa sách"
        description="MobileNetV2 gợi ý danh mục; thủ thư xác nhận hoặc sửa nhãn trước khi cập nhật sách."
        actions={<Badge tone="ai"><Sparkles size={13} /> TENSORFLOW / KERAS</Badge>}
      />

      <section className="ai-hero">
        <div className="ai-hero-copy">
          <span className="ai-kicker"><Sparkles size={14} /> BOOK COVER CLASSIFIER</span>
          <h2>Gợi ý danh mục từ ảnh bìa.</h2>
          <p>Ảnh được gửi qua Worker đến Python API riêng. Dự án chưa có dataset hay model huấn luyện; API sẽ báo chưa sẵn sàng cho đến khi model được huấn luyện.</p>
          <div className="ai-hero-points">
            <span><CheckCircle2 size={15} /> Top 3 dự đoán</span>
            <span><CheckCircle2 size={15} /> Thủ thư duyệt nhãn</span>
          </div>
        </div>
      </section>

      <section className="ai-workspace-grid">
        <article className="panel ai-upload-panel">
          <div className="panel-heading">
            <div><h2>Phân loại ảnh bìa</h2><p>Dùng ảnh mới hoặc ảnh bìa đã lưu của một cuốn sách.</p></div>
            <span className="step-number">01</span>
          </div>
          <form className="ai-classify-form" onSubmit={classify}>
            <label className="form-field">
              Gắn với sách (không bắt buộc)
              <select className="text-input" value={bookId} onChange={(event) => setBookId(event.target.value)}>
                <option value="">Không gắn sách</option>
                {books.map((book) => <option value={book.id} key={book.id}>{book.title}</option>)}
              </select>
            </label>
            {!bookId && (
              <label className="form-field">
                Tên sách
                <input className="text-input" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required={!bookId} />
              </label>
            )}
            <label className="upload-zone">
              <input
                key={file?.name || "empty"}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setFile(event.target.files?.[0] || null)}
              />
              <span className="upload-icon"><Upload size={20} /></span>
              <strong>{file?.name || "Chọn ảnh bìa để phân loại"}</strong>
              <span>{file ? "Ảnh được gửi đến AI Service khi phân loại" : "Nếu không chọn ảnh, sách cần có bìa đã tải lên"}</span>
              <small>JPEG, PNG, WebP · tối đa 5 MiB</small>
            </label>
            <div className="upload-disclaimer"><span className="online-dot" /> Không lưu ảnh upload trong lịch sử phân loại.</div>
            {error && <p className="data-error ai-error" role="alert">{error}</p>}
            <button type="submit" className="button button-primary button-wide" disabled={isClassifying || (!bookId && !title.trim())}>
              {isClassifying ? <><LoaderCircle className="spin" size={16} /> Đang phân loại...</> : <><Sparkles size={16} /> Phân loại ảnh</>}
            </button>
          </form>
        </article>

        <article className="panel ai-categories-panel">
          <div className="panel-heading">
            <div><h2>Sáu nhãn phân loại</h2><p>Thứ tự lớp đầu ra của mô hình đã được cố định.</p></div>
          </div>
          <ul className="ai-label-list">{categories.map((category) => <li key={category}>{category}</li>)}</ul>
          <div className="ai-tip"><Sparkles size={16} /><p><strong>Trạng thái hiện tại:</strong> chưa có dataset và model; chuẩn bị ảnh có quyền sử dụng, huấn luyện và đánh giá trước khi bật suy luận.</p></div>
        </article>
      </section>

      <section className="panel ai-history-panel">
        <div className="panel-heading">
          <div><h2>Lịch sử và duyệt nhãn</h2><p>Kết quả thật từ AI Service được lưu trong D1.</p></div>
          <span className="step-number">{classifications.length}</span>
        </div>
        {loading ? <p className="table-empty">Đang tải lịch sử phân loại…</p> : (
          classifications.length ? (
            <div className="ai-classification-list">
              {classifications.map((item) => {
                const currentCategory = categories.includes(item.category)
                  ? item.category
                  : categories.includes(item.result.category) ? item.result.category : categories[0];
                const top3 = Array.isArray(item.result.top3)
                  ? item.result.top3.filter((prediction) => prediction && typeof prediction.category === "string")
                  : [];
                return (
                  <article className="ai-review-card" key={item.id}>
                    <div className="ai-review-heading">
                      <div><strong>{item.title}</strong><span>{item.bookId ? `Sách ${item.bookId}` : "Chưa gắn với sách"}</span></div>
                      <Badge tone={item.reviewStatus === "pending" ? "warning" : "success"}>{statusLabel(item.reviewStatus)}</Badge>
                    </div>
                    <p className="ai-predicted-label">
                      AI dự đoán: <strong>{item.predictedCategory || item.result.category}</strong>
                      {" · "}{percentage(item.result.confidence)} · {item.model}
                    </p>
                    <ol className="ai-top-predictions">
                      {top3.map((prediction) => (
                        <li key={prediction.category}>
                          <span>{prediction.category}</span><strong>{percentage(prediction.confidence)}</strong>
                        </li>
                      ))}
                      {!top3.length && <li>Kết quả cũ không lưu danh sách top 3.</li>}
                    </ol>
                    <div className="ai-review-actions">
                      <label className="form-field">
                        Nhãn thư viện
                        <select
                          className="text-input"
                          value={selectedLabels[item.id] || currentCategory}
                          onChange={(event) => setSelectedLabels((current) => ({ ...current, [item.id]: event.target.value }))}
                        >
                          {categories.map((category) => <option key={category}>{category}</option>)}
                        </select>
                      </label>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => review(item)}
                        disabled={reviewingId === item.id}
                      >
                        {reviewingId === item.id
                          ? <><LoaderCircle className="spin" size={15} /> Lưu...</>
                          : <><CheckCircle2 size={15} /> Xác nhận nhãn</>}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p className="table-empty">Chưa có kết quả phân loại.</p>
        )}
      </section>
    </>
  );
}
