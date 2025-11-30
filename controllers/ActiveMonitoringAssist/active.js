function createActiveMonitoringAssist(broadcastActiveMonitoringAlert) {
  function sendFakeAlerts() {
    const fakeAlerts = [
      {
        type: 'HIGH_BILL',
        message: `💸 High mortuary charge for DECEASED123: 1500`,
        timestamp: new Date().toISOString(),
        data: { deceased_id: 'DECEASED123', total_mortuary_charge: 1500 },
      },
      {
        type: 'MISSING_DOCUMENTS',
        message: `📄 Missing documents for DECEASED456`,
        timestamp: new Date().toISOString(),
        data: { deceased_id: 'DECEASED456' },
      },
    ];

    fakeAlerts.forEach((alert) => {
      broadcastActiveMonitoringAlert(alert);
    });
  }

  function activeMonitoringAssist(intervalMs = 500000) {
    setInterval(() => {
      console.log('🔍 Sending fake active monitoring alerts...');
      sendFakeAlerts();
    }, intervalMs);

    // Run once on startup
    sendFakeAlerts();
  }

  return { activeMonitoringAssist };
}

module.exports = { createActiveMonitoringAssist };
