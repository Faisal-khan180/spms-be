/**
 * notificationController.js — Phase 11
 */
const { pool } = require('../config/db');
const { successResponse } = require('../utils/response');
const asyncHandler = require('../middleware/asyncHandler');

// Internal helper for other controllers
async function createNotification(userId, title, message) {
  await pool.execute(
    'INSERT INTO notifications (user_id, title, message) VALUES (?, ?, ?)',
    [userId, title, message]
  );
}

// ── GET /api/notifications/my
const getMyNotifications = asyncHandler(async (req, res) => {
  const [notifications] = await pool.execute(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id]
  );
  const unreadCount = notifications.filter(n => !n.is_read).length;
  return successResponse(res, 200, 'Notifications fetched.', {
    count: notifications.length,
    unread_count: unreadCount,
    notifications
  });
});

// ── PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [result] = await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
    [id, req.user.id]
  );
  if (result.affectedRows === 0) {
    res.status(404);
    throw new Error('Notification not found.');
  }
  return successResponse(res, 200, 'Notification marked as read.');
});

// ── PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  await pool.execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
    [req.user.id]
  );
  return successResponse(res, 200, 'All notifications marked as read.');
});

module.exports = {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead
};
