// controllers/analyticsRevenue/analytics.js
const asyncHandler = require('express-async-handler');
const natural = require('natural');
const { safeQuery } = require('../../configurations/sqlConfig/db');

// ----------------------
// Classifier setup
// ----------------------
const classifier = new natural.BayesClassifier();
classifier.addDocument('died at home', 'home');
classifier.addDocument('passed away at home', 'home');
classifier.addDocument('passed while sleeping', 'home');
classifier.addDocument('found dead in bed', 'home');
classifier.addDocument('collapsed in his house', 'home');
classifier.addDocument('lifeless in bed', 'home');
classifier.addDocument('died while asleep', 'home');
classifier.addDocument('died in his sleep at home', 'home');
classifier.addDocument('body found in house', 'home');
classifier.addDocument('died in hospital', 'hospital');
classifier.addDocument('passed away at the clinic', 'hospital');
classifier.addDocument('received treatment in hospital', 'hospital');
classifier.addDocument('admitted and died at health centre', 'hospital');
classifier.addDocument('died while undergoing treatment', 'hospital');
classifier.addDocument('died after long illness', 'hospital');
classifier.addDocument('hospital', 'hospital');
classifier.addDocument('health center', 'hospital');
classifier.addDocument('killed in a road accident', 'accident');
classifier.addDocument('died in a car crash', 'accident');
classifier.addDocument('motorbike accident', 'accident');
classifier.addDocument('run over by a car', 'accident');
classifier.addDocument('head-on collision', 'accident');
classifier.addDocument('died on the way to hospital', 'way_to_hospital');
classifier.addDocument(
  'died while being rushed to hospital',
  'way_to_hospital',
);
classifier.addDocument('collapsed and died in ambulance', 'way_to_hospital');
classifier.addDocument(
  'passed away before reaching hospital',
  'way_to_hospital',
);
classifier.addDocument(
  'dead before arrival at health center',
  'way_to_hospital',
);
classifier.addDocument('unknown cause', 'unknown');
classifier.addDocument('location unknown', 'unknown');
classifier.addDocument('not specified', 'unknown');
classifier.addDocument('undisclosed location', 'unknown');
classifier.train();

function classifyPlace(description) {
  if (!description) return 'unknown';
  return classifier.classify(description.toLowerCase());
}

