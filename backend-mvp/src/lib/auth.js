import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";

export function issueToken(userId, deviceId, jwtSecret) {
  const payload = {
    sub: userId,
    deviceId,
    sid: uuidv4()
  };
  return jwt.sign(payload, jwtSecret, { expiresIn: "180d" });
}

export function authRequired(store, jwtSecret) {
  return (req, res, next) => {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: "missing_token" });
    }
    try {
      const decoded = jwt.verify(token, jwtSecret);
      const db = store.read();
      const session = db.sessions.find((s) => s.sid === decoded.sid);
      if (!session || session.revoked) {
        return res.status(401).json({ error: "invalid_session" });
      }
      req.auth = decoded;
      next();
    } catch {
      return res.status(401).json({ error: "invalid_token" });
    }
  };
}
