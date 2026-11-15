/**
 * ============================================================================
 * Chuijhal Mart (চুইঝাল মার্ট) — Google Apps Script Backend (Production Ready)
 * ============================================================================
 *
 * ⚙️ সেটআপ নির্দেশিকা (একবারই করবেন):
 * ----------------------------------------------------------------------------
 * ১. একটি নতুন Google Sheet খুলুন: https://sheets.new
 * ২. মেনু থেকে Extensions (এক্সটেনশন) > Apps Script এ যান।
 * ৩. আগের কোড সম্পূর্ণ মুছে এই কোডটি পেস্ট করে Save (Ctrl + S বা 💾 আইকন) করুন।
 * ৪. উপরের ড্রপডাউন থেকে "setup" ফাংশন নির্বাচন করে "Run" বাটনে ক্লিক করুন।
 *    - প্রথমবার গুগল পারমিশন চাইবে: "Review Permissions" > আপনার ইমেইল বেছে নিন > "Advanced" > "Go to ... (unsafe)" > "Allow"।
 *    - রান সম্পন্ন হলে আপনার Google Sheet-এ সুন্দর কালার ফরম্যাট সহ "Settings" ও "Orders" ট্যাব তৈরি হবে।
 *
 * ৫. এবার Web App হিসেবে Deploy করুন:
 *    - উপরে ডানে Deploy > New deployment সিলেক্ট করুন।
 *    - গিয়ার (⚙️) আইকন থেকে "Web app" নির্বাচন করুন।
 *    - Description: "Chuijhal Mart Production v1"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (অবশ্যই "Anyone" দিবেন, নইলে সাইট থেকে অর্ডার সেভ হবে না)
 *    - Deploy বাটনে ক্লিক করুন।
 *    - Deployment শেষে প্রাপ্ত Web App URL (.../exec) কপি করুন।
 *
 * ৬. полученный Web App URL টি আপনার index.html ফাইলের const APPS_SCRIPT_URL = "..." এ বসান।
 *
 * ৭. টেস্ট করতে:
 *    - ড্রপডাউন থেকে "testOrder" সিলেক্ট করে "Run" বাটনে ক্লিক করলে একটি টেস্ট অর্ডার শিটে জমা হবে!
 *
 * 💡 টিপস:
 * - প্রোডাক্টের অফার মূল্য, রেগুলার মূল্য, ডেলিভারি চার্জ, ছবি, ফোন নম্বর বা নোটিফিকেশন ইমেইল
 *   পরিবর্তন করতে Google Sheet-এর "Settings" ট্যাবের B কলামের মান পরিবর্তন করবেন। কোনো কোড ছুঁতে হবে না!
 * ============================================================================
 */

// যদি স্ক্রিপ্টটি Google Sheet-এর ভেতরে না থেকে আলাদা (Standalone) স্ক্রিপ্ট হয়,
// তবে এখানে আপনার Google Sheet-এর ID দিন (নইলে ফাঁকা রাখুন):
const SPREADSHEET_ID = "";

const SHEET_ORDERS = "Orders";
const SHEET_SETTINGS = "Settings";
const DEFAULT_NOTIFY_EMAIL = ""; // ব্যাকআপ ইমেইল (Settings ট্যাবের ইমেইল অগ্রাধিকার পাবে)

// ===== নিরাপত্তা সেটিংস =====
const MIN_FILL_MS = 1500;       // দেড় সেকেন্ডের নিচে সাবমিট হলে বট/অটোমেশন চেক
const DUP_WINDOW_MIN = 10;      // একই নম্বর থেকে ১০ মিনিটের মধ্যে ডুপ্লিকেট রোধ
const MAX_PER_PHONE_DAY = 5;    // একই নম্বর থেকে দিনে সর্বোচ্চ অর্ডার সীমা
const SCAN_ROWS = 300;          // সাম্প্রতিক অর্ডার স্ক্যান সীমা

// ডেলিভারি এলাকা ম্যাপিং
const ZONE_MAP = {
  "khulna-jashore": "যশোর ও খুলনা অঞ্চল",
  "dhaka": "ঢাকা সিটি",
  "nationwide": "অন্যান্য জেলা (সারা বাংলাদেশ)"
};

