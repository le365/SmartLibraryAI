const state = {
  user: null,
  links: [],
  selectedStatsId: null,
  authMode: "login",
  toastTimer: null,
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  accountLabel: $("#accountLabel"),
  logoutButton: $("#logoutButton"),
  themeToggle: $("#themeToggle"),
  shortenForm: $("#shortenForm"),
  shortenButton: $("#shortenButton"),
  shortenMessage: $("#shortenMessage"),
  resultPanel: $("#resultPanel"),
  shortUrl: $("#shortUrl"),
  qrCode: $("#qrCode"),
  qrMessage: $("#qrMessage"),
  copyResultButton: $("#copyResultButton"),
  downloadQrButton: $("#downloadQrButton"),
  authPanel: $("#authPanel"),
  mainNav: $(".main-nav"),
  authForm: $("#authForm"),
  authMessage: $("#authMessage"),
  authSubmit: $("#authSubmit"),
  loginTab: $("#loginTab"),
  registerTab: $("#registerTab"),
  usernameField: $("#usernameField"),
  emailField: $("#emailField"),
  identifierField: $("#identifierField"),
  username: $("#username"),
  email: $("#email"),
  identifier: $("#identifier"),
  password: $("#password"),
  passwordHint: $("#passwordHint"),
  workspace: $("#workspace"),
  refreshButton: $("#refreshButton"),
  totalLinks: $("#totalLinks"),
  totalClicks: $("#totalClicks"),
  activeLinks: $("#activeLinks"),
  linksTableBody: $("#linksTableBody"),
  emptyState: $("#emptyState"),
  loadMessage: $("#loadMessage"),
  linkSearch: $("#linkSearch"),
  statsPanel: $("#statsPanel"),
  statsLinkLabel: $("#statsLinkLabel"),
  statsRange: $("#statsRange"),
  statsTotal: $("#statsTotal"),
  dailyStats: $("#dailyStats"),
  deviceStats: $("#deviceStats"),
  countryStats: $("#countryStats"),
  statsMessage: $("#statsMessage"),
  closeStatsButton: $("#closeStatsButton"),
  toast: $("#toast"),
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Không thể kết nối máy chủ. Hãy kiểm tra mạng và thử lại.");
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Máy chủ trả về dữ liệu không hợp lệ.");
  }
  if (!response.ok) {
    throw new ApiError(data?.error?.message || "Yêu cầu không thành công.", response.status);
  }
  return data;
}

function setMessage(element, message = "", type = "") {
  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2600);
}

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function setAuthMode(mode) {
  state.authMode = mode;
  const registering = mode === "register";
  elements.loginTab.classList.toggle("is-active", !registering);
  elements.registerTab.classList.toggle("is-active", registering);
  elements.loginTab.setAttribute("aria-selected", String(!registering));
  elements.registerTab.setAttribute("aria-selected", String(registering));
  elements.usernameField.hidden = !registering;
  elements.emailField.hidden = !registering;
  elements.identifierField.hidden = registering;
  elements.username.required = registering;
  elements.email.required = registering;
  elements.identifier.required = !registering;
  elements.password.autocomplete = registering ? "new-password" : "current-password";
  elements.passwordHint.hidden = !registering;
  elements.authSubmit.innerHTML = registering
    ? 'Tạo tài khoản <span aria-hidden="true">→</span>'
    : 'Đăng nhập <span aria-hidden="true">→</span>';
  setMessage(elements.authMessage);
}

function setAuthenticated(user) {
  state.user = user;
  elements.authPanel.hidden = Boolean(user);
  elements.workspace.hidden = !user;
  elements.mainNav.hidden = !user;
  elements.accountLabel.hidden = !user;
  elements.logoutButton.hidden = !user;
  elements.accountLabel.textContent = user ? `Xin chào, ${user.username}` : "";
  if (!user) {
    state.links = [];
    state.selectedStatsId = null;
    elements.statsPanel.hidden = true;
    renderLinks();
  }
}

async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const input = document.createElement("textarea");
      input.value = value;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();
      if (!copied) throw new Error("Clipboard is unavailable.");
    }
    showToast("Đã sao chép liên kết.");
  } catch {
    showToast("Không thể sao chép. Hãy chọn và sao chép liên kết thủ công.");
  }
}

