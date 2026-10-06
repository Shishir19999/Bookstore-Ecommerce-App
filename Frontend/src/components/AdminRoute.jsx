import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "../context/authContextObject";

// UI gate only; the API enforces the admin role independently.
const AdminRoute = ({ children }) => {
  const { user, loading } = useContext(AuthCtx);
  const location = useLocation();

  if (loading) return <p className="msg">Loading...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== "admin") return <h2>403 - Admins only</h2>;
  return children;
};

export default AdminRoute;
