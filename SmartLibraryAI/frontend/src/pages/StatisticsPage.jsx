import { ArrowDownRight, ArrowUpRight, BookOpen, CalendarDays, Download, Users } from "lucide-react";
import { Badge, PageHeader, StatCard } from "../components/ui.jsx";
import { categoryStats, monthlyBorrowing } from "../data/mockData.js";

function BorrowingChart() {
  const max = Math.max(...monthlyBorrowing.map((item) => item.value));
  return (
    <div className="chart-wrap">
      <div className="chart-y-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
      <div className="chart-grid">
        <div className="chart-guides"><i /><i /><i /><i /><i /></div>
        <div className="chart-bars">
          {monthlyBorrowing.map((item) => (
            <div className="chart-column" key={item.month}>
              <span className="chart-value">{item.value}</span>
              <i className={item.month === "T10" ? "chart-bar chart-bar-highlight" : "chart-bar"} style={{ height: `${item.value / max * 100}%` }} />
              <span className="chart-month">{item.month}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CategoryChart() {
  const total = categoryStats.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="category-chart-content">
      <div className="category-donut"><div><strong>{total.toLocaleString("vi-VN")}</strong><span>đầu sách</span></div></div>
      <div className="category-legend">
        {categoryStats.map((item) => (
          <div className="legend-row" key={item.label}><span className={`legend-dot legend-${item.color}`} /><span className="legend-label">{item.label}</span><strong>{Math.round(item.count / total * 100)}%</strong></div>
        ))}
      </div>
    </div>
  );
}

export function StatisticsPage() {
  const exportReport = () => {
    const rows = ["Tháng,Số lượt mượn", ...monthlyBorrowing.map((item) => `${item.month},${item.value}`)];
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "smartlibrary-bao-cao-demo.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader eyebrow="BÁO CÁO & PHÂN TÍCH" title="Thống kê thư viện" description="Tổng quan hoạt động và xu hướng sử dụng thư viện." actions={<button type="button" className="button button-secondary" onClick={exportReport}><Download size={16} /> Tải báo cáo CSV</button>} />
      <section className="statistics-toolbar"><span><CalendarDays size={16} /> Thời gian báo cáo</span><strong>12 tháng gần nhất</strong><Badge tone="success">Dữ liệu minh họa</Badge></section>
      <section className="stats-grid statistics-cards">
        <StatCard icon={BookOpen} label="Tổng lượt mượn" value="1.284" change={<><ArrowUpRight size={12} /> 8,4%</>} tone="blue" />
        <StatCard icon={Users} label="Độc giả hoạt động" value="842" change={<><ArrowUpRight size={12} /> 12,1%</>} tone="violet" />
        <StatCard icon={ArrowDownRight} label="Tỷ lệ trả đúng hạn" value="94,8%" change={<><ArrowUpRight size={12} /> 2,6%</>} tone="green" />
        <StatCard icon={CalendarDays} label="Thời gian mượn TB" value="11,2 ngày" change={<><ArrowDownRight size={12} /> 1,3%</>} tone="amber" />
      </section>
      <section className="statistics-grid">
        <article className="panel chart-panel borrowing-chart-panel">
          <div className="panel-heading"><div><h2>Lượt mượn theo tháng</h2><p>Xu hướng trong 12 tháng gần đây</p></div><span className="chart-legend"><i /> Lượt mượn</span></div>
          <BorrowingChart />
        </article>
        <article className="panel chart-panel category-chart-panel">
          <div className="panel-heading"><div><h2>Cơ cấu danh mục</h2><p>Phân bổ đầu sách theo nhóm</p></div><Badge tone="neutral">Danh mục</Badge></div>
          <CategoryChart />
        </article>
      </section>
      <section className="statistics-insight"><span className="insight-icon"><ArrowUpRight size={18} /></span><div><strong>Xu hướng tích cực</strong><p>Lượt mượn đang tăng đều. Danh mục Công nghệ và Văn học tiếp tục là nhóm được quan tâm nhiều nhất.</p></div><Badge tone="ai">AI INSIGHT</Badge></section>
    </>
  );
}
