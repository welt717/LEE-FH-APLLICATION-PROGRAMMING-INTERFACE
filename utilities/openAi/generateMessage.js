// utilities/aiMessageGenerator.js
const Markov = require('markov-strings').default;
const { safeQuery } = require('../../configurations/sqlConfig/db');

const corpus = [
  'We extend our deepest sympathies during this period of bereavement and loss.',
  'Please accept our sincere condolences and know that we are handling all arrangements with the utmost dignity and care.',
  'Our professional staff remains available to provide guidance and support regarding funeral preparations.',
  'We hope this communication finds you as well as possible under these difficult circumstances.',
  'We wish to assure you that all proceedings are being conducted with professional respect and attention to detail.',
  'This communication serves to inform you that your beloved {deceased} is being cared for with dignity at {mortuary}.',
  'Please proceed with necessary documentation at your earliest convenience, and do not hesitate to contact us with any questions.',
];

// Initialize Markov generator with enhanced parameters
const markov = new Markov({ stateSize: 2 });
markov.addData(corpus);

async function generateMessage({
  stage,
  deceased,
  kin,
  kinRelationship,
  causeOfDeath,
  mortuary,
}) {
  // Stage-specific professional preamble
  let preamble = '';
  switch (stage) {
    case 'registration':
      preamble = `Dear ${kin}, we wish to formally notify you that your ${kinRelationship}, ${deceased}, has been officially registered in our system.`;
      break;
    case 'coffin_assigned':
      preamble = `Dear ${kin}, a suitable coffin has been respectfully selected and assigned for ${deceased}.`;
      break;
    case 'autopsy':
      preamble = `Dear ${kin}, the autopsy proceedings for ${deceased} have been completed. The official findings will be communicated to you shortly.`;
      break;
    case 'prepared':
      preamble = `Dear ${kin}, ${deceased} has been properly attended to, including washing, dressing, and preparation for the final rites.`;
      break;
    case 'burial_certificate':
      preamble = `Dear ${kin}, the official burial certificate for ${deceased} has been processed and is now prepared.`;
      break;
    case 'dispatched':
      preamble = `Dear ${kin}, ${deceased} has been respectfully dispatched from our care. Please accept our deepest condolences.`;
      break;
    default:
      preamble = `Dear ${kin}, this communication concerns an update regarding ${deceased}.`;
  }

  // Generate refined Markov-based continuation
  const result = markov.generate({
    maxTries: 750, // Increased for better results
    filter: (res) =>
      res.string.split(' ').length >= 15 && res.string.split(' ').length <= 35,
    prng: Math.random, // Ensure proper random selection
  });

  let body = result.string;

  // Enhanced mortuary details retrieval
  let mortuaryInfo = '';
  if (mortuary && mortuary !== 'the mortuary') {
    try {
      const rows = await safeQuery(
        `SELECT name, address, phone, operating_hours FROM mortuaries WHERE mortuary_id = ?`,
        [mortuary],
      );
      if (rows.length) {
        const m = rows[0];
        mortuaryInfo =
          `\n\nFor your reference, the mortuary details are as follows:\n` +
          `Establishment: ${m.name}\n` +
          `Location: ${m.address}\n` +
          `Contact: ${m.phone}\n` +
          `Operating Hours: ${m.operating_hours}\n`;
      }
    } catch (error) {
      console.error('Error retrieving mortuary information:', error);
    }
  }

  // Final polished message
  const finalMessage = `${preamble}\n\n${body}${mortuaryInfo}\n\nOur professional team remains at your disposal for any assistance or guidance you may require during this difficult time.`;

  return finalMessage;
}

module.exports = { generateMessage };
