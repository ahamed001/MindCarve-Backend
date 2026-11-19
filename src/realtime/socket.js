import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AUTH_COOKIE, ROLES } from '../utils/constants.js';
import { User } from '../users/model/user.model.js';

/**
 * Live updates over Socket.IO.
 * The socket signs in with the same HttpOnly session cookie as the API (no token in JavaScript), and joins:
 *   - "staff"              admins and clinicians: activity, quiz progress, new patients
 *   - "patients"           every patient: the quiz list changed (publish / archive / restore)
 *   - "user:<id>"          one account: its sessions were ended (password reset, email change, deactivation)
 * Payloads carry ids and short labels only; screens re-fetch details through the normal (authorised) API.
 */
let io = null;

const readCookie = (header = '', name) => {
  const part = header.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
};

export const initRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
    serveClient: false,
  });

  io.use(async (socket, next) => {
    try {
      const token = readCookie(socket.handshake.headers.cookie, AUTH_COOKIE);
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, env.jwtSecret);
      const user = await User.findById(payload.sub).select('+tokenVersion role status patient');
      if (!user || user.status !== 'active' || user.tokenVersion !== payload.tv) return next(new Error('unauthorized'));
      socket.data.user = { id: String(user._id), role: user.role, patient: user.patient ? String(user.patient) : null };
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join(`user:${id}`);
    socket.join(role === ROLES.PATIENT ? 'patients' : 'staff');
  });
  return io;
};

const emit = (room, event, payload) => {
  if (io) io.to(room).emit(event, payload);
};

export const emitToStaff = (event, payload) => emit('staff', event, payload);
export const emitToPatients = (event, payload) => emit('patients', event, payload);

/** Tells every open tab of this account that it has been signed out, then closes those sockets. */
export const endLiveSessions = (userId, reason) => {
  if (!io || !userId) return;
  const room = `user:${userId}`;
  io.to(room).emit('session:ended', { reason });
  io.in(room).disconnectSockets(true);
};
