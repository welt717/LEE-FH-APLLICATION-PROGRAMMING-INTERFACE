const fs = require('fs');
const path = require('path');
const natural = require('natural');
const asyncHandler = require('express-async-handler');
const db = require('../../configurations/sqlConfig/db'); // Your database connection

// --- AI Classifier Configuration ---
const modelPath = path.join(
  __dirname,
  '..',
  '..',
  'aiModels',
  'mortuary_full_cause_classifier.json',
);

let classifier = null;
try {
  if (fs.existsSync(modelPath)) {
    const raw = fs.readFileSync(modelPath, 'utf-8');
    classifier = natural.BayesClassifier.restore(JSON.parse(raw));
    console.log('✅ Classifier model loaded successfully.');
  } else {
    console.error('❌ AI model file not found:', modelPath);
  }
} catch (err) {
  console.error('❌ Error loading or parsing classifier model:', err.message);
}

// --- Database Query Helper with enhanced logging ---
const fetchPostmortems = () => {
  return new Promise((resolve, reject) => {
    console.log('3a. Inside fetchPostmortems. Executing database query...');
    const query = `
      SELECT deceased_id, findings, cause_of_death 
      FROM postmortem 
      WHERE findings IS NOT NULL OR cause_of_death IS NOT NULL
    `;
    db.all(query, [], (err, rows) => {
      // Check for an error FIRST.
      if (err) {
        console.error('❌ 3b. Database query failed:', err.message);
        return reject(err);
      }

      console.log(
        `✅ 3c. Database query successful. Found ${rows.length} records.`,
      );
      resolve(rows);
    });
  });
};

// --- Main Analysis Handler with the original logging intact ---
const analyzePostmortemCauses = asyncHandler(async (req, res) => {
  console.log('1. analyzePostmortemCauses function started.');

  if (!classifier) {
    console.log('2. Classifier not loaded. Sending 503 response.');
    return res.status(503).json({
      message: 'Service Unavailable: AI classifier model is not ready.',
      error: 'Model not found or failed to load. Please check server logs.',
    });
  }

  console.log('3. Classifier is ready. Fetching postmortem data...');
  const rows = await fetchPostmortems();

  console.log('4. Postmortem data fetched successfully.');
  // The rest of your code is fine from here...

  if (!rows || rows.length === 0) {
    console.log('5. No data available. Sending 200 response.');
    return res.status(200).json({
      message: 'No postmortem data available for analysis.',
      totalRecords: 0,
      summary: {},
      details: [],
    });
  }

  console.log(`6. Found ${rows.length} records. Starting classification...`);

  const causeCount = {};
  const classifiedResults = [];

  rows.forEach((row) => {
    const textToClassify =
      `${row.findings || ''} ${row.cause_of_death || ''}`.trim();

    let classifiedAs;
    if (textToClassify) {
      classifiedAs = classifier.classify(textToClassify);
    } else {
      classifiedAs = 'undetermined';
    }

    causeCount[classifiedAs] = (causeCount[classifiedAs] || 0) + 1;

    classifiedResults.push({
      ...row,
      classified_as: classifiedAs,
    });
  });

  console.log('7. Classification complete. Sending final response.');

  res.status(200).json({
    message: 'Postmortem cause analysis complete.',
    totalRecords: rows.length,
    summary: causeCount,
    details: classifiedResults,
  });
});

// classification  by  id
const classifyPostmortemById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!classifier) {
    return res.status(503).json({
      message: 'Classifier not loaded.',
    });
  }

  const query = `
    SELECT deceased_id, findings, cause_of_death
    FROM postmortem
    WHERE deceased_id = ?
  `;

  db.get(query, [id], (err, row) => {
    if (err) {
      console.error('❌ Error fetching record:', err.message);
      return res
        .status(500)
        .json({ message: 'Database error', error: err.message });
    }

    if (!row) {
      return res.status(404).json({ message: 'Postmortem record not found' });
    }

    const textToClassify =
      `${row.findings || ''} ${row.cause_of_death || ''}`.trim();
    const classifiedAs = textToClassify
      ? classifier.classify(textToClassify)
      : 'undetermined';

    res.status(200).json({
      message: 'Classification complete.',
      deceased_id: row.deceased_id,
      classified_as: classifiedAs,
      findings: row.findings,
      cause_of_death: row.cause_of_death,
    });
  });
});

module.exports = { analyzePostmortemCauses, classifyPostmortemById };
