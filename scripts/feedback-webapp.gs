/**
 * EchoByJMG – Site feedback web app (Google Apps Script).
 *
 * Paste into the Apps Script project bound to the "EchoByJMG – Site feedback" sheet
 * (Extensions > Apps Script), replacing the old code, then Deploy > Manage deployments >
 * edit the existing deployment > Version: New version > Deploy. The /exec URL stays the same.
 *
 * Sheet "Feedback", columns A:O:
 * Date | Name | Team | Type | Page | Comment | Status | Reply | Viewport | Template | Theme ID |
 * Priority | Assigned team | Fixed in (PR) | Attachments
 *
 * Attachments are saved to My Drive/Clients/EchoByJMG/DEV of the account the web app runs as
 * ("Execute as: Me"), one subfolder per feedback row, and linked in column O.
 */

var SHEET_NAME = 'Feedback';
var FOLDER_PATH = ['Clients', 'EchoByJMG', 'DEV'];
var MAX_FILES = 5;
var MAX_BYTES = 10 * 1024 * 1024;
var ALLOWED = /^image\/(png|jpe?g|gif|webp|heic|heif)$|^application\/pdf$/;
var HEADERS = ['Date', 'Name', 'Team', 'Type', 'Page', 'Comment', 'Status', 'Reply', 'Viewport',
  'Template', 'Theme ID', 'Priority', 'Assigned team', 'Fixed in (PR)', 'Attachments'];

function sheet_() {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  var head = sh.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (head[14] !== 'Attachments') sh.getRange(1, 15).setValue('Attachments').setFontWeight('bold');
  return sh;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function folder_() {
  var f = DriveApp.getRootFolder();
  FOLDER_PATH.forEach(function (name) {
    var it = f.getFoldersByName(name);
    f = it.hasNext() ? it.next() : f.createFolder(name);
  });
  return f;
}

function clean_(s, n) { return String(s == null ? '' : s).slice(0, n || 500); }

function doPost(e) {
  var d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (d.website) return json_({ ok: true }); // honeypot
  if (!clean_(d.name).trim() || !clean_(d.message, 2000).trim()) return json_({ ok: false, error: 'missing' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_();
    var now = new Date();
    var row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 14).setValues([[
      now, clean_(d.name, 80), clean_(d.team, 40), clean_(d.type, 40), clean_(d.page), clean_(d.message, 2000),
      'New', '', clean_(d.viewport, 40), clean_(d.template, 80), clean_(d.theme, 40), '', '', ''
    ]]);
    sh.getRange(row, 11).setNumberFormat('@');

    var files = saveFiles_(d.attachments, row, now, d.name);
    if (files.length) writeLinks_(sh.getRange(row, 15), files);
    return json_({ ok: true, row: row, attachments: files.length });
  } finally {
    lock.releaseLock();
  }
}

function saveFiles_(list, row, now, who) {
  if (!list || !list.length) return [];
  var total = 0, out = [], sub = null;
  list.slice(0, MAX_FILES).forEach(function (a) {
    if (!a || !a.data || !ALLOWED.test(a.type || '')) return;
    var bytes = Utilities.base64Decode(a.data);
    total += bytes.length;
    if (total > MAX_BYTES) return;
    if (!sub) {
      var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
      sub = folder_().createFolder('Row ' + row + ' · ' + stamp + ' · ' + clean_(who, 40));
    }
    var name = clean_(a.name, 120).replace(/[\\/:*?"<>|]+/g, '-') || 'attachment';
    var file = sub.createFile(Utilities.newBlob(bytes, a.type, name));
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {
      // Workspace policy may block link sharing; the file stays private to the owner.
    }
    out.push({ name: name, url: file.getUrl() });
  });
  return out;
}

function writeLinks_(cell, files) {
  var text = files.map(function (f) { return f.name; }).join('\n');
  var b = SpreadsheetApp.newRichTextValue().setText(text), pos = 0;
  files.forEach(function (f) {
    b.setLinkUrl(pos, pos + f.name.length, f.url);
    pos += f.name.length + 1;
  });
  cell.setRichTextValue(b.build()).setWrap(true);
}

function readLinks_(rt) {
  if (!rt) return [];
  return rt.getRuns().filter(function (r) { return r.getLinkUrl(); }).map(function (r) {
    return { name: r.getText().trim(), url: r.getLinkUrl() };
  });
}

function doGet(e) {
  if (!e || !e.parameter || e.parameter.action !== 'list') return json_({ ok: true });
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n < 1) return json_({ ok: true, items: [] });
  var vals = sh.getRange(2, 1, n, 15).getValues();
  var rich = sh.getRange(2, 15, n, 1).getRichTextValues();
  var items = vals.map(function (r, i) {
    return {
      date: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      name: r[1], team: r[2], type: r[3], page: r[4], message: r[5], status: r[6] || 'New', reply: r[7],
      priority: r[11], assigned: r[12], fixedIn: r[13], attachments: readLinks_(rich[i][0])
    };
  }).filter(function (i) { return i.name || i.message; });
  items.reverse();
  return json_({ ok: true, items: items.slice(0, 100) });
}

/** Run once from the editor to grant Drive access and create the DEV folder. */
function setup() {
  sheet_();
  Logger.log(folder_().getUrl());
}
