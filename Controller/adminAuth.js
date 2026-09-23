const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { COOKIE_NAME } = require("../Utils/authMiddleware");

const TOKEN_TTL = "12h";
const COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = jwt.sign({ role: "admin", email }, process.env.JWT_SECRET, {
      expiresIn: TOKEN_TTL,
    });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE_MS,
    });

    res.status(200).json({ success: true, data: { email } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.logout = (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.status(200).json({ success: true });
};

exports.me = (req, res) => {
  res.status(200).json({ success: true, data: req.admin });
};
