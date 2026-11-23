export const monthlyBorrowing = [
  { month: "T1", value: 42 },
  { month: "T2", value: 54 },
  { month: "T3", value: 48 },
  { month: "T4", value: 68 },
  { month: "T5", value: 61 },
  { month: "T6", value: 78 },
  { month: "T7", value: 72 },
  { month: "T8", value: 88 },
  { month: "T9", value: 76 },
  { month: "T10", value: 96 },
  { month: "T11", value: 84 },
  { month: "T12", value: 72 },
];

export const categoryStats = [
  { label: "Văn học", count: 328, color: "blue" },
  { label: "Công nghệ", count: 246, color: "violet" },
  { label: "Khoa học", count: 194, color: "cyan" },
  { label: "Kinh tế", count: 158, color: "amber" },
  { label: "Khác", count: 126, color: "slate" },
];

export function dateLabel(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}
