import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FiEye, FiEyeOff } from "react-icons/fi";
import Alert from "../components/Alert.jsx";
import AuthCard from "../components/AuthCard.jsx";
import FormInput from "../components/FormInput.jsx";
import { loginUser } from "../services/authService.js";
import { saveSession } from "../utils/authStorage.js";
import { getErrorMessage } from "../utils/getErrorMessage.js";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm({
    defaultValues: {
      email: "",
      password: "",
      rememberMe: true
    }
  });

  const onSubmit = async (values) => {
    setLoading(true);
    setAlert(null);

    try {
      const response = await loginUser({
        email: values.email,
        password: values.password,
        rememberMe: values.rememberMe
      });

      saveSession({
        token: response.token,
        expiresIn: response.expiresIn,
        user: response.user,
        rememberMe: values.rememberMe
      });

      navigate("/dashboard");
    } catch (error) {
      setAlert({
        type: "error",
        message: getErrorMessage(error, "Unable to log in right now.")
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="Authorized Staff Login" subtitle="Sign in with your registered email and password.">
      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <Alert type="success" message={location.state?.successMessage} />
        <Alert type={alert?.type} message={alert?.message} />

        <FormInput
          label="Email Address"
          name="email"
          placeholder="you@example.com"
          autoComplete="off"
          register={register}
          rules={{
            required: "Email is required.",
            pattern: {
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
              message: "Enter a valid email address."
            }
          }}
          error={errors.email}
        />

        <FormInput
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          placeholder="Enter your password"
          autoComplete="new-password"
          register={register}
          rules={{
            required: "Password is required.",
            minLength: {
              value: 6,
              message: "Password must be at least 6 characters."
            },
            maxLength: {
              value: 30,
              message: "Password must be at most 30 characters."
            }
          }}
          error={errors.password}
          rightElement={
            <button
              type="button"
              className="text-mocha-700"
              onClick={() => setShowPassword((current) => !current)}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          }
        />

        <label className="flex items-center justify-between text-sm text-mocha-700">
          <span className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-[#d9c5a2] text-gold-500 focus:ring-gold-300"
              {...register("rememberMe")}
            />
            Remember Me
          </span>
          <Link className="font-semibold text-gold-700" to="/forgot-password">
            Forgot Password?
          </Link>
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-mocha-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-mocha-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </AuthCard>
  );
};

export default Login;
