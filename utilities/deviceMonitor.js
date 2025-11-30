const axios = require('axios');
const { machineIdSync } = require('node-machine-id');
const db = require('../configurations/sqlConfig/db');

const deviceId = machineIdSync();

function storeDevice({ deviceId, ip, city, location }) {
  const stmt = `
    INSERT INTO devices (device_id, ip, city, location)
    VALUES (?, ?, ?, ?)
  `;
  db.run(stmt, [deviceId, ip, city, location], function (err) {
    if (err) {
      console.error('❌ Failed to insert device:', err.message);
    } else {
      console.log(`✅ Device stored with row ID ${this.lastID}`);
      // After storing the device, link it to the mortuary if one exists
      db.get(
        `SELECT mortuary_id FROM mortuaries WHERE device_id IS NULL LIMIT 1`,
        [],
        (err, mortuary) => {
          if (err) {
            console.error('❌ Failed to fetch mortuary:', err.message);
          } else if (mortuary) {
            db.run(
              `UPDATE mortuaries SET device_id = ? WHERE mortuary_id = ?`,
              [deviceId, mortuary.mortuary_id],
              (err) => {
                if (err) {
                  console.error(
                    '❌ Failed to link device to mortuary:',
                    err.message,
                  );
                } else {
                  console.log(
                    `✅ Device linked to mortuary ${mortuary.mortuary_id}`,
                  );
                }
              },
            );
          } else {
            console.warn('⚠️ No mortuary found to link to this device.');
          }
        },
      );
    }
  });
}

async function logDeviceLocationAndStore() {
  try {
    const res = await axios.get('https://ipinfo.io/json');
    const { ip, city, region, country } = res.data;
    const location = `${region}, ${country}`;

    console.log(`[LOG]: Device ${deviceId} is at ${city}, ${location}`);

    // Check if a mortuary is already registered for this device
    db.get(
      `SELECT * FROM mortuaries WHERE device_id IS NULL LIMIT 1`,
      [],
      (err, mortuary) => {
        if (err) {
          console.error('❌ DB error:', err.message);
        } else if (!mortuary) {
          console.warn('⚠️ No mortuary registered for this device yet.');
          console.warn(
            '🚫 Aborting device registration: No mortuary registered yet.',
          );
        } else {
          storeDevice({ deviceId, ip, city, location });
        }
      },
    );
  } catch (error) {
    console.error('❌ Failed to fetch location:', error.message);
  }
}

function getAllDevices(callback) {
  const query = `
    SELECT 
      devices.*,
      mortuaries.mortuary_id,
      mortuaries.name AS mortuary_name
    FROM devices
    LEFT JOIN mortuaries ON mortuaries.device_id = devices.device_id
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(
        '❌ Failed to fetch devices with mortuary details:',
        err.message,
      );
      callback([]);
    } else {
      callback(rows);
    }
  });
}

function updateDeviceStatus(deviceId, status) {
  const stmt = `UPDATE devices SET status = ? WHERE device_id = ?`;
  db.run(stmt, [status, deviceId], function (err) {
    if (err) {
      console.error('❌ Failed to update status:', err.message);
    } else {
      console.log(`✅ Status updated to '${status}' for device ${deviceId}`);
    }
  });
}

module.exports = {
  logDeviceLocationAndStore,
  deviceId,
  getAllDevices,
  updateDeviceStatus,
};
