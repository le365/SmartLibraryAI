import { useEffect, useRef, useState } from "react";
import { ArrowUp, BookOpen, Bot, ChevronRight, Clock3, MessageCircle, Plus, Sparkles, UserRound } from "lucide-react";
import { Avatar, PageHeader } from "../components/ui.jsx";

const suggestions = [
  "Gợi ý sách về trí tuệ nhân tạo",
  "Sách nào phù hợp cho người mới học?",
  "Tìm sách khoa học được mượn nhiều",
];

const starterMessages = [
  { id: 1, role: "assistant", text: "Xin chào! Mình là trợ lý thư viện SMARTLIBRARY AI. Mình có thể giúp bạn tìm sách, khám phá chủ đề mới hoặc giải đáp các câu hỏi về thư viện.", time: "09:41" },
  { id: 2, role: "assistant", text: "Bạn muốn bắt đầu với chủ đề nào hôm nay?", time: "09:41" },
];

const loanHelpMessages = [
  { id: 3, role: "assistant", text: "Mình có thể giúp bạn theo dõi các phiếu mượn. Hãy mở mục Mượn & trả sách để xem hạn trả và trạng thái từng phiếu.", time: "09:38" },
  { id: 4, role: "user", text: "Làm thế nào để gia hạn sách?", time: "09:39" },
  { id: 5, role: "assistant", text: "Trong bản demo, bạn có thể trao đổi với nhân viên thư viện để gia hạn. Tính năng gia hạn trực tuyến sẽ được bổ sung sau khi kết nối backend.", time: "09:39" },
];

function getReply(text) {
  const normalized = text.toLocaleLowerCase("vi");
  if (normalized.includes("trí tuệ") || normalized.includes("ai") || normalized.includes("công nghệ")) {
    return "Bạn có thể bắt đầu với nhóm sách Công nghệ trong bộ sưu tập. Mình gợi ý tìm các chủ đề như nhập môn AI, dữ liệu và tư duy thiết kế. Đây là gợi ý minh họa từ dữ liệu mẫu.";
  }
  if (normalized.includes("khoa học")) {
    return "Danh mục Khoa học & Tự nhiên hiện có các đầu sách phổ thông và tham khảo. Thử xem “Khám phá thế giới tự nhiên” trong bộ sưu tập mẫu nhé!";
  }
  if (normalized.includes("mượn") || normalized.includes("thư viện")) {
    return "Bạn có thể xem mục Mượn & trả sách để theo dõi phiếu hiện tại. Trong bản demo này, thông tin mượn chỉ được lưu trong bộ nhớ của phiên.";
  }
  return "Mình đã ghi nhận câu hỏi của bạn. Hãy thử hỏi về sách công nghệ, khoa học hoặc cách theo dõi phiếu mượn để xem các gợi ý mẫu.";
}

export function ChatPage({ user }) {
  const [messages, setMessages] = useState(starterMessages);
  const [input, setInput] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = (text = input) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const time = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date());
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", text: trimmed, time },
      { id: Date.now() + 1, role: "assistant", text: getReply(trimmed), time },
    ]);
    setInput("");
  };

  return (
    <>
      <PageHeader eyebrow="TRỢ LÝ THƯ VIỆN" title="Chat Box" description="Trò chuyện để khám phá sách và tra cứu thông tin thư viện." />
      <section className="chat-layout">
        <aside className="chat-sidebar panel">
          <button type="button" className="button button-primary button-wide" onClick={() => setMessages(starterMessages)}><Plus size={16} /> Cuộc trò chuyện mới</button>
          <div className="chat-history-label">GẦN ĐÂY</div>
          <button type="button" className={`chat-history-item${messages === starterMessages ? " chat-history-active" : ""}`} onClick={() => setMessages(starterMessages)}><MessageCircle size={16} /><span>Tìm sách và khám phá</span><ChevronRight size={15} /></button>
          <button type="button" className={`chat-history-item${messages === loanHelpMessages ? " chat-history-active" : ""}`} onClick={() => setMessages(loanHelpMessages)}><Clock3 size={16} /><span>Cách gia hạn sách</span></button>
          <div className="chat-sidebar-tip"><span><Sparkles size={16} /></span><strong>Trợ lý AI</strong><p>Hỏi bất cứ điều gì về bộ sưu tập và dịch vụ thư viện.</p><span className="chat-online"><i /> Đang trực tuyến</span></div>
        </aside>

        <section className="chat-window panel">
          <header className="chat-window-header">
            <span className="chat-bot-avatar"><Bot size={20} /></span>
            <div><strong>Trợ lý SMARTLIBRARY</strong><span><i className="online-dot" /> Có thể hỗ trợ bạn</span></div>
            <button type="button" className="icon-button" aria-label="Thông tin trợ lý" onClick={() => setMessages((current) => [...current, { id: Date.now(), role: "assistant", text: "Trợ lý này đang chạy bằng dữ liệu mẫu trong trình duyệt. Kết quả không được gửi đến dịch vụ AI.", time: new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date()) }])}><Sparkles size={17} /></button>
          </header>
          <div className="chat-messages" ref={scrollRef}>
            <div className="chat-date-divider"><span>HÔM NAY</span></div>
            {messages.map((message) => (
              <div className={`chat-message chat-message-${message.role}`} key={message.id}>
                {message.role === "assistant" ? <span className="chat-message-avatar"><Bot size={15} /></span> : <Avatar name={user.name} size="small" />}
                <div className="chat-message-body"><div className="chat-bubble">{message.text}</div><span className="chat-time">{message.time}</span></div>
              </div>
            ))}
            {messages.length <= 2 && <div className="chat-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => sendMessage(suggestion)}>{suggestion}<ChevronRight size={14} /></button>)}</div>}
          </div>
          <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); sendMessage(); }}>
            <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Nhập câu hỏi của bạn..." aria-label="Tin nhắn" />
            <span className="composer-hint"><BookOpen size={14} /> Hỏi về sách và thư viện</span>
            <button type="submit" className="chat-send-button" aria-label="Gửi tin nhắn" disabled={!input.trim()}><ArrowUp size={18} /></button>
          </form>
          <p className="chat-disclaimer"><UserRound size={12} /> Trợ lý AI demo có thể đưa ra gợi ý chưa chính xác.</p>
        </section>
      </section>
    </>
  );
}
