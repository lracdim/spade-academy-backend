import { db } from '../db/index.js';
import { notifications } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

export const getNotifications = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const userNotifications = await db.select({
            id: notifications.id,
            title: notifications.title,
            message: notifications.message,
            isRead: notifications.isRead,
            createdAt: notifications.createdAt,
        }).from(notifications)
            .where(eq(notifications.userId, userId))
            .orderBy(desc(notifications.createdAt));

        res.json(userNotifications);
    } catch (error) {
        console.error('Fetch notifications error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const { notificationId } = req.body;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (notificationId) {
            // Mark a specific notification as read
            await db.update(notifications)
                .set({ isRead: true })
                .where(eq(notifications.id, notificationId));
        } else {
            // Mark all as read
            await db.update(notifications)
                .set({ isRead: true })
                .where(eq(notifications.userId, userId));
        }

        res.json({ message: 'Notifications marked as read' });
    } catch (error) {
        console.error('Mark read notifications error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