// Settings ট্যাবের ডিফল্ট মান
const SETTING_DEFAULTS = [
  ["offerPrice", 999, "আজকের কম্বো অফার মূল্য (৳) — গ্রাহক এই দামে অর্ডার করবে"],
  ["regularPrice", 1200, "রেগুলার মূল্য (৳) — অফার মূল্যের চেয়ে বেশি হলে সাইটে ডিসকাউন্ট দেখাবে"],
  ["gourmetImage", "", "চুই গোরমেট জারের ছবির লিংক (ফাঁকা থাকলে রেডিমেড জার দেখাবে)"],
  ["jamImage", "", "চুই জ্যাম জারের ছবির লিংক (ফাঁকা থাকলে রেডিমেড জার দেখাবে)"],
  ["deliveryKhulnaJashore", 60, "ডেলিভারি চার্জ: যশোর ও খুলনা (৳)"],
  ["deliveryDhaka", 80, "ডেলিভারি চার্জ: ঢাকা সিটি (৳)"],
  ["deliveryNationwide", 120, "ডেলিভারি চার্জ: অন্যান্য জেলা (৳)"],
  ["maxQty", 10, "এক অর্ডারে সর্বোচ্চ কম্বো সেট সংখ্যা"],
  ["offerEndsAt", "", "অফার শেষের সময়, যেমন: 2026-12-31T23:59:00+06:00 (ফাঁকা থাকলে টাইমার বন্ধ থাকবে)"],
  ["bstiLicense", "", "BSTI লাইসেন্স নম্বর (ফাঁকা থাকলে BSTI দাবি দেখাবে না)"],
  ["returnPolicy", "ডেলিভারি ম্যান থাকা অবস্থায় টেস্ট করে দেখে পছন্দ না হলে ফেরত দেওয়ার সুযোগ রয়েছে।", "রিটার্ন ও রিফান্ড নীতি"],
  ["whatsapp", "8801833600707", "WhatsApp নম্বর (দেশের কোডসহ শুধু ডিজিট)"],
  ["phoneDisplay", "01833-600707", "ওয়েবসাইটে প্রদর্শিত হটলাইন নম্বর"],
  ["address", "যশোর-খুলনা, বাংলাদেশ (সারা বাংলাদেশে ক্যাশ অন ডেলিভারি)", "ফুটার ও যোগাযোগ ঠিকানা"],
  ["pixelId", "", "Meta (Facebook) Pixel ID (এখানে বসালে সাইটে নিজে থেকেই পিক্সেল ট্র্যাক চালু হবে)"],
  ["notifyEmail", "", "নতুন অর্ডার আসার সাথে সাথে ইমেইল নোটিফিকেশন পেতে আপনার ইমেইল দিন (ঐচ্ছিক)"]
];

const PUBLIC_KEYS = SETTING_DEFAULTS.map(function(r) { return r[0]; });

const ORDER_HEADERS = [
  "সময়", "অর্ডার আইডি", "নাম", "মোবাইল", "এলাকা", "সম্পূর্ণ ঠিকানা", "অর্ডার নোট",
  "পরিমাণ", "একক দাম (৳)", "সাবটোটাল (৳)", "ডেলিভারি (৳)", "সর্বমোট (৳)", "স্ট্যাটাস", "UTM / ট্র্যাকিং"
];

const STATUS_OPTIONS = [
  "নতুন", "কনফার্মড", "প্যাকিং", "কুরিয়ারে হস্তান্তর", "ডেলিভার্ড", "ক্যান্সেল", "রিটার্ন"
];

/**
 * স্প্রেডশিট অবজেক্ট হ্যান্ডলার (Bound ও Standalone উভয়েই কাজ করে)
 */
function getSpreadsheet_() {
  if (SPREADSHEET_ID && SPREADSHEET_ID.trim() !== "") {
    return SpreadsheetApp.openById(SPREADSHEET_ID.trim());
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("Active spreadsheet not found. Please bind this script to a Google Sheet (Extensions > Apps Script) or set SPREADSHEET_ID.");
  }
  return ss;
}

/**
 * একবার Run করুন: ট্যাব, ড্রপডাউন এবং প্রিমিয়াম কালার স্টাইলিং তৈরি করে
 */
function setup() {
  getSettingsSheet_();
  getOrdersSheet_();
  Logger.log("✅ Setup completed successfully! Settings and Orders sheets are ready.");
}

/**
 * সাইট লোড হলে সেটিংস ডাটা সরবরাহ করে
 */