// ----------------------
// Centralized Data Fetching Logic (MariaDB version)
// ----------------------
const fetchAnalyticsData = async (dateCondition = '', yearFilter = null) => {
  const deceasedDateCondition = dateCondition ? `AND ${dateCondition}` : '';
  const postmortemDateCondition = yearFilter
    ? `AND YEAR(date) = '${yearFilter}'`
    : '';
  const dispatchDateCondition = yearFilter
    ? `AND YEAR(dispatch_date) = '${yearFilter}'`
    : '';
  const visitorsDateCondition = yearFilter
    ? `AND YEAR(check_in_time) = '${yearFilter}'`
    : '';

  const [mortuaryInfo] = await safeQuery(`SELECT name FROM mortuaries LIMIT 1`);
  const titleYear = yearFilter ? yearFilter : 'All Years';

  const [totalDeathsRow] = await safeQuery(
    `SELECT COUNT(*) AS count FROM deceased WHERE 1=1 ${deceasedDateCondition}`,
  );

  const deceasedData = await safeQuery(
    `SELECT d.deceased_id, d.full_name, d.county, d.date_of_death, d.place_of_death, d.cause_of_death, p.findings
     FROM deceased d
     LEFT JOIN postmortem p ON d.deceased_id = p.deceased_id
     WHERE 1=1 ${deceasedDateCondition}`,
  );

  const [avgStayRow] = await safeQuery(
    `SELECT AVG(DATEDIFF(dispatch_date, date_registered)) AS avg_stay
     FROM deceased
     WHERE dispatch_date IS NOT NULL ${deceasedDateCondition}`,
  );

  const avgStayByCause = await safeQuery(
    `SELECT cause_of_death, AVG(DATEDIFF(dispatch_date, date_registered)) AS avg_stay
     FROM deceased
     WHERE dispatch_date IS NOT NULL ${deceasedDateCondition}
     GROUP BY cause_of_death`,
  );

  const allPlaces = await safeQuery(
    `SELECT place_of_death FROM deceased WHERE place_of_death IS NOT NULL ${deceasedDateCondition}`,
  );
  const deathSources = {
    hospital: 0,
    home: 0,
    accident: 0,
    way_to_hospital: 0,
    other: 0,
    unknown: 0,
  };
  allPlaces.forEach((row) => {
    const category = classifyPlace(row.place_of_death);
    if (deathSources[category] !== undefined) deathSources[category]++;
    else deathSources.other++;
  });

  const [dispatchCountRow] = await safeQuery(
    `SELECT COUNT(*) AS count FROM vehicle_dispatch WHERE 1=1 ${dispatchDateCondition}`,
  );
  const [postmortemCountRow] = await safeQuery(
    `SELECT COUNT(*) AS count FROM postmortem WHERE 1=1 ${postmortemDateCondition}`,
  );
  const [visitorsCountRow] = await safeQuery(
    `SELECT COUNT(*) AS count FROM visitors WHERE 1=1 ${visitorsDateCondition}`,
  );

  const [kinStats] = await safeQuery(
    `SELECT
       SUM(CASE WHEN d.dispatch_date IS NOT NULL THEN 1 ELSE 0 END) AS claimed,
       SUM(CASE WHEN d.dispatch_date IS NULL THEN 1 ELSE 0 END) AS unclaimed
     FROM deceased d
     WHERE 1=1 ${deceasedDateCondition}`,
  );
  const unclaimedBodies = kinStats.unclaimed || 0;
  const claimedBodies = kinStats.claimed || 0;

  const [occupancyRow] = await safeQuery(
    `SELECT COUNT(*) AS current_occupancy FROM deceased WHERE dispatch_date IS NULL`,
  );

  const monthlyTrendsRaw = await safeQuery(
    `SELECT DATE_FORMAT(date_registered, '%Y-%m') AS month_year, COUNT(*) AS count
     FROM deceased
     WHERE 1=1 ${deceasedDateCondition}
     GROUP BY month_year
     ORDER BY month_year ASC`,
  );
  const monthlyTrends = monthlyTrendsRaw.map((row) => ({
    month_year: row.month_year,
    count: row.count,
  }));

  const autopsyData = await safeQuery(
    `SELECT deceased_id, date, findings FROM postmortem WHERE 1=1 ${postmortemDateCondition}`,
  );

  const deathsByCounty = await safeQuery(
    `SELECT county, COUNT(*) as count
     FROM deceased
     WHERE 1=1 ${deceasedDateCondition}
     GROUP BY county
     ORDER BY count DESC`,
  );

  return {
    mortuaryInfo,
    titleYear,
    totalDeathsRow,
    deceasedData,
    avgStayRow,
    avgStayByCause,
    deathSources,
    dispatchCountRow,
    postmortemCountRow,
    visitorsCountRow,
    unclaimedBodies,
    claimedBodies,
    occupancyRow,
    monthlyTrends,
    deathsByCounty,
    autopsyData,
  };
};

