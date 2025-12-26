function errorHandler(err, req, res, next) {
  const status = err?.statusCode || 500;
  const message = err?.message || 'INTERNAL_ERROR';
  if (res.headersSent) {
    return next(err);
  }
  return res.status(status).json({ error: message });
}

module.exports = {
  errorHandler,
};