function renderQrCode(value) {
  elements.qrCode.replaceChildren();
  elements.qrMessage.textContent = "Mã QR cho liên kết của bạn";
  if (typeof window.QRCode !== "function") {
    elements.qrMessage.textContent = "Không tải được thư viện QR. Hãy kiểm tra kết nối mạng.";
    return;
  }
  try {
    new window.QRCode(elements.qrCode, {
      text: value,
      width: 108,
      height: 108,
      colorDark: "#17233c",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.M,
    });
  } catch {
    elements.qrMessage.textContent = "Không thể tạo mã QR cho liên kết này.";
  }
}

function showCreatedLink(link) {
  elements.resultPanel.hidden = false;
  elements.shortUrl.href = link.short_url;
  elements.shortUrl.textContent = link.short_url;
  renderQrCode(link.short_url);
  elements.resultPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function makeButton(label, className, action, ariaLabel = label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", action);
  return button;
}

function createLinkRow(link) {
  const row = document.createElement("tr");
  const linkCell = document.createElement("td");
  linkCell.className = "link-cell";
  const title = document.createElement("span");
  title.className = "link-title";
  title.textContent = link.title || link.original_url;
  title.title = link.title || link.original_url;
  const original = document.createElement("a");
  original.className = "link-original";
  original.href = link.original_url;
  original.target = "_blank";
  original.rel = "noopener noreferrer";
  original.textContent = link.original_url;
  linkCell.append(title, original);

  const shortCell = document.createElement("td");
  const shortAnchor = document.createElement("a");
  shortAnchor.className = "table-short-url";
  shortAnchor.href = link.short_url;
  shortAnchor.target = "_blank";
  shortAnchor.rel = "noopener noreferrer";
  shortAnchor.textContent = link.short_url;
  shortCell.append(shortAnchor);

  const clicks = document.createElement("td");
  clicks.className = "click-count";
  clicks.textContent = formatNumber(link.click_count);

  const statusCell = document.createElement("td");
  const status = document.createElement("span");
  status.className = `status-badge${link.is_active ? "" : " is-inactive"}`;
  status.textContent = link.is_active ? "Đang hoạt động" : "Đã tắt";
  statusCell.append(status);

  const dateCell = document.createElement("td");
  dateCell.textContent = formatDate(link.created_at);

  const actionCell = document.createElement("td");
  actionCell.className = "action-cell";
  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(
    makeButton("Thống kê", "button button-outline button-small", () => loadStats(link), `Xem thống kê cho ${link.title || link.short_code}`),
    makeButton("Sao chép", "button button-outline button-small", () => copyText(link.short_url), `Sao chép ${link.short_url}`),
    makeButton(link.is_active ? "Tắt" : "Bật", "button button-outline button-small", (event) => toggleLink(link, event.currentTarget), link.is_active ? "Tắt liên kết" : "Bật liên kết"),
    makeButton("Xóa", "button button-quiet button-small delete-button", () => deleteLink(link), `Xóa ${link.title || link.short_code}`),
  );
  actionCell.append(actions);
  row.append(linkCell, shortCell, clicks, statusCell, dateCell, actionCell);
  return row;
}

function renderLinks() {
  const query = elements.linkSearch.value.trim().toLowerCase();
  const visibleLinks = state.links.filter((link) =>
    [link.title, link.original_url, link.short_url, link.short_code]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(query)),
  );
  const fragment = document.createDocumentFragment();
  for (const link of visibleLinks) fragment.append(createLinkRow(link));
  elements.linksTableBody.replaceChildren(fragment);
  elements.emptyState.hidden = visibleLinks.length > 0;
  elements.emptyState.querySelector("h3").textContent = state.links.length ? "Không tìm thấy liên kết" : "Chưa có liên kết nào";
  elements.emptyState.querySelector("p").textContent = state.links.length
    ? "Thử từ khóa khác để tìm liên kết."
    : "Tạo liên kết đầu tiên ở phía trên để bắt đầu theo dõi.";
  elements.totalLinks.textContent = formatNumber(state.links.length);
  elements.totalClicks.textContent = formatNumber(state.links.reduce((total, link) => total + Number(link.click_count || 0), 0));
  elements.activeLinks.textContent = formatNumber(state.links.filter((link) => link.is_active).length);
}

