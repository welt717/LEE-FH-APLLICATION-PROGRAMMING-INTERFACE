//time  generation helper
const { DateTime } = require('luxon');

function getKenyaTimeISO() {
  // Try with Luxon
  try {
    const luxonTime = DateTime.now()
      .setZone('Africa/Nairobi')
      .toFormat('yyyy-LL-dd HH:mm:ss');

    if (luxonTime) return luxonTime;
  } catch (err) {
    console.error('⚠️ Luxon failed in getKenyaTimeISO:', err.message);
  }

  // Try Native Intl with TZ
  try {
    const date = new Date();
    const fmt = new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);

    const [d, m, y] = fmt.split(',')[0].split('/');
    const [hh, mm, ss] = fmt.split(', ')[1].split(':');

    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
  } catch (err) {
    console.error('⚠️ Native TZ fallback failed:', err.message);
  }

  // 3FALLBACK →  compute Kenya time (UTC + 3)
  try {
    const now = new Date();
    const kenyaMs = now.getTime() + 3 * 60 * 60 * 1000; // +3 hours
    const kenyaDate = new Date(kenyaMs);

    const pad = (n) => (n < 10 ? '0' + n : n);

    const year = kenyaDate.getUTCFullYear();
    const month = pad(kenyaDate.getUTCMonth() + 1);
    const day = pad(kenyaDate.getUTCDate());
    const hour = pad(kenyaDate.getUTCHours());
    const minute = pad(kenyaDate.getUTCMinutes());
    const second = pad(kenyaDate.getUTCSeconds());

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  } catch (err) {
    console.error('❌ Manual Kenya fallback failed:', err.message);

    return new Date().toISOString().replace('T', ' ').split('.')[0];
  }
}

function getKenyaTimeFormatted(format = 'dd-LLL-yyyy HH:mm:ss') {
  try {
    return DateTime.now().setZone('Africa/Nairobi').toFormat(format);
  } catch {
    // Manual fallback
    const iso = getKenyaTimeISO();
    return iso.replace(/-/g, '/');
  }
}

module.exports = { getKenyaTimeISO, getKenyaTimeFormatted };
