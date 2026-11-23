export const ROLE = Object.freeze({
  ADMIN: "Admin",
  LIBRARIAN: "Librarian",
  READER: "Reader",
});

export const roleLabels = Object.freeze({
  [ROLE.ADMIN]: "Quản trị viên",
  [ROLE.LIBRARIAN]: "Thủ thư",
  [ROLE.READER]: "Độc giả",
});

const routePermissions = {
  "/dashboard": [ROLE.ADMIN, ROLE.LIBRARIAN, ROLE.READER],
  "/books": [ROLE.ADMIN, ROLE.LIBRARIAN, ROLE.READER],
  "/readers": [ROLE.ADMIN, ROLE.LIBRARIAN],
  "/loans": [ROLE.ADMIN, ROLE.LIBRARIAN, ROLE.READER],
  "/ai": [ROLE.ADMIN],
  "/chat": [ROLE.ADMIN, ROLE.LIBRARIAN, ROLE.READER],
  "/statistics": [ROLE.ADMIN],
};

export function canAccessRoute(role, path) {
  return routePermissions[path]?.includes(role) ?? false;
}

export function getLandingRoute() {
  return "/dashboard";
}
