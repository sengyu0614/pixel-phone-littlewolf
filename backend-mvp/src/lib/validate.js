export function parseOr400(schema, payload, res) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    res.status(400).json({
      error: "validation_error",
      details: parsed.error.issues
    });
    return null;
  }
  return parsed.data;
}
