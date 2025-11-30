// Path: D:\RestPointSoftware\BackendApi\services\classifierService.js

const natural = require('natural');
const fs = require('fs');
const path = require('path');

const CLASSIFIER_MODEL_PATH = path.join(
  __dirname,
  'aiModels',
  'mortuary_full_cause_classifier.json',
);

// --- Classifier Instance ---
let causeOfDeathClassifier;

// --- Tokenizer and Stopwords ---
const { WordTokenizer, PorterStemmer } = natural;
const tokenizer = new WordTokenizer();

// Expanded stop words list for medical context
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
  'showing',
  'consistent',
  'severe',
  'multiple',
  'internal',
  'external',
  'acute',
  'chronic',
  'history',
  'post',
  'mortem',
  'examination',
  'autopsy',
  'findings',
  'summary',
  'at',
  'by',
  'as',
  'has',
  'have',
  'do',
  'does',
  'did',
  'not',
  'no',
  'but',
  'if',
  'then',
  'so',
  'upon',
  'there',
  'he',
  'she',
  'it',
  'they',
  'we',
  'you',
  'i',
  'my',
  'your',
  'his',
  'her',
  'its',
  'their',
  'this',
  'that',
  'these',
  'those',
  'can',
  'could',
  'would',
  'should',
  'will',
  'may',
  'might',
  'must',
  'be',
  'being',
  'each',
  'other',
  'same',
  'such',
  'only',
  'own',
  'very',
  'just',
  'now',
  'any',
  'all',
  'most',
  'some',
  'few',
  'more',
  'less',
  'than',
  'through',
  'under',
  'over',
  'between',
  'among',
  'before',
  'after',
  'above',
  'below',
  'into',
  'onto',
  'up',
  'down',
  'out',
  'off',
  'about',
  'across',
  'against',
  'along',
  'around',
  'behind',
  'beside',
  'beyond',
  'during',
  'except',
  'inside',
  'near',
  'outside',
  'past',
  'round',
  'since',
  'until',
  'towards',
  'underneath',
  'within',
  'without',
  'via',
  // Added more medical/general stopwords
  'cause',
  'death',
  'body',
  'organ',
  'system',
  'due',
  'to',
  'result',
  'of',
  'related',
  'associated',
  'condition',
  'disease',
  'syndrome',
  'disorder',
  'injury',
  'trauma',
  'complication',
  'failure',
  'manifestation',
  'leading',
  'primary',
  'secondary',
  'unknown',
  'unspecified',
  'identified',
  'present',
  'absence',
  'no',
  'evidence',
  'indicating',
  'suspected',
  'possible',
  'probable',
  'fatal',
  'mortem',
  'findings',
  'investigation',
  'deceased',
  'patient',
  'on examination',
]);

// --- Text Preprocessing ---
const preprocessText = (text) => {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  // Remove numbers and punctuation, keep spaces for tokenization
  cleaned = cleaned.replace(/[^a-z\s]/g, ' ');
  cleaned = cleaned.replace(/\s{2,}/g, ' ');

  const tokens = tokenizer.tokenize(cleaned);
  const filtered = tokens.filter((word) => !stopWords.has(word));
  const stemmed = filtered.map((word) => PorterStemmer.stem(word));

  return stemmed.join(' ').trim();
};

// --- Load Classifier from Disk ---
const loadClassifierModel = () => {
  return new Promise((resolve, reject) => {
    const modelDir = path.dirname(CLASSIFIER_MODEL_PATH);
    if (!fs.existsSync(modelDir)) {
      console.log(`Creating model directory: ${modelDir}`);
      fs.mkdirSync(modelDir, { recursive: true });
    }

    if (fs.existsSync(CLASSIFIER_MODEL_PATH)) {
      natural.BayesClassifier.load(
        CLASSIFIER_MODEL_PATH,
        null,
        (err, loaded) => {
          if (err) {
            console.error('Error loading classifier model:', err);
            return reject(err);
          }
          causeOfDeathClassifier = loaded;
          console.log(`✅ Classifier loaded from ${CLASSIFIER_MODEL_PATH}`);
          resolve(loaded);
        },
      );
    } else {
      console.warn(
        `⚠️ Classifier model not found at ${CLASSIFIER_MODEL_PATH}. Attempting to train a new one.`,
      );
      // Automatically train and save if model is missing in non-production environments
      if (process.env.NODE_ENV !== 'production') {
        trainAndSaveClassifier().then(resolve).catch(reject);
      } else {
        reject(new Error('Classifier model missing. Train and save it first.'));
      }
    }
  });
};

