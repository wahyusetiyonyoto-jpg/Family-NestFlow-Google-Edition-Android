const SHEETS = {
  TRANSACTIONS: 'Transactions',
  CATEGORIES: 'Categories',
  ACCOUNTS: 'Accounts',
  BUDGETS: 'Budgets',
  GOALS: 'Goals',
  BILLS: 'Bills',
  DEBTS: 'Debts',
  ASSETS: 'Assets',
  RECURRING: 'Recurring',
  SETTINGS: 'Settings',
  USERS: 'Users',
  REMINDER_LOG: 'ReminderLog'
};

const TZ_FALLBACK = 'Asia/Jakarta';
const APP_VERSION = '4.0.1';
let REQUEST_ACTOR = null;


function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Family NestFlow')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

/**
 * Jalankan fungsi ini SATU KALI dari editor Apps Script sebelum deploy pertama.
 * Fungsi akan mengikat project ke spreadsheet, menyiapkan database, folder bukti,
 * admin awal, dan trigger reminder harian.
 */
function QUICK_SETUP_() {
  const active=SpreadsheetApp.getActiveSpreadsheet();
  if(!active) throw new Error('Buka Google Sheet Family NestFlow lalu jalankan Apps Script dari Extensions > Apps Script.');
  const props=PropertiesService.getScriptProperties();
  const ownerEmail=String(Session.getEffectiveUser().getEmail()||'').trim().toLowerCase();
  if(!ownerEmail) throw new Error('Email akun Google pemilik tidak dapat dibaca.');
  props.setProperty('FNF_SPREADSHEET_ID',active.getId());
  props.setProperty('FNF_OWNER_EMAIL',ownerEmail);
  setupDatabase_(); ensureOwnerAdmin_(active);
  const receiptFolder=getOrCreateReceiptFolder_();
  const reminder=installReminderTrigger_();
  SpreadsheetApp.flush();
  try{SpreadsheetApp.getUi().alert('Family NestFlow Google Edition v'+APP_VERSION+' siap.\n\nDatabase: TERHUBUNG\nAutentikasi: AKUN GOOGLE\nAdmin: '+ownerEmail+'\nFolder bukti: SIAP\nReminder: AKTIF\n\nSaat deploy WAJIB pilih Execute as: User accessing the web app.')}catch(e){}
  return {ok:true,version:APP_VERSION,authMode:'Google Account',ownerEmail,spreadsheetId:active.getId(),receiptFolderId:receiptFolder.getId(),reminderInstalled:reminder.installed};
}

// Alias untuk kompatibilitas panduan/versi lama.
function FIRST_TIME_SETUP_() {
  return QUICK_SETUP_();
}

function onOpen(){SpreadsheetApp.getUi().createMenu('Family NestFlow').addItem('1. QUICK SETUP / Perbarui','QUICK_SETUP_').addItem('2. Cek Status Setup','SHOW_SETUP_STATUS_').addItem('3. Tes Reminder Email','TEST_REMINDER_FROM_SHEET_').addSeparator().addItem('4. Buka Folder Bukti','SHOW_RECEIPT_FOLDER_').addToUi();}
function SHOW_RECEIPT_FOLDER_(){SpreadsheetApp.getUi().alert('Folder bukti Family NestFlow:\n'+getOrCreateReceiptFolder_().getUrl());}

function SHOW_SETUP_STATUS_() {
  const status = getSetupStatus_();
  const ready = status.databaseConnected && status.reminderInstalled && status.receiptFolderReady && status.securityReady;
  SpreadsheetApp.getUi().alert(
    'Family NestFlow ' + APP_VERSION + '\n\n' +
    'Status: ' + (ready ? 'SIAP DEPLOY' : 'PERLU DILENGKAPI') + '\n\n' +
    'Database: ' + (status.databaseConnected ? 'TERHUBUNG' : 'BELUM') + '\n' +
    'Sheet database: ' + status.sheetCount + '/' + Object.keys(SHEETS).length + '\n' +
    'Akun Google: ' + (status.securityReady ? 'SIAP' : 'BELUM') + '\n' +
    'Reminder: ' + (status.reminderInstalled ? 'AKTIF' : 'BELUM AKTIF') + '\n' +
    'Folder bukti: ' + (status.receiptFolderReady ? 'SIAP' : 'BELUM') + '\n' +
    'Web App URL: ' + (status.webAppUrl || 'Belum di-deploy')
  );
}

function TEST_REMINDER_FROM_SHEET_() {
  setupDatabase_();
  const ss = getSpreadsheet_();
  const admin = getSafeUsers_(ss).find(u => u.role === 'Admin');
  if (!admin) throw new Error('Admin belum tersedia. Pilih menu Family NestFlow → QUICK SETUP / Perbarui terlebih dahulu.');
  const result = sendTestReminder_(admin.id);
  SpreadsheetApp.getUi().alert('Email tes terkirim ke: ' + result.recipient);
}


/**
 * Google Edition: akun Google yang membuka Web App adalah identitas aplikasi.
 * Deployment WAJIB: Execute as = User accessing the web app.
 */
function getGoogleAccountBootstrap(){setupDatabase_();const ss=getSpreadsheet_();const settings=Object.fromEntries(readObjects_(ss.getSheetByName(SHEETS.SETTINGS)).map(r=>[String(r.Key||''),String(r.Value||'')]));const user=requireGoogleUser_();return {ok:true,appName:settings.AppName||'Family NestFlow',householdName:settings.HouseholdName||'Keluarga Kita',version:APP_VERSION,authMode:'Google Account',user};}
function apiGoogle(action,args){const actor=requireGoogleUser_();REQUEST_ACTOR=actor;const a=Array.isArray(args)?args:[];const handlers={getAppData:getAppData_,addTransaction:addTransaction_,deleteTransaction:deleteTransaction_,uploadReceipt:uploadReceipt_,saveBudget:saveBudget_,addAccount:addAccount_,addCategory:addCategory_,saveGoal:saveGoal_,contributeGoal:contributeGoal_,deleteGoal:deleteGoal_,saveBill:saveBill_,markBillPaid:markBillPaid_,deleteBill:deleteBill_,saveDebt:saveDebt_,payDebt:payDebt_,deleteDebt:deleteDebt_,saveAsset:saveAsset_,deleteAsset:deleteAsset_,saveRecurring:saveRecurring_,runRecurring:runRecurring_,deleteRecurring:deleteRecurring_,updateSettings:updateSettings_,saveMember:saveMember_,deleteMember:deleteMember_,installDailyBillReminder:installDailyBillReminder_,removeDailyBillReminder:removeDailyBillReminder_,sendTestReminder:sendTestReminder_};const h=handlers[String(action||'')];if(!h)throw new Error('ACTION_NOT_ALLOWED|Aksi tidak tersedia.');try{return h.apply(null,a)}finally{REQUEST_ACTOR=null}}
function currentGoogleEmail_(){const email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();if(!email)throw new Error('GOOGLE_IDENTITY_UNAVAILABLE|Email akun Google tidak dapat dibaca. Pastikan Web App di-deploy sebagai User accessing the web app lalu izinkan akses.');return email;}
function requireGoogleUser_(){const email=currentGoogleEmail_();const rows=readObjects_(getSpreadsheet_().getSheetByName(SHEETS.USERS));const row=rows.find(u=>String(u.Active).toLowerCase()!=='false'&&String(u.Email||'').trim().toLowerCase()===email);if(!row)throw new Error('ACCESS_DENIED|Akun Google '+email+' belum terdaftar. Minta Admin Family NestFlow menambahkan email tersebut.');return {id:String(row.ID),name:String(row.Name||email.split('@')[0]),email,role:String(row.Role||'Member'),reminderEmail:String(row.ReminderEmail||row.Email||email)};}

