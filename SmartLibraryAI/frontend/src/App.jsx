import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell.jsx";
import { api } from "./api/client.js";
import { canAccessRoute, ROLE } from "./auth/roles.js";
import { AIPage } from "./pages/AIPage.jsx";
import { BooksPage } from "./pages/BooksPage.jsx";
import { ChatPage } from "./pages/ChatPage.jsx";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { LoginPage, RegisterPage } from "./pages/AuthPages.jsx";
import { LoansPage } from "./pages/LoansPage.jsx";
import { ReadersPage } from "./pages/ReadersPage.jsx";
import { AccessDeniedPage, ReaderDashboardPage, ReaderLoansPage } from "./pages/ReaderPages.jsx";
import { StatisticsPage } from "./pages/StatisticsPage.jsx";

function mapBook(book) {
  return {
    ...book,
    total: book.totalCopies,
    available: book.availableCopies,
    tone: "blue",
  };
}

function mapReader(reader) {
  return {
    ...reader,
    joined: reader.createdAt,
    statusValue: reader.status,
    status: reader.status === "active" ? "Đang hoạt động" : "Tạm khóa",
    tone: "blue",
  };
}

function mapBorrowing(borrowing) {
  const isBorrowed = borrowing.status === "borrowed";
  const isOverdue = isBorrowed && new Date(borrowing.dueAt).getTime() < Date.now();
  return {
    ...borrowing,
    status: isBorrowed ? (isOverdue ? "Quá hạn" : "Đang mượn") : "Đã trả",
  };
}

function GuardedPage({ user, path, children }) {
  return canAccessRoute(user.role, path) ? children : <AccessDeniedPage />;
}

