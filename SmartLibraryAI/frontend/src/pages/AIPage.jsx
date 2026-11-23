import { useState } from "react";
import { ArrowRight, BookOpen, CheckCircle2, FileText, LoaderCircle, Sparkles, Upload, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge, PageHeader } from "../components/ui.jsx";

const suggestedCategories = [
  { title: "Lập trình & Công nghệ", count: 246, tone: "violet", icon: "</>" },
  { title: "Văn học & Nghệ thuật", count: 328, tone: "rose", icon: "Aa" },
  { title: "Khoa học & Tự nhiên", count: 194, tone: "green", icon: "✳" },
  { title: "Kinh tế & Kỹ năng", count: 158, tone: "amber", icon: "↗" },
];

export function AIPage() {
  const navigate = useNavigate();
  const [fileName, setFileName] = useState("");
  const [classification, setClassification] = useState(null);
  const [isClassifying, setIsClassifying] = useState(false);

  const classify = () => {
    if (isClassifying) return;
    setIsClassifying(true);
    setClassification(null);
    window.setTimeout(() => {
      setClassification({
        category: fileName.toLowerCase().includes("data") ? "Lập trình & Công nghệ" : "Khoa học & Tự nhiên",
        confidence: fileName ? 96 : 93,
        tags: ["Tài liệu tham khảo", "Nội dung học thuật", "Phù hợp độc giả phổ thông"],
      });
      setIsClassifying(false);
    }, 750);
  };

  return (
    <>
      <PageHeader eyebrow="TRÍ TUỆ NHÂN TẠO" title="Phân loại sách bằng AI" description="Tự động gợi ý danh mục và khám phá nội dung phù hợp cho bộ sưu tập." actions={<Badge tone="ai"><Sparkles size={13} /> AI DEMO</Badge>} />

      <section className="ai-hero">
        <div className="ai-hero-copy">
          <span className="ai-kicker"><Sparkles size={14} /> SMART CLASSIFIER</span>
          <h2>Để AI giúp bạn sắp xếp<br />tri thức thông minh hơn.</h2>
          <p>Tải tài liệu lên để xem bản minh họa phân loại tự động. Kết quả hiện tại được mô phỏng ngay trên trình duyệt.</p>
          <div className="ai-hero-points"><span><CheckCircle2 size={15} /> Gợi ý danh mục</span><span><CheckCircle2 size={15} /> Trích xuất từ khóa</span></div>
        </div>
        <div className="ai-hero-art" aria-hidden="true">
          <div className="ai-orbit ai-orbit-one" /><div className="ai-orbit ai-orbit-two" />
          <span className="ai-float ai-float-book"><BookOpen size={22} /></span>
          <span className="ai-float ai-float-file"><FileText size={20} /></span>
          <span className="ai-float ai-float-star"><Sparkles size={18} /></span>
          <span className="ai-brain"><WandSparkles size={43} /></span>
        </div>
      </section>

      <section className="ai-workspace-grid">
        <article className="panel ai-upload-panel">
          <div className="panel-heading"><div><h2>Phân loại tài liệu</h2><p>Chọn tệp để xem gợi ý danh mục từ AI.</p></div><span className="step-number">01</span></div>
          <label className="upload-zone">
            <input type="file" accept=".pdf,.doc,.docx,.txt,.epub" onChange={(event) => { setFileName(event.target.files?.[0]?.name || ""); setClassification(null); }} />
            <span className="upload-icon"><Upload size={20} /></span>
            <strong>{fileName || "Kéo tài liệu vào đây"}</strong>
            <span>{fileName ? "Tệp đã sẵn sàng để phân tích" : "hoặc nhấn để chọn tệp từ thiết bị"}</span>
            <small>PDF, DOCX, TXT, EPUB · tối đa 20MB</small>
          </label>
          <div className="upload-disclaimer"><span className="online-dot" /> Tệp không được tải lên máy chủ trong bản demo này.</div>
          <button type="button" className="button button-primary button-wide" onClick={classify} disabled={isClassifying}>
            {isClassifying ? <><LoaderCircle className="spin" size={16} /> Đang phân tích...</> : <><Sparkles size={16} /> Phân tích tài liệu</>}
          </button>
          {classification && (
            <div className="classification-result">
              <div className="result-topline"><span><CheckCircle2 size={16} /> Kết quả gợi ý</span><Badge tone="success">{classification.confidence}% tin cậy</Badge></div>
              <strong className="result-category">{classification.category}</strong>
              <div className="confidence-track"><i style={{ width: `${classification.confidence}%` }} /></div>
              <div className="result-tags">{classification.tags.map((tag) => <Badge tone="category" key={tag}>{tag}</Badge>)}</div>
            </div>
          )}
        </article>

        <article className="panel ai-categories-panel">
          <div className="panel-heading"><div><h2>Danh mục thư viện</h2><p>AI nhận diện và gợi ý theo bộ sưu tập của bạn.</p></div><button type="button" className="button button-ghost" onClick={() => navigate("/books")}>Xem tất cả <ArrowRight size={15} /></button></div>
          <div className="ai-category-list">
            {suggestedCategories.map((item) => (
              <div className="ai-category-item" key={item.title}>
                <span className={`ai-category-icon tone-${item.tone}`}>{item.icon}</span>
                <div><strong>{item.title}</strong><span>{item.count} đầu sách</span></div>
                <ArrowRight size={16} />
              </div>
            ))}
          </div>
          <div className="ai-tip"><Sparkles size={16} /><p><strong>Mẹo nhỏ:</strong> Thêm mô tả hoặc từ khóa vào thông tin sách để tăng độ chính xác của gợi ý.</p></div>
        </article>
      </section>

      <section className="ai-bottom-note"><span className="ai-bottom-icon"><FileText size={18} /></span><div><strong>Bước tiếp theo: kết nối AI service</strong><p>Đây là giao diện minh họa. Mô hình TensorFlow/Keras sẽ được tích hợp ở giai đoạn backend.</p></div><Badge tone="neutral">SẮP RA MẮT</Badge></section>
    </>
  );
}