// Helper migrasi lama; PIN tidak digunakan untuk autentikasi Google Edition.
function ensureAllActiveUsersHavePin_(ss) {
  const sh = ss.getSheetByName(SHEETS.USERS);
  const values = sh.getDataRange().getValues();
  const generated = [];
  for (let i = 1; i < values.length; i++) {
    const active = String(values[i][5]).toLowerCase() !== 'false';
    const id = String(values[i][0] || '');
    const name = String(values[i][1] || 'Anggota');
    const stored = String(values[i][4] || '');
    if (!active || !id || stored) continue;
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    sh.getRange(i + 1, 5).setValue(hashPin_(id, pin));
    generated.push({ id, name, pin });
  }
  return generated;
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FNF_SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) {
      props.deleteProperty('FNF_SPREADSHEET_ID');
    }
  }
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('FNF_SPREADSHEET_ID', active.getId());
    return active;
  }
  throw new Error('Database Family NestFlow belum terhubung. Jalankan FIRST_TIME_SETUP dari Google Sheet terlebih dahulu.');
}

function ensureOwnerAdmin_(ss) {
  const email = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || '';
  if (!email) return;
  const sh = ss.getSheetByName(SHEETS.USERS);
  const rows = readObjects_(sh);
  const admins = rows.filter(u => String(u.Active).toLowerCase() !== 'false' && String(u.Role) === 'Admin');
  if (!admins.length) {
    sh.appendRow([Utilities.getUuid(),'Admin Keluarga',email,'Admin','',true,email,new Date()]);
    return;
  }
  const first = admins[0];
  if (!String(first.Email || '').trim()) {
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(first.ID)) {
        sh.getRange(i + 1, 3).setValue(email);
        sh.getRange(i + 1, 7).setValue(email);
        break;
      }
    }
  }
}

function installReminderTrigger_() {
  removeReminderTriggers_();
  const ss = getSpreadsheet_();
  const hour = Math.max(0, Math.min(23, Number(getSetting_(ss,'ReminderHour') || 8)));
  const timezone = getSetting_(ss,'Timezone') || TZ_FALLBACK;
  ScriptApp.newTrigger('sendBillReminders_').timeBased().everyDays(1).atHour(hour).inTimezone(timezone).create();
  upsertSetting_(ss.getSheetByName(SHEETS.SETTINGS),'ReminderEnabled','true');
  return getReminderStatus_();
}

function getSetupStatus_(){const props=PropertiesService.getScriptProperties(),spreadsheetId=props.getProperty('FNF_SPREADSHEET_ID')||'';let databaseConnected=false,receiptFolderReady=false,securityReady=false,sheetCount=0;try{if(spreadsheetId){const ss=SpreadsheetApp.openById(spreadsheetId);sheetCount=Object.values(SHEETS).filter(n=>!!ss.getSheetByName(n)).length;databaseConnected=sheetCount===Object.keys(SHEETS).length;const users=readObjects_(ss.getSheetByName(SHEETS.USERS)).filter(u=>String(u.Active).toLowerCase()!=='false');securityReady=users.length>0&&users.every(u=>!!String(u.Email||'').trim())&&users.some(u=>String(u.Role)==='Admin')}}catch(e){}const folderId=props.getProperty('RECEIPT_FOLDER_ID')||'';if(folderId){try{DriveApp.getFolderById(folderId);receiptFolderReady=true}catch(e){}}let webAppUrl='';try{webAppUrl=ScriptApp.getService().getUrl()||''}catch(e){}return {databaseConnected,securityReady,authMode:'Google Account',sheetCount,reminderInstalled:ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='sendBillReminders_'),receiptFolderReady,webAppUrl};}

function setupDatabase_() {
  const ss = getSpreadsheet_();

  ensureSheet_(ss, SHEETS.TRANSACTIONS, [
    'ID','Date','Type','Category','Description','Account','Amount','CreatedBy','CreatedAt','ToAccount','ReceiptUrl','Tags','MemberId','MemberName'
  ]);
  ensureSheet_(ss, SHEETS.CATEGORIES, ['ID','Type','Name','Active']);
  ensureSheet_(ss, SHEETS.ACCOUNTS, ['ID','Name','OpeningBalance','Active','Type']);
  ensureSheet_(ss, SHEETS.BUDGETS, ['ID','Month','Category','Amount']);
  ensureSheet_(ss, SHEETS.GOALS, ['ID','Name','TargetAmount','CurrentAmount','DueDate','Icon','Active','CreatedAt']);
  ensureSheet_(ss, SHEETS.BILLS, ['ID','Name','Category','Amount','Account','DueDay','Active','LastPaidMonth','Notes','CreatedAt','ReminderEnabled','ReminderDaysBefore','ReminderRecipients']);
  ensureSheet_(ss, SHEETS.DEBTS, ['ID','Name','Kind','OriginalAmount','Balance','MonthlyPayment','DueDay','Account','Active','Notes','CreatedAt']);
  ensureSheet_(ss, SHEETS.ASSETS, ['ID','Name','Category','Value','Notes','Active','UpdatedAt']);
  ensureSheet_(ss, SHEETS.RECURRING, ['ID','Name','Type','Category','Amount','Account','ToAccount','DayOfMonth','Active','LastGeneratedMonth','Notes','CreatedAt']);
  ensureSheet_(ss, SHEETS.SETTINGS, ['Key','Value']);
  ensureSheet_(ss, SHEETS.USERS, ['ID','Name','Email','Role','PinHash','Active','ReminderEmail','CreatedAt']);
  ensureSheet_(ss, SHEETS.REMINDER_LOG, ['ID','BillID','BillName','DueDate','Recipient','SentAt','ReminderKey','Status']);

  seedCategories_(ss);
  seedAccounts_(ss);
  seedSettings_(ss);
  seedUsers_(ss);
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('FNF_SCHEMA_VERSION') !== APP_VERSION) {
    formatSheets_(ss);
    props.setProperty('FNF_SCHEMA_VERSION', APP_VERSION);
  }
  return { ok: true, version: APP_VERSION, message: 'Database Family NestFlow v' + APP_VERSION + ' siap digunakan.' };
}

