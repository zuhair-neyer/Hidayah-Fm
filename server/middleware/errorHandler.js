function notFound(req, res, next) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) console.error(err.message);
  res.status(status).json({
    error: status === 500 ? 'Something went wrong on the server' : err.message,
  });
}

module.exports = { notFound, errorHandler };