function doGet(e) {
  try {
    if (e && e.parameter && e.parameter.action === "ping") {
      return out_({ ok: true, message: "Chuijhal Mart backend is running active.", time: new Date().toISOString() });
    }
    return out_({ ok: true, settings: getSettings_() });
  } catch (err) {
    console.error("doGet error: ", err);
    return out_({ ok: false, message: "Error fetching settings: " + err.toString() });
  }
}

/**
 * ওয়েবসাইট থেকে অর্ডার সাবমিশন রিসিভ করে
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    let d;
    try { 
      d = JSON.parse(e.postData.contents); 
    } catch (err) { 
      return out_({ ok: false, message: "অবৈধ অনুরোধ ডাটা।" }); 
    }

    // বট ফাঁদ: হিডেন ফিল্ড বা অস্বাভাবিক দ্রুত সাবমিট হলে ভুয়া রেসপন্স
    if (d.website || (d.elapsedMs && Number(d.elapsedMs) < MIN_FILL_MS)) {
      return out_({ ok: true, orderId: "CM-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase(), grandTotal: 0 });
    }

    // Settings ট্যাব থেকে প্রামাণ্য মূল্য ও রেট আনা (ক্লায়েন্ট সাইডের দাম বিশ্বাস করা হয় না)
    const st = getSettings_();
    const price = toNum_(st.offerPrice, 999);
    const maxQty = Math.max(1, toNum_(st.maxQty, 10));
    const zones = {
      "khulna-jashore": toNum_(st.deliveryKhulnaJashore, 60),
      "dhaka": toNum_(st.deliveryDhaka, 80),
      "nationwide": toNum_(st.deliveryNationwide, 120)
    };

    if (price <= 0) {
      return out_({ ok: false, message: "এই মুহূর্তে অর্ডার নেওয়া যাচ্ছে না। WhatsApp এ যোগাযোগ করুন।" });
    }

    // ডাটা ফিল্টারিং ও ভ্যালিডেশন
    const name = clean_(d.name, 80);
    const address = clean_(d.address, 300);
    const note = clean_(d.note, 200);
    const phone = normalizePhone_(d.phone);
    const qty = Math.floor(toNum_(d.qty, 1));
    const zoneKey = String(d.zone || "dhaka");
    const zoneName = ZONE_MAP[zoneKey] || zoneKey;
    const utm = clean_(d.utm, 120);

    if (name.length < 2) return out_({ ok: false, message: "আপনার নাম সঠিক নয়।" });
    if (!phone) return out_({ ok: false, message: "১১ ডিজিটের সঠিক মোবাইল নম্বর দিন (যেমন: 01833600707)।" });
    if (address.length < 6) return out_({ ok: false, message: "সম্পূর্ণ ঠিকানা বিস্তারিত লিখুন।" });
    if (!(qty >= 1 && qty <= maxQty)) return out_({ ok: false, message: "অর্ডারের পরিমাণ সঠিক নয়।" });
    if (!Object.prototype.hasOwnProperty.call(zones, zoneKey)) return out_({ ok: false, message: "ডেলিভারি এলাকা নির্বাচন সঠিক নয়।" });

    const subtotal = price * qty;
    const delivery = zones[zoneKey];
    const grandTotal = subtotal + delivery;

    const sheet = getOrdersSheet_();

    // ডুপ্লিকেট / স্প্যাম চেক
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const startRow = Math.max(2, lastRow - SCAN_ROWS + 1);
      const rows = sheet.getRange(startRow, 1, lastRow - startRow + 1, 4).getValues();
      const now = Date.now();
      let todayCount = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        const rowPhone = normalizePhone_(rows[i][3]);
        if (rowPhone !== phone) continue;
        
        const cellDate = rows[i][0];
        const t = cellDate instanceof Date ? cellDate.getTime() : new Date(cellDate).getTime();
        if (!isNaN(t)) {
          if (now - t < DUP_WINDOW_MIN * 60 * 1000) {
            return out_({ ok: false, message: "এই নম্বর থেকে একটু আগেই অর্ডার এসেছে। আমাদের প্রতিনিধি শীঘ্রই কল করবেন।" });
          }
          if (now - t < 24 * 3600 * 1000) todayCount++;
        }
      }
      if (todayCount >= MAX_PER_PHONE_DAY) {
        return out_({ ok: false, message: "এই নম্বর থেকে আজকের অর্ডার সীমা পূর্ণ হয়েছে। প্রয়োজনে WhatsApp এ যোগাযোগ করুন।" });
      }
    }

    const orderId = "CM-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
    const formattedDate = Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss");

    // Orders শিটে নতুন রো যুক্ত করা
    sheet.appendRow([
      formattedDate, orderId, safe_(name), "'" + phone, zoneName, safe_(address), safe_(note),
      qty, price, subtotal, delivery, grandTotal, "নতুন", safe_(utm)
    ]);

    // স্টাইল সামঞ্জস্য করা
    const newRowIndex = sheet.getLastRow();
    sheet.getRange(newRowIndex, 2).setHorizontalAlignment("center");
    sheet.getRange(newRowIndex, 4).setHorizontalAlignment("center");
    sheet.getRange(newRowIndex, 8).setHorizontalAlignment("center");
    sheet.getRange(newRowIndex, 9, 1, 4).setNumberFormat("#,##0");
    sheet.getRange(newRowIndex, 13).setHorizontalAlignment("center");

    // ইমেইল নোটিফিকেশন পাঠানো
    const notifyEmail = (st.notifyEmail || DEFAULT_NOTIFY_EMAIL).trim();
    if (notifyEmail) {
      sendNotificationEmail_({
        emailTo: notifyEmail,
        orderId: orderId,
        dateStr: formattedDate,
        name: name,
        phone: phone,
        address: address,
        zoneName: zoneName,
        note: note,
        qty: qty,
        price: price,
        subtotal: subtotal,
        delivery: delivery,
        grandTotal: grandTotal,
        utm: utm
      });
    }

    return out_({ ok: true, orderId: orderId, grandTotal: grandTotal, subtotal: subtotal, delivery: delivery });
  } catch (err) {
    console.error("doPost error: ", err);
    return out_({ ok: false, message: "সার্ভারে সাময়িক সমস্যা হয়েছে। অনুগ্রহ করে নিচের WhatsApp বাটনে অর্ডার সম্পন্ন করুন।" });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

/**
 * প্রিমিয়াম নোটিফিকেশন ইমেইল
 */
