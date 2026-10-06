import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthCtx } from "../context/authContextObject";

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthCtx);
  const location = useLocation();

  if (loading) return <p className="msg">Loading...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};

export default ProtectedRoute;
