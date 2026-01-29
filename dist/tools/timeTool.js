"use strict";
/**
 * Handles time and date queries with timezone support.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentTime = getCurrentTime;
exports.getCurrentDate = getCurrentDate;
// Mapping of common timezone aliases to IANA identifiers
const TIMEZONE_MAP = {
    'utc': 'UTC',
    'gmt': 'GMT',
    'ist': 'Asia/Kolkata',
    'pst': 'America/Los_Angeles',
    'est': 'America/New_York',
    'pdt': 'America/Los_Angeles', // Daylight
    'edt': 'America/New_York', // Daylight
    'cet': 'Europe/Paris',
    'bst': 'Europe/London',
    'ny': 'America/New_York',
    'india': 'Asia/Kolkata',
    'london': 'Europe/London'
};
function resolveTimezone(tz) {
    if (!tz)
        return undefined;
    const normalized = tz.toLowerCase().trim();
    if (TIMEZONE_MAP[normalized]) {
        return TIMEZONE_MAP[normalized];
    }
    // Attempt use directly if valid IANA (e.g. Asia/Tokyo)
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return tz;
    }
    catch (e) {
        return undefined; // Fallback to system
    }
}
function getCurrentTime(timezone) {
    const tz = resolveTimezone(timezone);
    const now = new Date();
    try {
        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz,
            timeZoneName: 'short'
        });
        return timeString;
    }
    catch {
        return "Invalid timezone specified.";
    }
}
function getCurrentDate(timezone) {
    const tz = resolveTimezone(timezone);
    const now = new Date();
    try {
        const dateString = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            timeZone: tz
        });
        return dateString;
    }
    catch {
        return "Invalid timezone specified.";
    }
}
