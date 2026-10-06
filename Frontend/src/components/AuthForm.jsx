import { useContext, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthCtx } from "../context/authContextObject";

// Shared login / register form
const AuthForm = ({ mode }) => {
  const isRegister = mode === "register";
  const { login, register } = useContext(AuthCtx);
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isRegister) await register(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="form-card" onSubmit={onSubmit}>
      <h2>{isRegister ? "Create account" : "Log in"}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {isRegister && (
        <label>
          Name
          <input value={form.name} onChange={set("name")} required maxLength={80} />
        </label>
      )}
      <label>
        Email
        <input type="email" value={form.email} onChange={set("email")} required />
      </label>
      <label>
        Password
        <input
          type="password"
          value={form.password}
          onChange={set("password")}
          required
          minLength={isRegister ? 6 : undefined}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Please wait..." : isRegister ? "Register" : "Log in"}
      </button>
      <p>
        {isRegister ? (
          <>Already have an account? <Link to="/login" state={location.state}>Log in</Link></>
        ) : (
          <>New here? <Link to="/register" state={location.state}>Create an account</Link></>
        )}
      </p>
    </form>
  );
};

export default AuthForm;
