import { User } from "../models/User.js";
import {
  getActiveUserByEmail,
  issueOtpForUser,
  sanitizeUser,
  updateUserPassword,
  verifyPassword,
  verifyUserOtp
} from "../services/authService.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { generateToken } from "../utils/generateToken.js";
import { AppError } from "../utils/appError.js";
import {
  validateEmail,
  validateOtp,
  validatePassword
} from "../utils/validators.js";

const buildAuthResponse = (user, rememberMe) => {
  const token = generateToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
    rememberMe
  });

  return {
    token,
    expiresIn: process.env.JWT_EXPIRE || "7d",
    user: sanitizeUser(user)
  };
};

export const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe = false } = req.body;

  validateEmail(email);
  validatePassword(password);

  const user = await getActiveUserByEmail(email);
  await verifyPassword(user, password);

  user.lastLogin = new Date();
  await user.save();

  res.json({
    message: "Login successful.",
    ...buildAuthResponse(user, Boolean(rememberMe))
  });
});

export const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp, rememberMe = false } = req.body;

  validateEmail(email);
  validateOtp(otp);

  const user = await verifyUserOtp({ email, otp, purpose: "LOGIN" });
  user.lastLogin = new Date();
  await user.save();

  res.json({
    message: "Login verified successfully.",
    ...buildAuthResponse(user, Boolean(rememberMe))
  });
});

export const resendOtp = asyncHandler(async (req, res) => {
  const { email, purpose = "LOGIN" } = req.body;

  validateEmail(email);

  if (!["LOGIN", "RESET"].includes(purpose)) {
    throw new AppError("Invalid OTP purpose.", 400);
  }

  const user = await getActiveUserByEmail(email);
  await issueOtpForUser(user, purpose);

  res.json({
    message: "A new OTP has been sent.",
    otpExpiresInSeconds: 300
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  validateEmail(email);
  const user = await getActiveUserByEmail(email);
  await issueOtpForUser(user, "RESET");

  res.json({
    message: "Password reset OTP sent to your email.",
    email: user.email,
    otpExpiresInSeconds: 300
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password, confirmPassword } = req.body;

  validateEmail(email);
  validateOtp(otp);
  validatePassword(password);

  if (password !== confirmPassword) {
    throw new AppError("Passwords do not match.", 400);
  }

  const user = await verifyUserOtp({ email, otp, purpose: "RESET" });
  await updateUserPassword(user, password);

  res.json({
    message: "Password updated successfully."
  });
});

export const logout = asyncHandler(async (_req, res) => {
  res.json({
    message: "Logged out successfully."
  });
});

export const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.sub).select("-password -otp");

  if (!user) {
    throw new AppError("User not found.", 404);
  }

  res.json({
    user: {
      ...sanitizeUser(user),
      lastLogin: user.lastLogin || null,
      createdAt: user.createdAt
    }
  });
});
