// Lightweight validation middleware without external deps
// Usage: validate(schemas.register, 'body')

export const validate = (schema, where = 'body') => (req, res, next) => {
  try {
    const data = req[where] ?? {};
    const { value, error } = schema(data);
    if (error) {
      return res.status(400).json({ message: error });
    }
    req[where] = value; // sanitized
    return next();
  } catch (e) {
    return res.status(400).json({ message: 'Invalid request payload.' });
  }
};
