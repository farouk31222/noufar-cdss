const jwt = require("jsonwebtoken");
const User = require("../models/User");

const getAuthenticatedUserFromToken = async (token) => {
  if (!token) {
    const error = new Error("Not authorized, no token");
    error.statusCode = 401;
    throw error;
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id).select("-password");

  if (!user) {
    const error = new Error("Not authorized, user not found");
    error.statusCode = 401;
    throw error;
  }

  return user;
};

const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      res.status(401);
      throw new Error("Not authorized, no token");
    }

    req.user = await getAuthenticatedUserFromToken(token);

    next();
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(error.statusCode || 401);
    }
    next(error);
  }
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    res.status(403);
    return next(new Error("Forbidden: insufficient permissions"));
  }

  next();
};

module.exports = {
  protect,
  authorize,
  getAuthenticatedUserFromToken,
};