function getAppData_(month, memberId) {
  setupDatabase_();
  const ss = getSpreadsheet_();
  const timezone = getSetting_(ss, 'Timezone') || TZ_FALLBACK;
  const selectedMonth = month || Utilities.formatDate(new Date(), timezone, 'yyyy-MM');

  const transactions = readObjects_(ss.getSheetByName(SHEETS.TRANSACTIONS))
    .map(t => normalizeTransaction_(t, timezone))
    .filter(t => t.date)
    .sort((a,b) => ((b.date || '') + (b.createdAt || '')).localeCompare((a.date || '') + (a.createdAt || '')));

  const categories = readObjects_(ss.getSheetByName(SHEETS.CATEGORIES))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(c => ({ id:String(c.ID || ''), type:String(c.Type || ''), name:String(c.Name || '') }));

  const accountRows = readObjects_(ss.getSheetByName(SHEETS.ACCOUNTS))
    .filter(r => String(r.Active).toLowerCase() !== 'false');
  const accounts = accountRows.map(a => ({
    id: String(a.ID || ''),
    name: String(a.Name || ''),
    openingBalance: Number(a.OpeningBalance || 0),
    type: String(a.Type || 'Bank'),
    balance: computeAccountBalance_(String(a.Name || ''), Number(a.OpeningBalance || 0), transactions)
  }));

  const budgetsRaw = readObjects_(ss.getSheetByName(SHEETS.BUDGETS));
  const goals = readObjects_(ss.getSheetByName(SHEETS.GOALS))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(g => ({
      id: String(g.ID || ''), name: String(g.Name || ''),
      targetAmount: Number(g.TargetAmount || 0), currentAmount: Number(g.CurrentAmount || 0),
      dueDate: normalizeDate_(g.DueDate, timezone), icon: String(g.Icon || 'target')
    }));

  const bills = readObjects_(ss.getSheetByName(SHEETS.BILLS))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(b => {
      const id = String(b.ID || '');
      const taggedPaid = transactions.some(t => String(t.tags || '').includes('bill:' + id + ':' + selectedMonth));
      const paid = taggedPaid || String(b.LastPaidMonth || '') === selectedMonth;
      return {
        id, name: String(b.Name || ''), category: String(b.Category || ''),
        amount: Number(b.Amount || 0), account: String(b.Account || ''), dueDay: Number(b.DueDay || 1),
        lastPaidMonth: paid ? selectedMonth : String(b.LastPaidMonth || ''), notes: String(b.Notes || ''),
        reminderEnabled: String(b.ReminderEnabled || 'true').toLowerCase() !== 'false',
        reminderDaysBefore: String(b.ReminderDaysBefore || getSetting_(ss,'ReminderDaysBefore') || '7,3,1,0,-1'),
        reminderRecipients: String(b.ReminderRecipients || ''),
        status: paid ? 'paid' : billStatus_(Number(b.DueDay || 1), selectedMonth, timezone)
      };
    });

  const debts = readObjects_(ss.getSheetByName(SHEETS.DEBTS))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(d => ({
      id: String(d.ID || ''), name: String(d.Name || ''), kind: String(d.Kind || 'Utang'),
      originalAmount: Number(d.OriginalAmount || 0), balance: Number(d.Balance || 0),
      monthlyPayment: Number(d.MonthlyPayment || 0), dueDay: Number(d.DueDay || 1),
      account: String(d.Account || ''), notes: String(d.Notes || '')
    }));

  const assets = readObjects_(ss.getSheetByName(SHEETS.ASSETS))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(a => ({
      id: String(a.ID || ''), name: String(a.Name || ''), category: String(a.Category || 'Lainnya'),
      value: Number(a.Value || 0), notes: String(a.Notes || ''), updatedAt: normalizeDateTime_(a.UpdatedAt, timezone)
    }));

  const recurring = readObjects_(ss.getSheetByName(SHEETS.RECURRING))
    .filter(r => String(r.Active).toLowerCase() !== 'false')
    .map(r => {
      const id = String(r.ID || '');
      const taggedGenerated = transactions.some(t => String(t.tags || '').includes('recurring:' + id + ':' + selectedMonth));
      return {
        id, name: String(r.Name || ''), type: String(r.Type || 'Pengeluaran'),
        category: String(r.Category || ''), amount: Number(r.Amount || 0), account: String(r.Account || ''),
        toAccount: String(r.ToAccount || ''), dayOfMonth: Number(r.DayOfMonth || 1),
        lastGeneratedMonth: taggedGenerated ? selectedMonth : String(r.LastGeneratedMonth || ''), notes: String(r.Notes || '')
      };
    });

  const settingsRows = readObjects_(ss.getSheetByName(SHEETS.SETTINGS));
  const settings = Object.fromEntries(settingsRows.map(s => [String(s.Key || ''), String(s.Value || '')]));
  const users = getSafeUsers_(ss);
  const activeMember = REQUEST_ACTOR || resolveMember_(ss, memberId);
  const reminderStatus = getReminderStatus_();

  const monthTx = transactions.filter(t => (t.date || '').slice(0,7) === selectedMonth);
  const income = sum_(monthTx.filter(t => t.type === 'Pemasukan').map(t => t.amount));
  const expense = sum_(monthTx.filter(t => t.type === 'Pengeluaran').map(t => t.amount));
  const net = income - expense;
  const savingsRate = income > 0 ? Math.max(-999, Math.min(999, (net / income) * 100)) : 0;
  const liquidBalance = sum_(accounts.map(a => a.balance));
  const assetTotal = sum_(assets.map(a => a.value));
  const debtTotal = sum_(debts.filter(d => d.kind === 'Utang').map(d => d.balance));
  const receivableTotal = sum_(debts.filter(d => d.kind === 'Piutang').map(d => d.balance));
  const netWorth = liquidBalance + assetTotal + receivableTotal - debtTotal;

  const spendingByCategory = {};
  monthTx.filter(t => t.type === 'Pengeluaran').forEach(t => {
    spendingByCategory[t.category] = (spendingByCategory[t.category] || 0) + t.amount;
  });

  const monthBudgets = budgetsRaw.filter(b => String(b.Month || '') === selectedMonth).map(b => ({
    id: String(b.ID || ''), month: String(b.Month || ''), category: String(b.Category || ''),
    amount: Number(b.Amount || 0), spent: Number(spendingByCategory[String(b.Category || '')] || 0)
  }));
  const budgetTotal = sum_(monthBudgets.map(b => b.amount));
  const budgetSpent = sum_(monthBudgets.map(b => b.spent));

  const now = new Date();
  const currentMonth = Utilities.formatDate(now, timezone, 'yyyy-MM');
  const dueBillsCount = bills.filter(b => b.status !== 'paid' && selectedMonth === currentMonth).length;

  return {
    version: APP_VERSION,
    selectedMonth,
    summary: {
      liquidBalance, assetTotal, debtTotal, receivableTotal, netWorth,
      income, expense, net, savingsRate,
      budgetTotal, budgetSpent, budgetRemaining: budgetTotal - budgetSpent,
      dueBillsCount,
      goalTotal: sum_(goals.map(g => g.targetAmount)),
      goalSaved: sum_(goals.map(g => g.currentAmount))
    },
    transactions: transactions.slice(0, 1200),
    categories, accounts, budgets: monthBudgets, goals, bills, debts, assets, recurring,
    spendingByCategory,
    trends: buildMonthlyTrends_(transactions, selectedMonth, 12),
    settings, users, activeMember, reminderStatus
  };
}

function addTransaction_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['date','type','account','amount']);
  const type = String(payload.type);
  if (!['Pemasukan','Pengeluaran','Transfer'].includes(type)) throw new Error('Jenis transaksi tidak valid.');
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Nominal harus lebih besar dari 0.');
  if (type !== 'Transfer') validateRequired_(payload, ['category']);
  if (type === 'Transfer') {
    validateRequired_(payload, ['toAccount']);
    if (String(payload.account) === String(payload.toAccount)) throw new Error('Rekening asal dan tujuan tidak boleh sama.');
  }
  appendTransaction_(payload);
  return getAppData_(String(payload.date).slice(0,7));
}