async function refreshLinks() {
  setMessage(elements.loadMessage);
  try {
    const data = await api("/api/links");
    state.links = data.links;
    renderLinks();
    if (state.selectedStatsId) {
      const selected = state.links.find((link) => link.id === state.selectedStatsId);
      if (selected) {
        elements.statsLinkLabel.textContent = selected.title || selected.short_url;
      } else {
        state.selectedStatsId = null;
        elements.statsPanel.hidden = true;
      }
    }
  } catch (error) {
    if (error.status === 401) {
      setAuthenticated(null);
      return;
    }
    setMessage(elements.loadMessage, error.message, "error");
  }
}

async function loadStats(link) {
  state.selectedStatsId = link.id;
  elements.statsPanel.hidden = false;
  elements.statsLinkLabel.textContent = link.title || link.short_url;
  elements.statsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  await refreshStats();
}

function renderBars(container, rows, labelFormatter = (value) => value) {
  container.replaceChildren();
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "bar-empty";
    empty.textContent = "Chưa có dữ liệu trong khoảng thời gian này.";
    container.append(empty);
    return;
  }

  const maximum = Math.max(...rows.map((row) => Number(row.count) || 0), 1);
  for (const row of rows) {
    const wrapper = document.createElement("div");
    wrapper.className = "bar-row";
    const meta = document.createElement("div");
    meta.className = "bar-meta";
    const name = document.createElement("span");
    name.className = "bar-name";
    name.textContent = labelFormatter(row.name ?? row.date);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatNumber(row.count);
    meta.append(name, value);
    const track = document.createElement("div");
    track.className = "bar-track";
    track.setAttribute("aria-hidden", "true");
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${Math.max((Number(row.count) / maximum) * 100, 2)}%`;
    track.append(fill);
    wrapper.append(meta, track);
    container.append(wrapper);
  }
}

async function refreshStats() {
  if (!state.selectedStatsId) return;
  setMessage(elements.statsMessage);
  const days = elements.statsRange.value;
  try {
    const data = await api(`/api/links/${encodeURIComponent(state.selectedStatsId)}/stats?days=${days}`);
    elements.statsTotal.textContent = formatNumber(data.total_clicks);
    renderBars(elements.dailyStats, data.by_day, (value) => formatDate(value));
    renderBars(elements.deviceStats, data.by_device, (value) => ({
      desktop: "Máy tính",
      mobile: "Điện thoại",
      tablet: "Máy tính bảng",
      bot: "Bot",
      unknown: "Không rõ",
    })[value] || value);
    renderBars(elements.countryStats, data.by_country, (value) => value === "unknown" ? "Không rõ" : value);
  } catch (error) {
    setMessage(elements.statsMessage, error.message, "error");
    if (error.status === 401) setAuthenticated(null);
  }
}

async function toggleLink(link, button) {
  button.disabled = true;
  try {
    await api(`/api/links/${encodeURIComponent(link.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: !link.is_active }),
    });
    await refreshLinks();
    showToast(link.is_active ? "Đã tắt liên kết." : "Đã bật liên kết.");
  } catch (error) {
    button.disabled = false;
    showToast(error.message);
  }
}

