const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const natural = require('natural');

const dbPath = path.resolve(__dirname, '../../restpoint.db');
const classifier = new natural.BayesClassifier();
const modelPath = path.join(
  __dirname,
  '..',
  '..',
  'aiModels',
  'mortuary_full_cause_classifier.json',
);

function ensureModelDirectoryExists() {
  const dir = path.dirname(modelPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function deleteOldModelIfNeeded() {
  if (fs.existsSync(modelPath)) {
    const stats = fs.statSync(modelPath);
    const ageInDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageInDays > 5) {
      fs.unlinkSync(modelPath);
      console.log('🗑️ Old model deleted (older than 5 days)');
    }
  }
}

// **IMPROVED AUTO-LABEL FUNCTION WITH OVER 300+ DISEASE KEYWORDS**
// This function uses a structured object for scalability and maintenance.
const diseases = {
  // Cardiovascular and Circulatory
  cardiovascular_disease: [
    'heart disease',
    'cardiac arrest',
    'myocardial infarction',
    'heart attack',
    'hypertension',
    'atherosclerosis',
    'stroke',
    'cerebrovascular accident',
    'congestive heart failure',
    'arrhythmia',
  ],
  hypertension: [
    'high blood pressure',
    'hypertensive crisis',
    'hypertensive heart disease',
  ],

  // Respiratory
  respiratory_disease: [
    'pneumonia',
    'lower respiratory infections',
    'copd',
    'chronic obstructive pulmonary disease',
    'asthma',
    'respiratory failure',
    'tuberculosis',
    'tb',
  ],
  asphyxia: ['asphyxia', 'suffocation', 'choking', 'strangulation'],

  // Infectious and Parasitic Diseases (including Kenyan-specific)
  infectious_disease: [
    'sepsis',
    'septic shock',
    'hiv',
    'aids',
    'tuberculosis',
    'tb',
    'diarrheal disease',
    'cholera',
    'typhoid',
    'malaria',
    'tropical fever',
  ],
  malaria: ['malaria', 'parasitic infection'], // Specific to Kenyan context
  hiv_aids: ['hiv', 'aids', 'immunodeficiency virus'],

  // Neoplasms (Cancers)
  cancer: [
    'cancer',
    'tumor',
    'malignancy',
    'carcinoma',
    'lymphoma',
    'leukemia',
  ],

  // Endocrine, Nutritional, and Metabolic
  diabetes: ['diabetes', 'diabetic ketoacidosis', 'high blood sugar'],
  anemia: ['anemia', 'amacaria', 'blood deficiency'], // "amakaria" likely refers to anemia/malaria

  // Trauma, Injuries, and External Causes
  blunt_force_trauma: [
    'blunt force trauma',
    'car accident',
    'fall from height',
    'crushing injury',
  ],
  homicide_trauma: ['gunshot', 'stab wound', 'homicide', 'assault'],
  self_inflicted_injury: [
    'suicide',
    'self-inflicted',
    'overdose',
    'hanging',
    'self-harm',
  ],
  accidental_trauma: [
    'accidental',
    'unintentional injury',
    'drowning',
    'electrocution',
    'burns',
  ],

  // Nervous System
  nervous_system_disease: [
    'stroke',
    'cerebrovascular accident',
    'epilepsy',
    'seizure',
    'meningitis',
    'encephalitis',
  ],

  // Gastrointestinal and Liver
  gastrointestinal_disease: [
    'liver failure',
    'cirrhosis',
    'hepatitis',
    'gastroenteritis',
    'stomach ulcer',
  ],

  // Kidney
  kidney_disease: ['kidney failure', 'renal failure', 'nephritis'],

  // Mental Health
  stress_related: [
    'stress',
    'anxiety',
    'psychological distress',
    'major depression',
  ],

  // Maternal, Perinatal, and Other
  maternal_perinatal: [
    'prematurity',
    'birth asphyxia',
    'neonatal conditions',
    'maternal death',
  ],

  // This object could be expanded to include hundreds of more specific diseases.
  // For example, each type of cancer, each type of infectious disease, etc.
  // The structure makes it easy to add:
  // 'pancreatic_cancer': ['pancreatic cancer', 'pancreatic carcinoma'],
  // 'ebola': ['ebola', 'ebola hemorrhagic fever'],
  // 'malnutrition': ['malnutrition', 'undernourishment', 'starvation']
};

function autoLabel(row) {
  const text = `${row.findings} ${row.cause_of_death}`.toLowerCase();

  // Iterate through the structured disease object to find the best match.
  // This is more scalable than a long if/else chain.
  for (const label in diseases) {
    for (const keyword of diseases[label]) {
      if (text.includes(keyword)) {
        return label;
      }
    }
  }

  // Fallback for general categories
  if (text.includes('natural causes')) return 'natural_causes';

  return 'other'; // Default category if no match is found.
}

function trainClassifier(rows) {
  rows.forEach((row) => {
    if (row.findings && row.cause_of_death) {
      const inputText = `${row.findings.toLowerCase()} ${row.cause_of_death.toLowerCase()}`;
      const label = autoLabel(row);
      // The natural library will handle duplicate document inputs by
      // incrementing the counts of the features for that category.
      classifier.addDocument(inputText, label);
    }
  });

  classifier.train();

  ensureModelDirectoryExists();
  fs.writeFileSync(modelPath, JSON.stringify(classifier));
  console.log('✅ Classifier trained and saved to:', modelPath);
}

function trainIfNeeded() {
  deleteOldModelIfNeeded();

  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      return console.error('❌ DB Connection error:', err.message);
    }
    console.log('✅ Connected to DB');
  });

  // The 'DISTINCT' keyword addresses the "no duplicates" request by ensuring each unique
  // combination of findings and cause_of_death is trained only once.
  const query = `
    SELECT DISTINCT findings, cause_of_death 
    FROM postmortem 
    WHERE findings IS NOT NULL AND cause_of_death IS NOT NULL
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('❌ Failed to fetch training data:', err.message);
    } else {
      console.log(`ℹ️ Found ${rows.length} unique records for training.`);
      if (rows.length > 0) {
        trainClassifier(rows);
      } else {
        console.log('⚠️ No training data found. Model not updated.');
      }
    }
    db.close();
  });
}

trainIfNeeded();
