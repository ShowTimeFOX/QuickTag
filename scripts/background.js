// Background entry module (Chrome: module service worker; Firefox: module
// background script). Listeners must be registered synchronously at top level
// so the browser can wake the worker for these events.
import { handleMessage } from "./background/messages.js";
import { handleUpdateAlarm, scheduleUpdateChecks } from "./background/updates.js";

chrome.runtime.onMessage.addListener(handleMessage);
chrome.runtime.onInstalled.addListener(scheduleUpdateChecks);
chrome.runtime.onStartup.addListener(scheduleUpdateChecks);
chrome.alarms.onAlarm.addListener(handleUpdateAlarm);