function sendNotificationEmail_(o) {
  try {
    const subject = "🛒 নতুন অর্ডার " + o.orderId + " — ৳" + o.grandTotal + " (" + o.name + ")";
    const plainBody = 
      "নতুন অর্ডার এসেছে!\n\n" +
      "অর্ডার আইডি: " + o.orderId + "\n" +
      "সময়: " + o.dateStr + "\n" +
      "নাম: " + o.name + "\n" +
      "মোবাইল: " + o.phone + "\n" +
      "ঠিকানা: " + o.address + "\n" +
      "এলাকা: " + o.zoneName + "\n\n" +
      "পণ্য: চুই গোরমেট + চুই জ্যাম কম্বো × " + o.qty + " সেট\n" +
      "সর্বমোট বিল: ৳" + o.grandTotal + " (ক্যাশ অন ডেলিভারি)\n" +
      (o.note ? "নোট: " + o.note + "\n" : "") +
      (o.utm ? "সোর্স: " + o.utm + "\n" : "");

    const htmlBody = 
      '<div style="font-family:\'Segoe UI\',Helvetica,Arial,sans-serif;max-width:580px;margin:0 auto;border:1px solid #e0d0c0;border-radius:12px;overflow:hidden;background:#ffffff;">' +
        '<div style="background:linear-gradient(135deg,#4A0E17,#63121E);padding:20px;text-align:center;color:#FFF2B2;">' +
          '<h2 style="margin:0;font-size:22px;letter-spacing:0.5px;">Chuijhal Mart — নতুন অর্ডার</h2>' +
          '<p style="margin:6px 0 0;font-size:14px;color:#f0e4cf;">অর্ডার আইডি: <strong>#' + o.orderId + '</strong></p>' +
        '</div>' +
        '<div style="padding:22px;color:#222222;line-height:1.6;">' +
          '<div style="background:#FFF8EC;border:1px solid #D4AF37;border-radius:8px;padding:14px;margin-bottom:18px;">' +
            '<h3 style="margin:0 0 10px;color:#4A0E17;font-size:15px;border-bottom:1px solid #f0debb;padding-bottom:5px;">👤 গ্রাহকের তথ্য</h3>' +
            '<p style="margin:3px 0;"><strong>নাম:</strong> ' + o.name + '</p>' +
            '<p style="margin:3px 0;"><strong>মোবাইল:</strong> <a href="tel:' + o.phone + '" style="color:#0066cc;font-weight:bold;text-decoration:none;">' + o.phone + '</a></p>' +
            '<p style="margin:3px 0;"><strong>ঠিকানা:</strong> ' + o.address + '</p>' +
            '<p style="margin:3px 0;"><strong>এলাকা:</strong> ' + o.zoneName + '</p>' +
            (o.note ? '<p style="margin:3px 0;"><strong>নোট:</strong> ' + o.note + '</p>' : '') +
          '</div>' +
          '<div style="background:#fcfcfc;border:1px solid #e8e8e8;border-radius:8px;padding:14px;margin-bottom:18px;">' +
            '<h3 style="margin:0 0 10px;color:#4A0E17;font-size:15px;border-bottom:1px solid #ececec;padding-bottom:5px;">📦 অর্ডারের বিবরণ</h3>' +
            '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
              '<tr><td style="padding:5px 0;color:#666;">আইটেম:</td><td style="padding:5px 0;font-weight:bold;text-align:right;">চুই গোরমেট + চুই জ্যাম কম্বো</td></tr>' +
              '<tr><td style="padding:5px 0;color:#666;">পরিমাণ:</td><td style="padding:5px 0;font-weight:bold;text-align:right;">' + o.qty + ' সেট</td></tr>' +
              '<tr><td style="padding:5px 0;color:#666;">একক দাম:</td><td style="padding:5px 0;text-align:right;">৳' + o.price + '</td></tr>' +
              '<tr><td style="padding:5px 0;color:#666;">সাবটোটাল:</td><td style="padding:5px 0;text-align:right;">৳' + o.subtotal + '</td></tr>' +
              '<tr><td style="padding:5px 0;color:#666;">ডেলিভারি চার্জ:</td><td style="padding:5px 0;text-align:right;">৳' + o.delivery + '</td></tr>' +
              '<tr style="border-top:2px solid #4A0E17;font-size:16px;">' +
                '<td style="padding:9px 0 3px;font-weight:bold;color:#4A0E17;">ক্যাশ অন ডেলিভারি বিল:</td>' +
                '<td style="padding:9px 0 3px;font-weight:bold;color:#4A0E17;text-align:right;">৳' + o.grandTotal + '</td>' +
              '</tr>' +
            '</table>' +
          '</div>' +
          '<div style="text-align:center;margin:20px 0 10px;">' +
            '<a href="tel:' + o.phone + '" style="display:inline-block;background-color:#2F5D3A;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;margin:0 4px 6px;">📞 কল করুন</a>' +
            '<a href="https://wa.me/88' + o.phone + '" style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:bold;margin:0 4px 6px;">💬 WhatsApp এ নক দিন</a>' +
          '</div>' +
        '</div>' +
      '</div>';

    MailApp.sendEmail({
      to: o.emailTo,
      subject: subject,
      body: plainBody,
      htmlBody: htmlBody
    });
  } catch (err) {
    console.error("MailApp send error: ", err);
  }
}