function deleteTransaction_(id, month) {
  setupDatabase_();
  const ss = getSpreadsheet_();
  const actor = REQUEST_ACTOR;
  if (!actor) throw new Error('AUTH_REQUIRED|Silakan masuk ke Family NestFlow.');
  const sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const rows = readObjects_(sh);
  const target = rows.find(r => String(r.ID) === String(id));
  if (!target) throw new Error('Transaksi tidak ditemukan.');
  const ownerId = String(target.MemberId || '');
  if (actor.role !== 'Admin' && (!ownerId || ownerId !== String(actor.id))) {
    throw new Error('PERMISSION_DENIED|Member hanya dapat menghapus transaksi yang dibuat sendiri.');
  }
  deleteRowById_(sh, id, false);
  return getAppData_(month);
}

function uploadReceipt_(filePayload) {
  setupDatabase_();
  if (!filePayload || !filePayload.dataUrl) throw new Error('File bukti transaksi tidak ditemukan.');
  const m = String(filePayload.dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error('Format file tidak didukung.');
  const mimeType = String(m[1] || '').toLowerCase();
  const allowedMimeTypes = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if (!allowedMimeTypes.includes(mimeType)) throw new Error('Bukti transaksi hanya boleh JPG, PNG, WEBP, GIF, atau PDF.');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Ukuran bukti transaksi maksimal 5 MB.');
  const safeName = cleanFilename_(filePayload.name || ('receipt-' + Date.now()));
  const blob = Utilities.newBlob(bytes, mimeType, safeName);
  const folder = getOrCreateReceiptFolder_();
  const file = folder.createFile(blob);
  shareReceiptWithFamily_(file, getSpreadsheet_());
  return { ok:true, url:file.getUrl(), name:file.getName() };
}

function saveBudget_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['month','category','amount']);
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount < 0) throw new Error('Nominal anggaran tidak valid.');
  const sh = getSpreadsheet_().getSheetByName(SHEETS.BUDGETS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][1]) === String(payload.month) && String(values[i][2]) === String(payload.category)) {
      sh.getRange(i + 1, 4).setValue(amount);
      return getAppData_(payload.month);
    }
  }
  sh.appendRow([Utilities.getUuid(), payload.month, payload.category, amount]);
  return getAppData_(payload.month);
}

function addAccount_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name']);
  const name = cleanText_(payload.name);
  const sh = getSpreadsheet_().getSheetByName(SHEETS.ACCOUNTS);
  if (readObjects_(sh).some(a => String(a.Name || '').toLowerCase() === name.toLowerCase() && String(a.Active).toLowerCase() !== 'false')) throw new Error('Nama rekening/dompet sudah ada.');
  sh.appendRow([Utilities.getUuid(), name, Number(payload.openingBalance || 0), true, cleanText_(payload.type || 'Bank')]);
  return getAppData_(payload.month);
}

function addCategory_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['type','name']);
  if (!['Pemasukan','Pengeluaran'].includes(String(payload.type))) throw new Error('Jenis kategori tidak valid.');
  const name = cleanText_(payload.name);
  const sh = getSpreadsheet_().getSheetByName(SHEETS.CATEGORIES);
  if (readObjects_(sh).some(c => String(c.Type) === String(payload.type) && String(c.Name || '').toLowerCase() === name.toLowerCase() && String(c.Active).toLowerCase() !== 'false')) throw new Error('Kategori sudah ada.');
  sh.appendRow([Utilities.getUuid(), payload.type, name, true]);
  return getAppData_(payload.month);
}

function saveGoal_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name','targetAmount']);
  const targetAmount = Number(payload.targetAmount);
  const currentAmount = Number(payload.currentAmount || 0);
  if (!isFinite(targetAmount) || targetAmount <= 0) throw new Error('Target tabungan harus lebih besar dari 0.');
  if (!isFinite(currentAmount) || currentAmount < 0) throw new Error('Saldo awal target tidak valid.');
  getSpreadsheet_().getSheetByName(SHEETS.GOALS).appendRow([
    Utilities.getUuid(), cleanText_(payload.name), targetAmount, currentAmount,
    payload.dueDate || '', cleanText_(payload.icon || 'target'), true, new Date()
  ]);
  return getAppData_(payload.month);
}

function contributeGoal_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['id','amount']);
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Nominal setoran harus lebih besar dari 0.');
  const sh = getSpreadsheet_().getSheetByName(SHEETS.GOALS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(payload.id)) {
      sh.getRange(i + 1, 4).setValue(Number(values[i][3] || 0) + amount);
      return getAppData_(payload.month);
    }
  }
  throw new Error('Target tabungan tidak ditemukan.');
}

function deleteGoal_(id, month) {
  setupDatabase_();
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.GOALS), id, 7);
  return getAppData_(month);
}

function saveBill_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name','category','amount','account','dueDay']);
  const amount = Number(payload.amount);
  const dueDay = Math.max(1, Math.min(31, Number(payload.dueDay || 1)));
  if (!isFinite(amount) || amount <= 0) throw new Error('Nominal tagihan harus lebih besar dari 0.');
  getSpreadsheet_().getSheetByName(SHEETS.BILLS).appendRow([
    Utilities.getUuid(), cleanText_(payload.name), cleanText_(payload.category), amount,
    cleanText_(payload.account), dueDay, true, '', cleanText_(payload.notes || ''), new Date(),
    payload.reminderEnabled === false || String(payload.reminderEnabled).toLowerCase() === 'false' ? false : true,
    cleanText_(payload.reminderDaysBefore || getSetting_(getSpreadsheet_(),'ReminderDaysBefore') || '7,3,1,0,-1'),
    cleanText_(payload.reminderRecipients || '')
  ]);
  return getAppData_(payload.month);
}

function markBillPaid_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['id','month']);
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.BILLS);
  const paidTag = 'bill:' + String(payload.id) + ':' + String(payload.month);
  const existingPaid = readObjects_(ss.getSheetByName(SHEETS.TRANSACTIONS)).some(t => String(t.Tags || '').includes(paidTag));
  if (existingPaid) return getAppData_(payload.month);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(payload.id)) {
      const name = String(values[i][1] || 'Tagihan');
      const category = String(values[i][2] || 'Lain-lain');
      const amount = Number(values[i][3] || 0);
      const account = String(values[i][4] || '');
      const dueDay = Number(values[i][5] || 1);
      const date = safeMonthDay_(payload.month, dueDay);
      appendTransaction_({
        date, type:'Pengeluaran', category, description:'Pembayaran ' + name,
        account, amount, receiptUrl:'', tags:paidTag, memberId:payload.memberId || ''
      });
      sh.getRange(i + 1, 8).setValue(payload.month);
      return getAppData_(payload.month);
    }
  }
  throw new Error('Tagihan tidak ditemukan.');
}

function deleteBill_(id, month) {
  setupDatabase_();
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.BILLS), id, 7);
  return getAppData_(month);
}

