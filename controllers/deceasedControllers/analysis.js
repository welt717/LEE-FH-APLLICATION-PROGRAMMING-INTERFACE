const asyncHandler = require('express-async-handler');
const db = require('../../configurations/sqlConfig/db');
const path = require('path');
const fs = require('fs');
const natural = require('natural');

// === DB Helpers ===
const dbAllAsync = async (sql, params = []) => {
  try {
    const [rows] = await db.query(sql, params);
    return rows;
  } catch (err) {
    throw err;
  }
};

const dbGetAsync = async (sql, params = []) => {
  try {
    const [rows] = await db.query(sql, params);
    return rows[0]; // Return the first row
  } catch (err) {
    throw err;
  }
};

const allDeceasedFromDb = () =>
  dbAllAsync(`SELECT * FROM deceased ORDER BY date_of_death DESC`);
const getNextOfKinByDeceasedId = (deceasedId) =>
  dbAllAsync(`SELECT * FROM next_of_kin WHERE deceased_id = ?`, [deceasedId]);
const getPostmortemByDeceasedId = (deceasedId) =>
  dbGetAsync(`SELECT * FROM postmortem WHERE deceased_id = ?`, [deceasedId]);

// === NLP Setup ===
const CLASSIFIER_MODEL_PATH = path.resolve(
  'D:/RestPointSoftware/backendApi/aiModels/mortuary_full_cause_classifier.json',
);
let causeOfDeathClassifier;

const { WordTokenizer, PorterStemmer } = natural;
const tokenizer = new WordTokenizer();
const stopWords = new Set([
  'a',
  'an',
  'the',
  'is',
  'are',
  'and',
  'or',
  'of',
  'in',
  'on',
  'with',
  'due',
  'to',
  'from',
  'for',
  'was',
  'were',
  'had',
  'been',
  'patient',
  'deceased',
  'report',
  'evidence',
  'found',
  'with',
  'showing',
  'consistent',
  'severe',
  'multiple',
  'internal',
]);

const preprocessText = (text) => {
  if (!text || typeof text !== 'string') return '';
  let processed = text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s{2,}/g, ' ');
  const tokens = tokenizer.tokenize(processed);
  const filtered = tokens.filter((word) => !stopWords.has(word));
  const stemmed = filtered.map(PorterStemmer.stem);
  return stemmed.join(' ');
};

const loadClassifierModel = () => {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(CLASSIFIER_MODEL_PATH)) {
      natural.BayesClassifier.load(
        CLASSIFIER_MODEL_PATH,
        null,
        (err, loaded) => {
          if (err) reject(err);
          else {
            causeOfDeathClassifier = loaded;
            console.log('✅ Cause of Death Classifier model loaded.');
            resolve(loaded);
          }
        },
      );
    } else {
      reject(new Error('❌ Classifier model not found.'));
    }
  });
};

loadClassifierModel().catch((err) => {
  console.error('Failed to load classifier:', err.message);
});

const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

// === Main Classification Controller ===
const deathCauseClassifications = asyncHandler(async (req, res) => {
  try {
    const deceasedRecords = await allDeceasedFromDb();

    const deathsByYear = {},
      deathsByMonth = {},
      deathsByWeek = {},
      deathsByCauseOfYear = {};

    for (let record of deceasedRecords) {
      const [kin, postmortem] = await Promise.all([
        getNextOfKinByDeceasedId(record.deceased_id),
        getPostmortemByDeceasedId(record.deceased_id),
      ]);
      record.next_of_kin = kin;
      record.postmortem = postmortem;

      // --- Classification ---
      if (
        postmortem &&
        causeOfDeathClassifier &&
        (postmortem.summary || postmortem.findings)
      ) {
        try {
          let findingsText = '';

          if (postmortem.findings) {
            if (typeof postmortem.findings === 'string') {
              try {
                if (postmortem.findings.trim().startsWith('{')) {
                  const parsed = JSON.parse(postmortem.findings);
                  findingsText = Object.values(parsed)
                    .filter(Boolean)
                    .join(' ');
                } else {
                  findingsText = postmortem.findings;
                }
              } catch {
                findingsText = postmortem.findings;
              }
            } else if (typeof postmortem.findings === 'object') {
              findingsText = Object.values(postmortem.findings)
                .filter(Boolean)
                .join(' ');
            }
          }

          const combinedText =
            `${postmortem.summary || ''}. ${findingsText}`.trim();
          const preprocessed = preprocessText(combinedText);
          const predicted = causeOfDeathClassifier.classify(preprocessed);

          record.postmortem.predicted_cause_of_death = predicted;

          // 🔄 Save prediction to DB
          await db.query(
            `UPDATE postmortem SET predicted_category = ? WHERE deceased_id = ?`,
            [predicted, record.deceased_id],
          );
          console.log(
            `✅ Prediction saved for ${record.deceased_id}:`,
            predicted,
          );
        } catch (err) {
          record.postmortem.predicted_cause_of_death = 'Classification Error';
        }
      } else {
        record.postmortem = {
          predicted_cause_of_death: 'N/A (No Postmortem Data or Model)',
        };
      }

      // --- Mortuary Duration ---
      if (record.date_of_death && record.postmortem?.date) {
        const d1 = new Date(record.date_of_death);
        const d2 = new Date(record.postmortem.date);
        record.mortuary_duration_days =
          !isNaN(d1) && !isNaN(d2)
            ? Math.ceil(Math.abs(d2 - d1) / (1000 * 60 * 60 * 24))
            : null;
      } else {
        record.mortuary_duration_days = null;
      }

      // --- Analytics ---
      const date = new Date(record.date_of_death);
      if (!isNaN(date)) {
        const year = date.getFullYear();
        const month = date.toLocaleString('default', { month: 'long' });
        const week = getWeekNumber(date);

        deathsByYear[year] = (deathsByYear[year] || 0) + 1;
        deathsByMonth[month] = (deathsByMonth[month] || 0) + 1;
        deathsByWeek[week] = (deathsByWeek[week] || 0) + 1;

        const cause = record.postmortem.predicted_cause_of_death;
        // class
        if (
          cause &&
          !cause.startsWith('N/A') &&
          cause !== 'Classification Error'
        ) {
          if (!deathsByCauseOfYear[year]) deathsByCauseOfYear[year] = {};
          deathsByCauseOfYear[year][cause] =
            (deathsByCauseOfYear[year][cause] || 0) + 1;
        }
      }
    }

    // === Grouped Structure ===
    const grouped = {};
    for (let record of deceasedRecords) {
      const date = new Date(record.date_of_death);
      if (isNaN(date)) continue;
      const year = date.getFullYear();
      const month = date.toLocaleString('default', { month: 'long' });
      const week = getWeekNumber(date);

      grouped[year] ??= {};
      grouped[year][month] ??= {};
      grouped[year][month][week] ??= [];
      grouped[year][month][week].push(record);
    }

    res.status(200).json({
      message: '✅ Records classified and analyzed successfully.',
      count: deceasedRecords.length,
      data: grouped,
      analytics: {
        deathsByYear,
        deathsByMonth,
        deathsByWeek,
        deathsByCauseOfYear,
      },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res
      .status(500)
      .json({ message: 'Internal Server Error', error: error.message });
  }
});

module.exports = { deathCauseClassifications };