async function deleteLink(link) {
  const confirmed = window.confirm(`Xóa liên kết "${link.title || link.short_code}"? Lịch sử click của liên kết này cũng sẽ bị xóa.`);
  if (!confirmed) return;
  try {
    await api(`/api/links/${encodeURIComponent(link.id)}`, { method: "DELETE" });
    await refreshLinks();
    showToast("Đã xóa liên kết.");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitShorten(event) {
  event.preventDefault();
  setMessage(elements.shortenMessage);
  elements.shortenButton.disabled = true;
  const form = new FormData(elements.shortenForm);
  const body = {
    original_url: form.get("original_url").trim(),
    custom_alias: form.get("custom_alias").trim() || null,
    title: form.get("title").trim() || null,
    expires_at: form.get("expires_at") || null,
  };
  try {
    const data = await api("/api/links", { method: "POST", body: JSON.stringify(body) });
    showCreatedLink(data.link);
    setMessage(elements.shortenMessage, "Liên kết đã sẵn sàng.", "success");
    await refreshLinks();
  } catch (error) {
    setMessage(elements.shortenMessage, error.message, "error");
    if (error.status === 401) {
      setMessage(elements.authMessage, "Đăng nhập hoặc tạo tài khoản để lưu liên kết.", "error");
      elements.authPanel.scrollIntoView({ behavior: "smooth", block: "center" });
      elements.identifier.focus();
    }
  } finally {
    elements.shortenButton.disabled = false;
  }
}

async function submitAuth(event) {
  event.preventDefault();
  setMessage(elements.authMessage);
  elements.authSubmit.disabled = true;
  const body = { password: elements.password.value };
  const endpoint = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
  if (state.authMode === "register") {
    body.username = elements.username.value.trim();
    body.email = elements.email.value.trim();
  } else {
    body.identifier = elements.identifier.value.trim();
  }

  try {
    const data = await api(endpoint, { method: "POST", body: JSON.stringify(body) });
    setAuthenticated(data.user);
    elements.authForm.reset();
    setMessage(elements.authMessage);
    await refreshLinks();
    showToast(state.authMode === "register" ? "Tạo tài khoản thành công." : "Đăng nhập thành công.");
  } catch (error) {
    setMessage(elements.authMessage, error.message, "error");
  } finally {
    elements.authSubmit.disabled = false;
  }
}

async function logout() {
  elements.logoutButton.disabled = true;
  try {
    await api("/api/auth/logout", { method: "POST" });
    setAuthenticated(null);
    setAuthMode("login");
    showToast("Bạn đã đăng xuất.");
  } catch (error) {
    showToast(error.message);
  } finally {
    elements.logoutButton.disabled = false;
  }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  elements.themeToggle.innerHTML = dark
    ? '☀ <span>Giao diện sáng</span>'
    : '☾ <span>Giao diện tối</span>';
  elements.themeToggle.setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
  try {
    localStorage.setItem("gonlink-theme", theme);
  } catch {
    // Theme remains active for the current page if storage is unavailable.
  }
}

function initializeTheme() {
  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem("gonlink-theme");
  } catch {
    savedTheme = null;
  }
  const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  setTheme(savedTheme || preferred);
}

elements.loginTab.addEventListener("click", () => setAuthMode("login"));
elements.registerTab.addEventListener("click", () => setAuthMode("register"));
elements.authForm.addEventListener("submit", submitAuth);
elements.shortenForm.addEventListener("submit", submitShorten);
elements.logoutButton.addEventListener("click", logout);
elements.refreshButton.addEventListener("click", refreshLinks);
elements.linkSearch.addEventListener("input", renderLinks);
elements.statsRange.addEventListener("change", refreshStats);
elements.closeStatsButton.addEventListener("click", () => {
  elements.statsPanel.hidden = true;
  state.selectedStatsId = null;
});
elements.themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
elements.copyResultButton.addEventListener("click", () => copyText(elements.shortUrl.href));
elements.downloadQrButton.addEventListener("click", () => {
  const canvas = elements.qrCode.querySelector("canvas");
  const image = elements.qrCode.querySelector("img");
  const source = canvas?.toDataURL("image/png") || image?.src;
  if (!source) {
    showToast("Mã QR chưa sẵn sàng để tải xuống.");
    return;
  }
  const anchor = document.createElement("a");
  anchor.href = source;
  anchor.download = "gonlink-qr.png";
  anchor.click();
});

$("#currentYear").textContent = String(new Date().getFullYear());
initializeTheme();
setAuthMode("login");
api("/api/auth/me")
  .then(async (data) => {
    setAuthenticated(data.user);
    await refreshLinks();
  })
  .catch((error) => {
    setAuthenticated(null);
    if (error.status !== 401) setMessage(elements.loadMessage, error.message, "error");
  });