function saveDebt_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name','kind','originalAmount','balance']);
  if (!['Utang','Piutang'].includes(String(payload.kind))) throw new Error('Jenis harus Utang atau Piutang.');
  const original = Number(payload.originalAmount);
  const balance = Number(payload.balance);
  if (!isFinite(original) || original < 0 || !isFinite(balance) || balance < 0) throw new Error('Nominal utang/piutang tidak valid.');
  getSpreadsheet_().getSheetByName(SHEETS.DEBTS).appendRow([
    Utilities.getUuid(), cleanText_(payload.name), payload.kind, original, balance,
    Number(payload.monthlyPayment || 0), Math.max(1, Math.min(31, Number(payload.dueDay || 1))),
    cleanText_(payload.account || ''), true, cleanText_(payload.notes || ''), new Date()
  ]);
  return getAppData_(payload.month);
}

function payDebt_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['id','amount','date']);
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Nominal pembayaran harus lebih besar dari 0.');
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.DEBTS);
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(payload.id)) {
      const kind = String(values[i][2] || 'Utang');
      const current = Number(values[i][4] || 0);
      const applied = Math.min(amount, current);
      sh.getRange(i + 1, 5).setValue(Math.max(0, current - applied));
      const account = cleanText_(payload.account || values[i][7] || '');
      if (account) {
        appendTransaction_({
          date: payload.date,
          type: kind === 'Utang' ? 'Pengeluaran' : 'Pemasukan',
          category: kind === 'Utang' ? 'Cicilan' : 'Piutang Masuk',
          description: (kind === 'Utang' ? 'Pembayaran ' : 'Penerimaan ') + String(values[i][1] || ''),
          account, amount: applied, receiptUrl:'', tags:'utang', memberId:payload.memberId || ''
        });
      }
      return getAppData_(String(payload.date).slice(0,7));
    }
  }
  throw new Error('Data utang/piutang tidak ditemukan.');
}

function deleteDebt_(id, month) {
  setupDatabase_();
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.DEBTS), id, 9);
  return getAppData_(month);
}

function saveAsset_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name','category','value']);
  const value = Number(payload.value);
  if (!isFinite(value) || value < 0) throw new Error('Nilai aset tidak valid.');
  getSpreadsheet_().getSheetByName(SHEETS.ASSETS).appendRow([
    Utilities.getUuid(), cleanText_(payload.name), cleanText_(payload.category), value,
    cleanText_(payload.notes || ''), true, new Date()
  ]);
  return getAppData_(payload.month);
}

function deleteAsset_(id, month) {
  setupDatabase_();
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.ASSETS), id, 6);
  return getAppData_(month);
}

function saveRecurring_(payload) {
  setupDatabase_();
  validateRequired_(payload, ['name','type','amount','account','dayOfMonth']);
  const type = String(payload.type);
  if (!['Pemasukan','Pengeluaran','Transfer'].includes(type)) throw new Error('Jenis transaksi berulang tidak valid.');
  if (type !== 'Transfer') validateRequired_(payload, ['category']);
  if (type === 'Transfer') validateRequired_(payload, ['toAccount']);
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount <= 0) throw new Error('Nominal harus lebih besar dari 0.');
  getSpreadsheet_().getSheetByName(SHEETS.RECURRING).appendRow([
    Utilities.getUuid(), cleanText_(payload.name), type,
    type === 'Transfer' ? 'Transfer' : cleanText_(payload.category), amount,
    cleanText_(payload.account), type === 'Transfer' ? cleanText_(payload.toAccount) : '',
    Math.max(1, Math.min(31, Number(payload.dayOfMonth || 1))), true, '', cleanText_(payload.notes || ''), new Date()
  ]);
  return getAppData_(payload.month);
}

function runRecurring_(month, memberId) {
  setupDatabase_();
  const ss = getSpreadsheet_();
  const timezone = getSetting_(ss, 'Timezone') || TZ_FALLBACK;
  const targetMonth = month || Utilities.formatDate(new Date(), timezone, 'yyyy-MM');
  const sh = ss.getSheetByName(SHEETS.RECURRING);
  const values = sh.getDataRange().getValues();
  const existingTx = readObjects_(ss.getSheetByName(SHEETS.TRANSACTIONS));
  let created = 0;
  for (let i = 1; i < values.length; i++) {
    const active = String(values[i][8]).toLowerCase() !== 'false';
    const recurringId = String(values[i][0] || '');
    const lastGenerated = String(values[i][9] || '');
    const tag = 'recurring:' + recurringId + ':' + targetMonth;
    const alreadyTagged = existingTx.some(t => String(t.Tags || '').includes(tag));
    if (!active || lastGenerated === targetMonth || alreadyTagged) continue;
    const type = String(values[i][2] || 'Pengeluaran');
    appendTransaction_({
      date: safeMonthDay_(targetMonth, Number(values[i][7] || 1)),
      type,
      category: type === 'Transfer' ? 'Transfer' : String(values[i][3] || ''),
      description: String(values[i][1] || 'Transaksi berulang'),
      account: String(values[i][5] || ''),
      toAccount: type === 'Transfer' ? String(values[i][6] || '') : '',
      amount: Number(values[i][4] || 0),
      receiptUrl:'', tags:tag, memberId:memberId || ''
    });
    sh.getRange(i + 1, 10).setValue(targetMonth);
    created++;
  }
  return { created, data:getAppData_(targetMonth) };
}

function deleteRecurring_(id, month) {
  setupDatabase_();
  softDeleteById_(getSpreadsheet_().getSheetByName(SHEETS.RECURRING), id, 9);
  return getAppData_(month);
}

function updateSettings_(payload) {
  setupDatabase_();
  requireAdmin_('');
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.SETTINGS);
  ['AppName','HouseholdName','Timezone','ReceiptFolderName','ReminderEnabled','ReminderDaysBefore','ReminderHour'].forEach(key => {
    if (payload[key] !== undefined) upsertSetting_(sh, key, cleanText_(payload[key]));
  });
  return getAppData_(payload.month);
}

function appendTransaction_(payload) {
  validateRequired_(payload, ['date','type','account','amount']);
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEETS.TRANSACTIONS);
  const actor = REQUEST_ACTOR || resolveMember_(ss, payload.memberId || '');
  const email = actor && actor.email ? actor.email : (Session.getActiveUser().getEmail() || '');
  const memberName = actor ? actor.name : '';
  const memberId = actor ? actor.id : '';
  const type = String(payload.type);
  sh.appendRow([
    Utilities.getUuid(), payload.date, type,
    type === 'Transfer' ? 'Transfer' : cleanText_(payload.category || 'Lain-lain'),
    cleanText_(payload.description || ''), cleanText_(payload.account), Number(payload.amount),
    memberName || email, new Date(), type === 'Transfer' ? cleanText_(payload.toAccount || '') : '',
    safeUrl_(payload.receiptUrl || ''), cleanText_(payload.tags || ''), memberId, memberName
  ]);
}

function getOrCreateReceiptFolder_() {
  const ss = getSpreadsheet_();
  const folderName = getSetting_(ss, 'ReceiptFolderName') || 'Family NestFlow Receipts';
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty('RECEIPT_FOLDER_ID');
  if (existingId) {
    try { return DriveApp.getFolderById(existingId); } catch (e) {}
  }
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  props.setProperty('RECEIPT_FOLDER_ID', folder.getId());
  return folder;
}

function shareReceiptWithFamily_(file, ss) {
  const owner = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const emails = getSafeUsers_(ss)
    .map(u => String(u.email || '').trim())
    .filter(e => e && e.toLowerCase() !== owner);
  [...new Set(emails)].forEach(email => {
    try { file.addViewer(email); } catch (e) { console.log('Tidak dapat membagikan bukti ke ' + email + ': ' + String(e.message || e)); }
  });
}

