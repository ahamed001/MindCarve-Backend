export const sendSuccess = (res, data = {}, message = 'Data fetched successfully', status = 200) =>
  res.status(status).json({ success: true, message, data });