// --- Train and Save Classifier ---
const trainAndSaveClassifier = () => {
  return new Promise((resolve, reject) => {
    console.log('🚀 Training classifier...');
    const classifier = new natural.BayesClassifier();

    // --- Expanded and Refined Training Data ---
    // Added more diverse examples and new categories based on common causes of death globally and in Kenya.
    // Categories should be distinct and cover a wide range of possibilities.
    const samples = [
      // Accidents/Trauma 🚗💥
      [
        'severe trauma with bone fracture and internal injury, car crash, motor vehicle accident, pedestrian hit by vehicle',
        'accident_trauma',
      ],
      [
        'vehicular accident, massive blunt force abdominal trauma, head injury, crush injury',
        'accident_trauma',
      ],
      [
        'fall from height, impact injuries, skull fracture, spinal cord injury',
        'accident_trauma',
      ],
      [
        'drowning, pulmonary edema, water in lungs, submersion',
        'accident_trauma',
      ],
      [
        'electrocution, cardiac arrhythmia, high voltage shock',
        'accident_trauma',
      ],
      [
        'fire, burns, smoke inhalation, carbon monoxide poisoning',
        'accident_trauma',
      ],
      [
        'industrial accident, machinery entanglement, workplace injury',
        'accident_trauma',
      ],
      [
        'gunshot wound, stab wound, assault, blunt force trauma',
        'homicide_violence',
      ], // Differentiated from accidental trauma
      [
        'suicide by self-inflicted gunshot wound, hanging, poisoning, overdose',
        'suicide',
      ],

      // Cardiovascular Diseases ❤️
      [
        'acute myocardial infarction, coronary artery disease, heart attack, cardiac arrest, atherosclerosis',
        'cardiac_disease',
      ],
      [
        'cerebral hemorrhage, ruptured aneurysm, stroke, brain bleed, subarachnoid hemorrhage',
        'cardiac_disease',
      ],
      [
        'congestive heart failure, cardiogenic shock, dilated cardiomyopathy',
        'cardiac_disease',
      ],
      [
        'hypertensive heart disease, uncontrolled high blood pressure, hypertensive crisis',
        'cardiac_disease',
      ],
      [
        'aortic dissection, pulmonary embolism, deep vein thrombosis',
        'cardiac_disease',
      ],
      [
        'arrhythmia, ventricular fibrillation, sudden cardiac death',
        'cardiac_disease',
      ],

      // Infectious Diseases 🦠
      [
        'lobar pneumonia, respiratory distress, lung infection, severe acute respiratory syndrome',
        'infection',
      ],
      [
        'tuberculosis, disseminated infection, lung cavitations, multi-drug resistant TB',
        'infection',
      ],
      [
        'meningitis, brain inflammation, bacterial infection, viral encephalitis',
        'infection',
      ],
      [
        'sepsis, septic shock, systemic inflammatory response syndrome, severe infection',
        'infection',
      ],
      [
        'HIV/AIDS, AIDS defining illness, opportunistic infections',
        'infection',
      ],
      ['malaria, severe malarial anemia, cerebral malaria', 'infection'],
      ['cholera, severe dehydration, diarrheal disease', 'infection'],
      ['typhoid fever, enteric fever, intestinal perforation', 'infection'],
      [
        'COVID-19, severe acute respiratory syndrome coronavirus 2, viral pneumonia',
        'infection',
      ],

      // Metabolic/Endocrine Diseases (e.g., Diabetes, Kidney) 🧪
      [
        'complications of long standing type 2 diabetes, renal failure, DKA, diabetic ketoacidosis, hyperglycemic coma',
        'diabetes',
      ],
      [
        'diabetic neuropathy, foot ulcer infection, sepsis, hyperglycemia, hypoglycemia',
        'diabetes',
      ],
      [
        'end stage renal disease, chronic kidney failure, uremic complications, kidney failure, glomerulonephritis',
        'kidney_disease',
      ],
      [
        'acute kidney injury post-surgery, acute tubular necrosis, renal shutdown',
        'kidney_disease',
      ],
      [
        'polycystic kidney disease, renal insufficiency, ESRD complications',
        'kidney_disease',
      ],

      // Digestive System Diseases 🤢
      [
        'perforated peptic ulcer, widespread peritonitis leading to sepsis, gastric bleed',
        'gastrointestinal_disease',
      ],
      [
        'bleeding duodenal ulcer, hemorrhagic shock, gastrointestinal hemorrhage',
        'gastrointestinal_disease',
      ],
      [
        'gastric ulcer rupture, abdominal pain, infection, pancreatitis, cirrhosis, liver failure',
        'gastrointestinal_disease',
      ],
      [
        'appendicitis rupture, peritonitis, intestinal obstruction',
        'gastrointestinal_disease',
      ],

      // Cancers ♋
      [
        'lung cancer, metastatic lung carcinoma, adenocarcinoma of lung',
        'cancer',
      ],
      ['breast cancer, metastatic breast disease, ductal carcinoma', 'cancer'],
      [
        'colon cancer, colorectal adenocarcinoma, metastatic colon cancer',
        'cancer',
      ],
      [
        'leukemia, lymphoma, multiple myeloma, hematologic malignancy',
        'cancer',
      ],
      ['pancreatic cancer, hepatocellular carcinoma, brain tumor', 'cancer'],

      // Respiratory Diseases (Non-infectious) 🌬️
      [
        'chronic obstructive pulmonary disease, emphysema, chronic bronchitis, respiratory failure',
        'respiratory_disease',
      ],
      [
        'asthma attack, status asthmaticus, respiratory arrest',
        'respiratory_disease',
      ],
      ['pulmonary fibrosis, interstitial lung disease', 'respiratory_disease'],

      // Neurological Disorders 🧠
      [
        "Alzheimer's disease, dementia, neurodegenerative disease",
        'neurological_disorder',
      ],
      [
        "Parkinson's disease, motor neuron disease, ALS",
        'neurological_disorder',
      ],
      [
        'epilepsy, status epilepticus, seizure disorder',
        'neurological_disorder',
      ],

      // Other/Undetermined Causes 🤔
      [
        'accidental drug overdose, opioid toxicity, poly-substance intoxication',
        'other_cause',
      ],
      [
        'undetermined cause of death, no clear pathological findings, inconclusive autopsy',
        'other_cause',
      ],
      ['natural causes, old age, senility, death in sleep', 'natural_causes'], // For general elderly deaths
      [
        'sudden infant death syndrome, SIDS, unexplained infant death',
        'other_cause',
      ],
      [
        'complications of surgery, post-operative complications, anesthetic complication',
        'medical_complication',
      ],
      ['anaphylactic shock, severe allergic reaction', 'medical_complication'],
      [
        'electrolyte imbalance, hypokalemia, hypernatremia',
        'medical_complication',
      ],
      ['hypothermia, exposure, freezing', 'environmental_exposure'],
      ['heat stroke, hyperthermia', 'environmental_exposure'],
      ['poisoning, toxic ingestion, chemical exposure', 'poisoning'],
    ];

    samples.forEach(([text, label]) => {
      classifier.addDocument(preprocessText(text), label);
    });

    classifier.train();
    classifier.save(CLASSIFIER_MODEL_PATH, (err) => {
      if (err) {
        console.error('❌ Error saving classifier:', err);
        return reject(err);
      }
      console.log(
        `✅ Classifier trained and saved to ${CLASSIFIER_MODEL_PATH}`,
      );
      causeOfDeathClassifier = classifier; // Assign the newly trained classifier
      resolve(classifier);
    });
  });
};

// --- Utility Export (Optional for Production Use) ---
const isModelAvailable = () => fs.existsSync(CLASSIFIER_MODEL_PATH);

// --- Exported API ---
module.exports = {
  loadClassifierModel,
  preprocessText,
  getClassifier: () => causeOfDeathClassifier,
  // Only expose trainAndSaveClassifier in development
  ...(process.env.NODE_ENV !== 'production' && { trainAndSaveClassifier }),
  isModelAvailable,
};