// ----------------------
// AI Report Generation (unchanged)
// ----------------------
const generateAiReportText = (data, period) => {
  const totalDeaths = data.totalDeathsRow.count;
  const unclaimed = data.unclaimedBodies;
  const avgStay = data.avgStayRow.avg_stay
    ? parseFloat(data.avgStayRow.avg_stay.toFixed(2))
    : 0;
  const topCounty =
    data.deathsByCounty.length > 0 ? data.deathsByCounty[0].county : 'N/A';
  const topCause =
    data.avgStayByCause.length > 0
      ? data.avgStayByCause[0].cause_of_death
      : 'unknown';

  const reportTemplates = {
    all: [
      `A comprehensive analysis shows ${totalDeaths} cases. The average stay is ${avgStay} days. We handled ${data.postmortemCountRow.count} postmortems and ${data.dispatchCountRow.count} dispatches. Unclaimed bodies: ${unclaimed}.`,
      `Across all years, ${totalDeaths} cases were processed. ${topCounty} was the most frequent county. Avg stay: ${avgStay} days. Unclaimed bodies: ${unclaimed}.`,
    ],
    yearly: [
      `Annual report for ${data.titleYear}: ${totalDeaths} cases. Avg stay: ${avgStay} days. Top cause: ${topCause}. Postmortems: ${data.postmortemCountRow.count}, dispatches: ${data.dispatchCountRow.count}. Unclaimed: ${unclaimed}.`,
      `In ${data.titleYear}, we recorded ${totalDeaths} cases. Avg stay: ${avgStay} days. ${topCause} was common. Unclaimed bodies: ${unclaimed}.`,
    ],
    monthly: [
      `This month: ${totalDeaths} cases. Postmortems: ${data.postmortemCountRow.count}, dispatches: ${data.dispatchCountRow.count}. Avg stay: ${avgStay} days. Current occupancy: ${data.occupancyRow.current_occupancy}.`,
      `We recorded ${totalDeaths} cases this month. ${topCause} was frequent. Avg stay: ${avgStay} days. Occupancy: ${data.occupancyRow.current_occupancy}.`,
    ],
    weekly: [
      `This week: ${totalDeaths} cases. Postmortems: ${data.postmortemCountRow.count}. Dispatches: ${data.dispatchCountRow.count}.`,
      `Weekly report: ${totalDeaths} cases. ${data.postmortemCountRow.count} postmortems, ${data.dispatchCountRow.count} dispatches.`,
    ],
  };

  const templates = reportTemplates[period] || reportTemplates.all;
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex];
};

// ----------------------
// Route Handler
// ----------------------
const getReportData = asyncHandler(async (req, res) => {
  const { period, year, month } = req.query;
  let dateCondition = '';
  let yearFilter = null;
  let reportPeriod = period || 'all';

  switch (reportPeriod.toLowerCase()) {
    case 'yearly':
      yearFilter = year;
      dateCondition = `YEAR(date_registered) = '${year}'`;
      break;
    case 'monthly':
      yearFilter = year || new Date().getFullYear();
      const currentMonth =
        month || String(new Date().getMonth() + 1).padStart(2, '0');
      dateCondition = `DATE_FORMAT(date_registered, '%Y-%m') = '${yearFilter}-${currentMonth}'`;
      break;
    case 'weekly':
      dateCondition = `DATE(date_registered) BETWEEN DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND CURDATE()`;
      break;
    case 'all':
    default:
      yearFilter = null;
      dateCondition = '';
      reportPeriod = 'all';
      break;
  }

  try {
    const data = await fetchAnalyticsData(dateCondition, yearFilter);
    const aiReport = generateAiReportText(data, reportPeriod);

    res.json({
      aiReport,
      mortuary: data.mortuaryInfo?.name || 'N/A',
      timestamp: new Date().toISOString(),
      reportPeriod,
      totalCases: data.totalDeathsRow.count,
      averageStayDays: data.avgStayRow.avg_stay
        ? parseFloat(data.avgStayRow.avg_stay.toFixed(2))
        : 0,
      avgStayByCause: data.avgStayByCause,
      deathSources: data.deathSources,
      monthlyTrends: data.monthlyTrends,
      postmortems: data.postmortemCountRow.count,
      dispatches: data.dispatchCountRow.count,
      visitors: data.visitorsCountRow.count,
      unclaimedBodies: data.unclaimedBodies,
      claimedBodies: data.claimedBodies,
      currentOccupancy: data.occupancyRow.current_occupancy,
      deathsByCounty: data.deathsByCounty,
      deceasedData: data.deceasedData,
      autopsyData: data.autopsyData,
    });
  } catch (err) {
    console.error('❌ Error in report data generation:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { getReportData };