function billStatus_(dueDay, selectedMonth, timezone) {
  const currentMonth = Utilities.formatDate(new Date(), timezone || TZ_FALLBACK, 'yyyy-MM');
  if (selectedMonth < currentMonth) return 'overdue';
  if (selectedMonth > currentMonth) return 'upcoming';
  const today = Number(Utilities.formatDate(new Date(), timezone || TZ_FALLBACK, 'd'));
  if (today > dueDay) return 'overdue';
  if (dueDay - today <= 3) return 'due-soon';
  return 'upcoming';
}

function safeMonthDay_(month, day) {
  const parts = String(month).split('-').map(Number);
  const y = parts[0], m = parts[1];
  const maxDay = new Date(y, m, 0).getDate();
  return String(month) + '-' + String(Math.max(1, Math.min(maxDay, Number(day || 1)))).padStart(2,'0');
}


function getSafeUsers_(ss) {
  return readObjects_(ss.getSheetByName(SHEETS.USERS))
    .filter(u => String(u.Active).toLowerCase() !== 'false')
    .map(u => ({
      id:String(u.ID || ''), name:String(u.Name || ''), email:String(u.Email || ''), role:String(u.Role || 'Member'),
      reminderEmail:String(u.ReminderEmail || u.Email || ''), hasPin:false
    }));
}

function resolveMember_(ss,memberId){if(REQUEST_ACTOR)return REQUEST_ACTOR;const users=getSafeUsers_(ss);if(!users.length)return null;try{const email=currentGoogleEmail_();return users.find(u=>String(u.email).toLowerCase()===email)||null}catch(e){return users.find(u=>u.role==='Admin')||users[0]}}

function verifyMember_(payload) {
  setupDatabase_();
  validateRequired_(payload,['id']);
  const ss = getSpreadsheet_();
  const rows = readObjects_(ss.getSheetByName(SHEETS.USERS));
  const user = rows.find(u => String(u.ID) === String(payload.id) && String(u.Active).toLowerCase() !== 'false');
  if (!user) throw new Error('Profil anggota tidak ditemukan.');
  const stored = String(user.PinHash || '');
  if (stored) {
    const pin = String(payload.pin || '');
    if (!/^\d{4,6}$/.test(pin)) throw new Error('Masukkan PIN profil 4–6 digit.');
    if (stored !== hashPin_(String(user.ID),pin)) throw new Error('PIN profil salah.');
  }
  return {ok:true,user:{id:String(user.ID),name:String(user.Name),email:String(user.Email||''),role:String(user.Role||'Member'),reminderEmail:String(user.ReminderEmail||user.Email||'')}};
}

function saveMember_(payload){setupDatabase_();const admin=requireAdmin_();validateRequired_(payload,['name','role','email']);if(!['Admin','Member'].includes(String(payload.role)))throw new Error('Role pengguna tidak valid.');const ss=getSpreadsheet_(),sh=ss.getSheetByName(SHEETS.USERS),values=sh.getDataRange().getValues();const email=cleanText_(payload.email||'').trim().toLowerCase(),reminderEmail=cleanText_(payload.reminderEmail||email).trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email))throw new Error('Email Google wajib valid.');if(reminderEmail&&!/^\S+@\S+\.\S+$/.test(reminderEmail))throw new Error('Email reminder tidak valid.');for(let i=1;i<values.length;i++){const same=String(values[i][2]||'').trim().toLowerCase()===email,other=!payload.id||String(values[i][0])!==String(payload.id),active=String(values[i][5]).toLowerCase()!=='false';if(same&&other&&active)throw new Error('Akun Google tersebut sudah terdaftar.')}const id=payload.id?String(payload.id):Utilities.getUuid(),isNew=!payload.id;if(payload.id){let found=false;for(let i=1;i<values.length;i++)if(String(values[i][0])===id){found=true;const currentRole=String(values[i][3]||'Member');if(currentRole==='Admin'&&String(payload.role)!=='Admin'){const admins=values.slice(1).filter(r=>String(r[5]).toLowerCase()!=='false'&&String(r[3])==='Admin');if(admins.length<=1)throw new Error('Minimal harus ada satu Admin aktif.')}sh.getRange(i+1,2).setValue(cleanText_(payload.name));sh.getRange(i+1,3).setValue(email);sh.getRange(i+1,4).setValue(payload.role);sh.getRange(i+1,5).setValue('');sh.getRange(i+1,6).setValue(true);sh.getRange(i+1,7).setValue(reminderEmail);break}if(!found)throw new Error('Profil anggota tidak ditemukan.')}else sh.appendRow([id,cleanText_(payload.name),email,payload.role,'',true,reminderEmail,new Date()]);shareCoreResourcesWithUser_(email);if(isNew)sendGoogleAccessInvite_(email,cleanText_(payload.name));return getAppData_(payload.month,admin.id);}

function deleteMember_(id,actorId,month){setupDatabase_();const admin=requireAdmin_();if(String(id)===String(admin.id))throw new Error('Akun Google aktif tidak dapat dinonaktifkan sendiri.');const ss=getSpreadsheet_(),sh=ss.getSheetByName(SHEETS.USERS),rows=readObjects_(sh),target=rows.find(u=>String(u.ID)===String(id));if(!target)throw new Error('Profil anggota tidak ditemukan.');if(String(target.Role)==='Admin'){const admins=rows.filter(u=>String(u.Active).toLowerCase()!=='false'&&String(u.Role)==='Admin');if(admins.length<=1)throw new Error('Minimal harus ada satu Admin aktif.')}softDeleteById_(sh,id,6);revokeCoreResourceAccess_(String(target.Email||''));return getAppData_(month,admin.id);}

function requireAdmin_(memberId){const actor=REQUEST_ACTOR||requireGoogleUser_();if(!actor||actor.role!=='Admin')throw new Error('ADMIN_REQUIRED|Fitur ini hanya dapat digunakan oleh Admin keluarga.');return actor;}

function shareCoreResourcesWithUser_(email){const r={sheet:false,folder:false};if(!email)return r;try{getSpreadsheet_().addEditor(email);r.sheet=true}catch(e){console.log('Share Sheet gagal: '+e.message)}try{getOrCreateReceiptFolder_().addEditor(email);r.folder=true}catch(e){console.log('Share folder gagal: '+e.message)}return r;}
function revokeCoreResourceAccess_(email){if(!email)return;const owner=String(PropertiesService.getScriptProperties().getProperty('FNF_OWNER_EMAIL')||'').toLowerCase();if(String(email).toLowerCase()===owner)return;try{getSpreadsheet_().removeEditor(email)}catch(e){}try{getOrCreateReceiptFolder_().removeEditor(email)}catch(e){}}
function sendGoogleAccessInvite_(email,name){let url='';try{url=ScriptApp.getService().getUrl()||''}catch(e){}if(!email||!url)return;const ss=getSpreadsheet_(),app=getSetting_(ss,'AppName')||'Family NestFlow',house=getSetting_(ss,'HouseholdName')||'Keluarga Kita';try{MailApp.sendEmail({to:email,subject:'['+app+'] Undangan akses keluarga',htmlBody:'<p>Halo '+cleanHtml_(name)+',</p><p>Akun Google Anda telah ditambahkan ke <b>'+cleanHtml_(app)+'</b> untuk '+cleanHtml_(house)+'.</p><p><a href="'+url+'">Buka Family NestFlow</a></p><p>Gunakan akun Google <b>'+cleanHtml_(email)+'</b>.</p>'})}catch(e){}}
function cleanHtml_(v){return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

function getPinSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('FNF_PIN_SECRET');
  if (secret) return secret;

  // Migrasi aman dari versi lama: gunakan secret lama bila ada agar PIN tetap valid,
  // lalu pindahkan ke Script Properties supaya tidak tersimpan terbuka di Google Sheet.
  const ss = getSpreadsheet_();
  const legacy = String(getSetting_(ss,'HouseholdSecret') || '');
  secret = legacy || (Utilities.getUuid() + Utilities.getUuid());
  props.setProperty('FNF_PIN_SECRET', secret);
  if (legacy) upsertSetting_(ss.getSheetByName(SHEETS.SETTINGS),'HouseholdSecret','');
  return secret;
}

