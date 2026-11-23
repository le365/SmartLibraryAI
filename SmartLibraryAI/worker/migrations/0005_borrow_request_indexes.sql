CREATE INDEX idx_borrow_requests_status_requested
  ON borrow_requests(status, requested_at);

CREATE INDEX idx_borrow_details_request_book
  ON borrow_details(request_id, book_id);