// ===== Settings Sheet =====
function getSettingsSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_SETTINGS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_SETTINGS, 0);
    const headerRange = sh.getRange(1, 1, 1, 3);
    headerRange.setValues([["কী (Key — বদলাবেন না)", "মান (Value — এখানে পছন্দমতো বদলান)", "বাংলা বর্ণনা"]]);
    headerRange.setBackground("#4A0E17").setFontColor("#FFF2B2").setFontWeight("bold").setFontSize(10).setVerticalAlignment("middle");
    sh.setRowHeight(1, 34);

    sh.getRange(2, 1, SETTING_DEFAULTS.length, 3).setValues(SETTING_DEFAULTS);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 200); 
    sh.setColumnWidth(2, 350); 
    sh.setColumnWidth(3, 500);

    const valRange = sh.getRange(2, 2, SETTING_DEFAULTS.length, 1);
    valRange.setBackground("#FFF8EC").setNumberFormat("@");
  }
  return sh;
}

function getSettings_() {
  const sh = getSettingsSheet_();
  const last = sh.getLastRow();
  const vals = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const out = {};
  SETTING_DEFAULTS.forEach(function (r) { out[r[0]] = r[1]; });
  vals.forEach(function (r) {
    const k = String(r[0]).trim();
    if (PUBLIC_KEYS.indexOf(k) === -1) return;
    let v = r[1];
    if (k === "gourmetImage" || k === "jamImage") v = imageUrl_(v);
    if (v !== "" && v !== null && v !== undefined) out[k] = (typeof v === "string") ? v.trim() : v;
    else if (k.indexOf("Image") > -1 || k === "offerEndsAt" || k === "bstiLicense" || k === "pixelId" || k === "notifyEmail") out[k] = "";
  });
  return out;
}

