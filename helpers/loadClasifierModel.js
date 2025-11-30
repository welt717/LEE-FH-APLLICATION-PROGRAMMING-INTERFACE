const path = require('path');
const fs = require('fs').promises;

const CLASSIFIER_MODEL_PATH = path.resolve(
  'D:/RestPointSoftware/backendApi/aiModels/mortuary_full_cause_classifier.json',
);

let classifierModel = null;

async function loadClassifierModel() {
  try {
    await fs.access(CLASSIFIER_MODEL_PATH); // Check existence
    const rawData = await fs.readFile(CLASSIFIER_MODEL_PATH, 'utf-8');
    classifierModel = JSON.parse(rawData);
    console.log('✅ Classifier model loaded successfully.');
  } catch (err) {
    console.error('❌ Failed to load classifier model:', err.message);
    throw new Error('Classifier model not found');
  }
}

function getClassifierModel() {
  return classifierModel;
}

module.exports = {
  loadClassifierModel,
  getClassifierModel,
};
