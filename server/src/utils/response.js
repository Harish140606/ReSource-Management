export const ok = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data });

export const fail = (res, message, statusCode = 400, code = 'BAD_REQUEST') =>
  res.status(statusCode).json({ success: false, error: { message, code } });