function hashPin_(id,pin) {
  const secret = getPinSecret_();
  const raw = id + '|' + pin + '|' + secret;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0'+((b<0?b+256:b).toString(16))).slice(-2)).join('');
}

function installDailyBillReminder_(actorId) {
  setupDatabase_();
  requireAdmin_(actorId || '');
  removeReminderTriggers_();
  const ss = getSpreadsheet_();
  const hour = Math.max(0,Math.min(23,Number(getSetting_(ss,'ReminderHour') || 8)));
  const timezone = getSetting_(ss,'Timezone') || TZ_FALLBACK;
  ScriptApp.newTrigger('sendBillReminders_').timeBased().everyDays(1).atHour(hour).inTimezone(timezone).create();
  upsertSetting_(ss.getSheetByName(SHEETS.SETTINGS),'ReminderEnabled','true');
  return getReminderStatus_();
}

function removeDailyBillReminder_(actorId) {
  setupDatabase_();
  requireAdmin_(actorId || '');
  removeReminderTriggers_();
  upsertSetting_(getSpreadsheet_().getSheetByName(SHEETS.SETTINGS),'ReminderEnabled','false');
  return getReminderStatus_();
}

function removeReminderTriggers_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendBillReminders_') ScriptApp.deleteTrigger(t);
  });
}

function getReminderStatus_() {
  const installed = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sendBillReminders_');
  let enabled = false, hour = 8;
  try {
    const ss = getSpreadsheet_();
    enabled = String(getSetting_(ss,'ReminderEnabled') || 'true').toLowerCase() !== 'false';
    hour = Number(getSetting_(ss,'ReminderHour') || 8);
  } catch(e) {}
  return {installed, enabled, hour};
}

function sendBillReminders_() {
  setupDatabase_();
  const ss = getSpreadsheet_();
  if (String(getSetting_(ss,'ReminderEnabled') || 'true').toLowerCase() === 'false') return {sent:0,skipped:'disabled'};
  const timezone = getSetting_(ss,'Timezone') || TZ_FALLBACK;
  const today = new Date();
  const currentMonth = Utilities.formatDate(today,timezone,'yyyy-MM');
  const todayKey = Utilities.formatDate(today,timezone,'yyyy-MM-dd');
  const tx = readObjects_(ss.getSheetByName(SHEETS.TRANSACTIONS));
  const users = getSafeUsers_(ss);
  const logSheet = ss.getSheetByName(SHEETS.REMINDER_LOG);
  const logs = readObjects_(logSheet);
  const bills = readObjects_(ss.getSheetByName(SHEETS.BILLS)).filter(b => String(b.Active).toLowerCase() !== 'false');
  let sent = 0;
  bills.forEach(b => {
    const id = String(b.ID || '');
    const tag = 'bill:' + id + ':' + currentMonth;
    const paid = String(b.LastPaidMonth || '') === currentMonth || tx.some(t => String(t.Tags || '').includes(tag));
    const reminderEnabled = String(b.ReminderEnabled || 'true').toLowerCase() !== 'false';
    if (paid || !reminderEnabled) return;
    const dueDate = safeMonthDay_(currentMonth,Number(b.DueDay || 1));
    const diff = dayDiff_(todayKey,dueDate);
    const configured = parseReminderDays_(String(b.ReminderDaysBefore || getSetting_(ss,'ReminderDaysBefore') || '7,3,1,0,-1'));
    if (!configured.includes(diff)) return;
    const custom = String(b.ReminderRecipients || '').split(',').map(x=>x.trim()).filter(Boolean);
    const recipients = custom.length ? custom : users.map(u=>u.reminderEmail||u.email).filter(Boolean);
    [...new Set(recipients)].forEach(recipient => {
      const key = id + '|' + dueDate + '|' + recipient.toLowerCase() + '|' + diff;
      if (logs.some(l => String(l.ReminderKey || '') === key && String(l.Status || '') === 'SENT')) return;
      const statusText = diff > 0 ? ('jatuh tempo ' + diff + ' hari lagi') : diff === 0 ? 'jatuh tempo hari ini' : ('terlambat ' + Math.abs(diff) + ' hari');
      const appName = getSetting_(ss,'AppName') || 'Family NestFlow';
      const household = getSetting_(ss,'HouseholdName') || 'Keluarga Kita';
      const subject = '[' + appName + '] ' + String(b.Name || 'Tagihan') + ' ' + statusText;
      const body = appName + '\n' + household + '\n\nTagihan: ' + String(b.Name || '') + '\nNominal: ' + formatRupiah_(Number(b.Amount || 0)) + '\nJatuh tempo: ' + dueDate + '\nRekening: ' + String(b.Account || '-') + '\nStatus: ' + statusText + '\n\nBuka Family NestFlow untuk menandai pembayaran.';
      try {
        MailApp.sendEmail(recipient,subject,body);
        logSheet.appendRow([Utilities.getUuid(),id,String(b.Name||''),dueDate,recipient,new Date(),key,'SENT']);
        sent++;
      } catch(e) {
        logSheet.appendRow([Utilities.getUuid(),id,String(b.Name||''),dueDate,recipient,new Date(),key,'ERROR: '+String(e.message||e)]);
      }
    });
  });
  return {sent,date:todayKey};
}

function sendTestReminder_(actorId) {
  setupDatabase_();
  const ss = getSpreadsheet_();
  const actor = requireAdmin_(actorId || '');
  const recipient = actor.reminderEmail || actor.email;
  if (!recipient) throw new Error('Admin aktif belum memiliki email reminder.');
  const appName = getSetting_(ss,'AppName') || 'Family NestFlow';
  MailApp.sendEmail(recipient,'['+appName+'] Tes reminder tagihan','Reminder Family NestFlow berhasil terhubung. Email ini adalah tes dari Google Apps Script.');
  return {ok:true,recipient};
}

function parseReminderDays_(value) {
  return String(value || '').split(',').map(x=>Number(String(x).trim())).filter(x=>isFinite(x) && x>=-31 && x<=31);
}

function dayDiff_(fromDate,toDate) {
  const a = new Date(fromDate + 'T12:00:00Z');
  const b = new Date(toDate + 'T12:00:00Z');
  return Math.round((b-a)/86400000);
}

function formatRupiah_(value) {
  return 'Rp' + Math.round(Number(value || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  } else {
    const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(),1)).getValues()[0].map(String);
    headers.forEach(header => {
      if (!current.includes(header)) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(header);
        current.push(header);
      }
    });
  }
  return sh;
}

