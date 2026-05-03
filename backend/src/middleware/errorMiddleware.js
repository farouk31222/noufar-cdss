const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`Not found - ${req.originalUrl}`));
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: err.message,
    code: err.code || null,
    reason: err.reason || null,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
