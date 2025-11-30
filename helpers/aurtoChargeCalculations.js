const fs = require('fs');
const path = require('path');
const { safeQuery } = require('../configurations/sqlConfig/db');

// Ensure logs folder
const logDir = path.resolve(__dirname, '../logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// Kenyan DateTime
function getKenyanDateTime() {
  const dt = new Date().toLocaleString('en-US', {
    timeZone: 'Africa/Nairobi',
    hour12: false,
  });
  return new Date(dt).toISOString().slice(0, 19).replace('T', ' ');
}

// Fractional days
function getFractionalDays(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const ms = 1000 * 60 * 60 * 24;
  const diff = (e - s) / ms;
  return diff > 0 ? diff : 0;
}

// Save charge history
async function saveChargeHistory(
  deceased_id,
  type,
  amount,
  currency,
  description,
) {
  await safeQuery(
    `
    INSERT INTO charge_history (deceased_id, charge_type, amount, currency, description, created_at)
    VALUES (?, ?, ?, ?, ?, NOW())
  `,
    [deceased_id, type, amount, currency, description],
  );
}

async function updateMortuaryCharges() {
  const now = getKenyanDateTime();
  console.log(`[${now}] 🔄 Recalculating mortuary charges...`);

  try {
    const deceasedList = await safeQuery(`
      SELECT deceased_id, rate_category, created_at, date_admitted, last_charge_update,
             total_mortuary_charge, currency, usd_charge_rate, embalming_cost
      FROM deceased
      WHERE created_at IS NOT NULL AND (status IS NULL OR status != 'Complete')
    `);

    for (const d of deceasedList) {
      const {
        deceased_id,
        rate_category,
        created_at,
        date_admitted,
        last_charge_update,
        total_mortuary_charge,
        currency,
        usd_charge_rate,
        embalming_cost,
      } = d;

      const cur = currency || 'KES';
      console.log(`\n🧾 Processing: ${deceased_id}`);

      // ------------------ RATES ------------------
      const baseRate =
        cur === 'USD'
          ? parseFloat(usd_charge_rate || 130)
          : rate_category === 'premium'
            ? 5000
            : 3000;

      // ------------------ STORAGE CHARGES (TOTAL) ------------------
      // Calculate total storage charge from admission date (or creation date if missing)
      const admissionDate = date_admitted
        ? new Date(date_admitted)
        : new Date(created_at);
      const totalDays = getFractionalDays(admissionDate, new Date());
      const totalStorageCharge = totalDays * baseRate;

      // ------------------ DAILY LOGGING (INCREMENTAL) ------------------
      // Only for history/audit purposes
      const lastUpdate = last_charge_update
        ? new Date(last_charge_update)
        : new Date(created_at);
      const incrementalDays = getFractionalDays(lastUpdate, new Date());
      const incrementalCharge = incrementalDays * baseRate;

      // Log if significant charge accumulated (e.g. > 0.01 currency unit)
      if (incrementalCharge > 0.01) {
        await saveChargeHistory(
          deceased_id,
          'daily_storage',
          incrementalCharge,
          cur,
          `Daily mortuary charge (${incrementalDays.toFixed(4)} days)`,
        );
      }

      // ------------------ COFFIN CHARGES ------------------
      const coffinRows = await safeQuery(
        `
        SELECT 
          c.exact_price,
          c.currency AS coffin_currency,
          c.price_usd,
          c.exchange_rate,
          ci.quantity
        FROM coffin_issue ci
        JOIN coffins c ON ci.coffin_id = c.coffin_id
        WHERE ci.rfid = ?
      `,
        [deceased_id],
      );

      let coffinCharges = 0;

      for (const c of coffinRows) {
        const qty = parseInt(c.quantity || 1);
        let price = 0;

        if (c.coffin_currency === 'KES') {
          if (cur === 'KES') price = parseFloat(c.exact_price);
          else price = parseFloat(c.exact_price) / (c.exchange_rate || 130);
        } else if (c.coffin_currency === 'USD') {
          if (cur === 'USD') price = parseFloat(c.price_usd);
          else price = parseFloat(c.price_usd) * (c.exchange_rate || 130);
        }

        coffinCharges += price * qty;
      }

      // ------------------ EXTRA CHARGES ------------------
      const extraRows = await safeQuery(
        `
        SELECT amount
        FROM extra_charges
        WHERE deceased_id = ? AND status != 'Cancelled'
      `,
        [deceased_id],
      );

      let extraCharges = 0;
      for (const e of extraRows) {
        extraCharges += parseFloat(e.amount || 0);
      }

      // ------------------ EMBALMING ------------------
      const embalming = parseFloat(embalming_cost || 0);

      // ------------------ PAYMENTS ------------------
      const paymentsRows = await safeQuery(
        `
        SELECT amount FROM payments WHERE deceased_id = ?
      `,
        [deceased_id],
      );

      const totalPayments = paymentsRows.reduce(
        (sum, r) => sum + parseFloat(r.amount || 0),
        0,
      );

      // ------------------ FINAL TOTAL CALCULATION ------------------
      // Re-sum everything to ensure correctness
      const newTotal =
        totalStorageCharge + coffinCharges + extraCharges + embalming;
      const balance = newTotal - totalPayments;

      await safeQuery(
        `
        UPDATE deceased
        SET total_mortuary_charge = ?, last_charge_update = ?, balance = ?
        WHERE deceased_id = ?
      `,
        [newTotal, now, balance, deceased_id],
      );

      console.log(
        `  Storage (${totalDays.toFixed(2)} days): ${totalStorageCharge.toFixed(2)} ${cur}`,
      );
      console.log(`  Coffin:         ${coffinCharges.toFixed(2)} ${cur}`);
      console.log(`  Extras:         ${extraCharges.toFixed(2)} ${cur}`);
      console.log(`  Embalming:      ${embalming.toFixed(2)} ${cur}`);
      console.log(`  Payments:      -${totalPayments.toFixed(2)} ${cur}`);
      console.log(`  ➝ New Total:   ${newTotal.toFixed(2)} ${cur}`);
      console.log(`  ➝ Balance:     ${balance.toFixed(2)} ${cur}`);
    }

    console.log(`\n[${now}] ✅ ALL CHARGES UPDATED SUCCESSFULLY\n`);
  } catch (err) {
    const errorLog = `[${new Date().toISOString()}] ERROR: ${err.message}\n${err.stack}\n\n`;
    fs.appendFileSync(path.join(logDir, 'mortuaryChargeErrors.log'), errorLog);
    console.error(err);
  }
}

module.exports = { updateMortuaryCharges };
