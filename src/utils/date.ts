/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
export function dateToAngle(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear =
    (new Date(date.getFullYear(), 11, 31).getTime() - startOfYear.getTime()) /
      (1000 * 60 * 60 * 24) +
    1;
  const progress = dayOfYear / daysInYear;
  return progress * 2 * Math.PI - Math.PI / 2;
} 

// Parses YYYY-MM-DD and checks if strictly before today (local date)
export function isOverdueDateString(dueString?: string, today: Date = new Date()): boolean {
  if (!dueString || typeof dueString !== 'string') return false;
  const parts = dueString.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => isNaN(n))) return false;
  const [dueYear, dueMonth1, dueDay] = parts;
  const dueMonth = dueMonth1 - 1;
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();
  if (dueYear < todayY) return true;
  if (dueYear > todayY) return false;
  if (dueMonth < todayM) return true;
  if (dueMonth > todayM) return false;
  return dueDay < todayD; // strictly before today
}