function seedCategories_(ss) {
  const sh = ss.getSheetByName(SHEETS.CATEGORIES);
  if (sh.getLastRow() > 1) return;
  const rows = [
    ['Pemasukan','Gaji'],['Pemasukan','Bonus'],['Pemasukan','Usaha Sampingan'],['Pemasukan','Investasi'],['Pemasukan','Piutang Masuk'],['Pemasukan','Lain-lain'],
    ['Pengeluaran','Belanja Harian'],['Pengeluaran','Makanan'],['Pengeluaran','Listrik & Air'],['Pengeluaran','Internet & Pulsa'],
    ['Pengeluaran','Pendidikan'],['Pengeluaran','Transportasi'],['Pengeluaran','Kesehatan'],['Pengeluaran','Cicilan'],
    ['Pengeluaran','Hiburan'],['Pengeluaran','Sosial & Donasi'],['Pengeluaran','Perawatan Rumah'],['Pengeluaran','Asuransi'],['Pengeluaran','Lain-lain']
  ].map(r => [Utilities.getUuid(), r[0], r[1], true]);
  sh.getRange(2,1,rows.length,4).setValues(rows);
}

function seedAccounts_(ss) {
  const sh = ss.getSheetByName(SHEETS.ACCOUNTS);
  if (sh.getLastRow() > 1) return;
  const rows = [
    [Utilities.getUuid(),'Cash',0,true,'Cash'],
    [Utilities.getUuid(),'Rekening Utama',0,true,'Bank'],
    [Utilities.getUuid(),'E-Wallet',0,true,'E-Wallet']
  ];
  sh.getRange(2,1,rows.length,5).setValues(rows);
}

function seedSettings_(ss) {
  const sh = ss.getSheetByName(SHEETS.SETTINGS);
  const defaults = {
    AppName:'Family NestFlow', HouseholdName:'Keluarga Kita', Currency:'IDR', Timezone:TZ_FALLBACK,
    ReceiptFolderName:'Family NestFlow Receipts', ReminderEnabled:'true', ReminderDaysBefore:'7,3,1,0,-1', ReminderHour:'8'
  };
  if (sh.getLastRow() <= 1) {
    const rows = Object.entries(defaults);
    sh.getRange(2,1,rows.length,2).setValues(rows);
    return;
  }
  Object.keys(defaults).forEach(k => {
    const current = getSetting_(ss,k);
    if (!current) upsertSetting_(sh,k,defaults[k]);
  });
  const appName = getSetting_(ss,'AppName');
  if (!appName || appName === 'Family Finance OS') upsertSetting_(sh,'AppName','Family NestFlow');
  const receiptName = getSetting_(ss,'ReceiptFolderName');
  if (!receiptName || receiptName === 'Family Finance Receipts') upsertSetting_(sh,'ReceiptFolderName','Family NestFlow Receipts');
}

function seedUsers_(ss) {
  const sh = ss.getSheetByName(SHEETS.USERS);
  if (sh.getLastRow() > 1) return;
  const email = Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || '';
  sh.appendRow([Utilities.getUuid(),'Admin Keluarga',email,'Admin','',true,email,new Date()]);
}

function formatSheets_(ss) {
  Object.values(SHEETS).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh) return;
    const lastCol = Math.max(sh.getLastColumn(), 1);
    sh.getRange(1,1,1,lastCol).setFontWeight('bold').setBackground('#0B1220').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    try { sh.autoResizeColumns(1, lastCol); } catch (e) {}
  });
}

function readObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(r => r.some(v => v !== '')).map(row => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = row[i]);
    return obj;
  });
}

function normalizeTransaction_(t, timezone) {
  return {
    id: String(t.ID || ''), date: normalizeDate_(t.Date, timezone), type: String(t.Type || ''),
    category: String(t.Category || ''), description: String(t.Description || ''), account: String(t.Account || ''),
    toAccount: String(t.ToAccount || ''), amount: Number(t.Amount || 0), createdBy: String(t.CreatedBy || ''),
    createdAt: normalizeDateTime_(t.CreatedAt, timezone), receiptUrl: String(t.ReceiptUrl || ''), tags: String(t.Tags || ''),
    memberId: String(t.MemberId || ''), memberName: String(t.MemberName || t.CreatedBy || '')
  };
}

function normalizeDate_(value, timezone) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, timezone || TZ_FALLBACK, 'yyyy-MM-dd');
  const str = String(value);
  return str.length >= 10 ? str.slice(0,10) : str;
}

function normalizeDateTime_(value, timezone) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, timezone || TZ_FALLBACK, 'yyyy-MM-dd HH:mm:ss');
  return String(value);
}

function computeAccountBalance_(accountName, openingBalance, transactions) {
  return transactions.reduce((balance, t) => {
    if (t.type === 'Pemasukan' && t.account === accountName) return balance + t.amount;
    if (t.type === 'Pengeluaran' && t.account === accountName) return balance - t.amount;
    if (t.type === 'Transfer') {
      if (t.account === accountName) balance -= t.amount;
      if (t.toAccount === accountName) balance += t.amount;
    }
    return balance;
  }, Number(openingBalance || 0));
}

function buildMonthlyTrends_(transactions, selectedMonth, count) {
  const parts = selectedMonth.split('-').map(Number);
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(parts[0], parts[1] - 1 - i, 1);
    const key = Utilities.formatDate(d, TZ_FALLBACK, 'yyyy-MM');
    const label = Utilities.formatDate(d, TZ_FALLBACK, 'MMM yy');
    const monthTx = transactions.filter(t => (t.date || '').slice(0,7) === key);
    result.push({
      month:key, label,
      income:sum_(monthTx.filter(t => t.type === 'Pemasukan').map(t => t.amount)),
      expense:sum_(monthTx.filter(t => t.type === 'Pengeluaran').map(t => t.amount))
    });
  }
  return result;
}

function getSetting_(ss, key) {
  const sh = ss.getSheetByName(SHEETS.SETTINGS);
  if (!sh) return '';
  const rows = readObjects_(sh);
  const found = rows.find(r => String(r.Key || '') === String(key));
  return found ? String(found.Value || '') : '';
}

function upsertSetting_(sheet, key, value) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(key)) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function softDeleteById_(sheet, id, activeColumnIndex1Based) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]) === String(id)) {
      sheet.getRange(i + 1, activeColumnIndex1Based).setValue(false);
      return true;
    }
  }
  return false;
}

function deleteRowById_(sheet, id, soft) {
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}

function validateRequired_(obj, fields) {
  fields.forEach(f => {
    if (obj == null || obj[f] === undefined || obj[f] === null || String(obj[f]).trim() === '') {
      throw new Error('Field ' + f + ' wajib diisi.');
    }
  });
}

function cleanText_(value) {
  let s = String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 180);
  // Cegah formula injection ketika teks pengguna ditulis ke Google Sheets.
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}


function safeUrl_(value) {
  const s = String(value || '').trim().slice(0, 500);
  return /^https:\/\//i.test(s) ? s : '';
}

function cleanFilename_(value) {
  return String(value || 'receipt').replace(/[\\/:*?"<>|]+/g,'-').slice(0,120);
}

function sum_(values) {
  return values.reduce((a,b) => a + Number(b || 0), 0);
}