function AppRoutes() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [books, setBooks] = useState([]);
  const [readers, setReaders] = useState([]);
  const [loans, setLoans] = useState([]);
  const [borrowRequests, setBorrowRequests] = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [toast, setToast] = useState(null);
  const location = useLocation();

  const notify = useCallback((message, type = "success") => {
    setToast({ id: Date.now(), message, type });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let active = true;
    api.auth.me()
      .then(({ user: sessionUser }) => {
        if (active) setUser(sessionUser);
      })
      .catch((error) => {
        if (!active) return;
        if (error.status !== 401) setAuthError(error.message);
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, []);

  const loadLibrary = useCallback(async (account) => {
    const isStaff = account.role === ROLE.ADMIN || account.role === ROLE.LIBRARIAN;
    const [bookData, borrowingData, requestData, readerData] = await Promise.all([
      api.books.list({ limit: 100 }),
      api.borrowings.list({ limit: 100 }),
      api.borrowings.listRequests({ limit: 100 }),
      isStaff ? api.readers.list({ limit: 100 }) : Promise.resolve({ items: [] }),
    ]);
    setBooks(bookData.items.map(mapBook));
    setLoans(borrowingData.items.map(mapBorrowing));
    setBorrowRequests(requestData.items);
    setReaders(readerData.items.map(mapReader));
    setLibraryError("");
  }, []);

  useEffect(() => {
    if (!user) {
      setBooks([]);
      setReaders([]);
      setLoans([]);
      setBorrowRequests([]);
      setLibraryError("");
      return undefined;
    }
    let active = true;
    setLibraryLoading(true);
    loadLibrary(user)
      .catch((error) => {
        if (active) setLibraryError(error.message);
      })
      .finally(() => {
        if (active) setLibraryLoading(false);
      });
    return () => { active = false; };
  }, [user, loadLibrary]);

  const authenticate = async (credentials) => {
    const { user: nextUser } = await api.auth.login(credentials);
    setAuthError("");
    setUser(nextUser);
    return nextUser;
  };

  const registerReader = async (details) => {
    const { user: nextUser } = await api.auth.register(details);
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
    setToast(null);
  };

  const refreshLibrary = async () => {
    if (!user) return;
    try {
      await loadLibrary(user);
    } catch (error) {
      setLibraryError(error.message);
    }
  };

  const addBook = async (draft) => {
    const { book } = await api.books.create(draft);
    setBooks((current) => [mapBook(book), ...current.filter((item) => item.id !== book.id)]);
    return book;
  };

  const updateBook = async (id, changes) => {
    const { book } = await api.books.update(id, changes);
    setBooks((current) => current.map((item) => item.id === id ? mapBook(book) : item));
    return book;
  };

  const deleteBook = async (id) => {
    await api.books.delete(id);
    setBooks((current) => current.filter((item) => item.id !== id));
  };

  const addReader = async (draft) => {
    const { reader } = await api.readers.create(draft);
    setReaders((current) => [mapReader(reader), ...current.filter((item) => item.id !== reader.id)]);
    return reader;
  };

  const updateReader = async (id, changes) => {
    const { reader } = await api.readers.update(id, changes);
    setReaders((current) => current.map((item) => item.id === id ? mapReader(reader) : item));
    return reader;
  };

  const deleteReader = async (id) => {
    await api.readers.delete(id);
    setReaders((current) => current.map((reader) => reader.id === id
      ? { ...reader, status: "Tạm khóa", statusValue: "suspended" }
      : reader));
  };

  const createLoan = async ({ book, reader }) => {
    await api.borrowings.create({ bookId: book.id, readerId: reader.id });
    await refreshLibrary();
  };

  const requestBook = async (book) => {
    await api.borrowings.request(book.id);
    await refreshLibrary();
  };

  const reviewBorrowRequest = async (requestId, decision) => {
    await api.borrowings.reviewRequest(requestId, decision);
    await refreshLibrary();
  };

  const returnLoan = async (loanId) => {
    await api.returns.create(loanId);
    await refreshLibrary();
  };

  if (authLoading) {
    return <div className="app-loading" role="status">Đang kiểm tra phiên đăng nhập…</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage onLogin={authenticate} serverError={authError} />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage onRegister={registerReader} />} />
      <Route path="/*" element={user ? (
        <AppShell user={user} onLogout={logout} toast={toast} onNotify={notify} onDismissToast={() => setToast(null)} dataLoading={libraryLoading} dataError={libraryError}>
          <Routes>
            <Route path="/dashboard" element={
              <GuardedPage user={user} path="/dashboard">
                {user.role === ROLE.READER
                  ? <ReaderDashboardPage user={user} books={books} loans={loans} />
                  : <DashboardPage user={user} books={books} readers={readers} loans={loans} />}
              </GuardedPage>
            } />
            <Route path="/books" element={
              <GuardedPage user={user} path="/books">
                <BooksPage
                  books={books}
                  user={user}
                  onAddBook={addBook}
                  onUpdateBook={updateBook}
                  onDeleteBook={deleteBook}
                  onBorrowBook={requestBook}
                  onNotify={notify}
                  searchQuery={location.state?.query || ""}
                />
              </GuardedPage>
            } />
            <Route path="/readers" element={
              <GuardedPage user={user} path="/readers">
                <ReadersPage
                  readers={readers}
                  user={user}
                  onAddReader={addReader}
                  onUpdateReader={updateReader}
                  onDeleteReader={deleteReader}
                  onNotify={notify}
                />
              </GuardedPage>
            } />
            <Route path="/loans" element={
              <GuardedPage user={user} path="/loans">
                {user.role === ROLE.READER
                  ? <ReaderLoansPage loans={loans.filter((loan) => loan.readerId === user.readerId)} requests={borrowRequests} />
                  : <LoansPage loans={loans} requests={borrowRequests} books={books} readers={readers} onCreateLoan={createLoan} onReturnLoan={returnLoan} onReviewRequest={reviewBorrowRequest} />}
              </GuardedPage>
            } />
            <Route path="/ai" element={<GuardedPage user={user} path="/ai"><AIPage /></GuardedPage>} />
            <Route path="/chat" element={<GuardedPage user={user} path="/chat"><ChatPage user={user} /></GuardedPage>} />
            <Route path="/statistics" element={<GuardedPage user={user} path="/statistics"><StatisticsPage /></GuardedPage>} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AppShell>
      ) : <Navigate to="/login" replace state={{ from: location }} /> } />
    </Routes>
  );
}

export function App() {
  return <BrowserRouter><AppRoutes /></BrowserRouter>;
}