// Google Drive শেয়ার লিংক সরাসরি ইমেজ সিডিএনে রূপান্তর করে
function imageUrl_(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  const m = s.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || 
            s.match(/drive\.google\.com\/open\?id=([\w-]+)/) || 
            s.match(/[?&]id=([\w-]+)/);
  if (/drive\.google\.com/.test(s) && m) return "https://lh3.googleusercontent.com/d/" + m[1];
  return /^https:\/\//.test(s) ? s : "";
}

// ===== Orders Sheet =====
function getOrdersSheet_() {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(SHEET_ORDERS);
  if (!sh) sh = ss.insertSheet(SHEET_ORDERS);
  if (sh.getLastRow() === 0) {
    sh.appendRow(ORDER_HEADERS);
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 36);

    const hRange = sh.getRange(1, 1, 1, ORDER_HEADERS.length);
    hRange.setBackground("#4A0E17").setFontColor("#FFF2B2").setFontWeight("bold").setFontSize(10).setVerticalAlignment("middle");

    // কলাম উইডথ অপ্টিমাইজেশন
    sh.setColumnWidth(1, 165); // সময়
    sh.setColumnWidth(2, 125); // অর্ডার আইডি
    sh.setColumnWidth(3, 160); // নাম
    sh.setColumnWidth(4, 135); // মোবাইল
    sh.setColumnWidth(5, 170); // এলাকা
    sh.setColumnWidth(6, 280); // সম্পূর্ণ ঠিকানা
    sh.setColumnWidth(7, 180); // নোট
    sh.setColumnWidth(8, 80);  // পরিমাণ
    sh.setColumnWidth(9, 95);  // একক দাম
    sh.setColumnWidth(10, 100); // সাবটোটাল
    sh.setColumnWidth(11, 105); // ডেলিভারি
    sh.setColumnWidth(12, 115); // সর্বমোট
    sh.setColumnWidth(13, 135); // স্ট্যাটাস
    sh.setColumnWidth(14, 180); // UTM

    // মোবাইল কলাম প্লেইন টেক্সট
    sh.getRange(2, 4, 999, 1).setNumberFormat("@");

    // স্ট্যাটাস ড্রপডাউন ভ্যালিডেশন
    const statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(STATUS_OPTIONS, true)
      .setAllowInvalid(false)
      .build();
    sh.getRange(2, 13, 999, 1).setDataValidation(statusRule);
  }
  return sh;
}

// ===== হেল্পার ফাংশন =====
function toAsciiDigits_(s) {
  const bn = {"০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9"};
  return String(s || "").replace(/[০-৯]/g, function (d) { return bn[d]; });
}

function toNum_(v, d) {
  const n = Number(toAsciiDigits_(v));
  return (v !== "" && v !== null && isFinite(n)) ? n : d;
}

function clean_(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, max);
}

// Sheets formula injection সুরক্ষা
function safe_(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function normalizePhone_(p) {
  const s = toAsciiDigits_(p).replace(/[\s\-\(\)\.]/g, "");
  const m = s.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : "";
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * এক ক্লিকে সম্পূর্ণ ব্যাকএন্ড ও শিট টেস্ট করার ফাংশন
 * (Apps Script এ "testOrder" সিলেক্ট করে Run ক্লিক করুন)
 */
function testOrder() {
  setup();
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        name: "টেস্ট গ্রাহক",
        phone: "01833600707",
        address: "বাসা ১২, রোড ৫, ধানমন্ডি, ঢাকা",
        zone: "dhaka",
        qty: 1,
        note: "টেস্ট অর্ডার ভেরিফিকেশন",
        website: "",
        elapsedMs: 5000,
        utm: "test|direct|manual"
      })
    }
  };
  const res = doPost(mockEvent);
  Logger.log("doPost response: " + res.getContent());
  return res.getContent();
}
