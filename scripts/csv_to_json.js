const fs = require('fs');
const path = require('path');

const QUESTIONS_DIR = path.join(__dirname, '..', 'Questions');
const DATA_DIR = path.join(__dirname, '..', 'data');

// Ensure output directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// RFC 4180 compliant CSV Parser
function parseCSV(csvText) {
  const result = [];
  let row = [];
  let entry = "";
  let inQuotes = false;
  
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];
    
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped double quote
          entry += '"';
          i++; // Skip the next quote
        } else {
          // End of quoted field
          inQuotes = false;
        }
      } else {
        entry += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(entry);
        entry = "";
      } else if (char === '\r' || char === '\n') {
        row.push(entry);
        entry = "";
        if (row.length > 1 || row[0] !== "") {
          result.push(row);
        }
        row = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // Skip line feed
        }
      } else {
        entry += char;
      }
    }
  }
  if (entry !== "" || row.length > 0) {
    row.push(entry);
    result.push(row);
  }
  return result;
}

// Clean and convert rows to questions format
function convertCSVToQuestions(rows) {
  if (rows.length < 2) return [];
  
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const qNumIdx = headers.indexOf('question_number');
  const qTextIdx = headers.indexOf('question_text');
  const qOptsIdx = headers.indexOf('options_json');
  const qAnsIdx = headers.indexOf('answer_text');
  const qAnsValIdx = headers.indexOf('answer_index');
  const qExplIdx = headers.indexOf('explanation_text');

  const questions = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 3) continue; // Skip empty rows

    const qNum = row[qNumIdx] ? parseInt(row[qNumIdx].trim(), 10) : i;
    const qText = row[qTextIdx] ? row[qTextIdx].trim() : "";
    const optionsRaw = row[qOptsIdx] ? row[qOptsIdx].trim() : "[]";
    const answerText = row[qAnsIdx] ? row[qAnsIdx].trim() : "";
    const answerIndexRaw = row[qAnsValIdx] ? row[qAnsValIdx].trim() : "";
    const explanation = row[qExplIdx] ? row[qExplIdx].trim() : "";

    let options = [];
    try {
      options = JSON.parse(optionsRaw);
      if (!Array.isArray(options)) {
        options = [];
      }
    } catch (e) {
      // Fallback if parsing fails: split by commas or try to clean quotes
      console.warn(`[Warning] Failed to parse options JSON at question #${qNum}: "${optionsRaw}". Attempting regex clean.`);
      try {
        const cleaned = optionsRaw
          .replace(/^\[/, '')
          .replace(/\]$/, '')
          .split(/\"\s*,\s*\"/)
          .map(s => s.replace(/^\"/, '').replace(/\"$/, '').trim());
        options = cleaned;
      } catch (err) {
        options = [];
      }
    }

    let correctIndex = parseInt(answerIndexRaw, 10);
    if (isNaN(correctIndex)) {
      // Fallback: search in options
      correctIndex = options.findIndex(opt => opt.toLowerCase() === answerText.toLowerCase());
    }

    questions.push({
      id: qNum,
      question: qText,
      options: options,
      correctIndex: correctIndex,
      correctText: answerText,
      explanation: explanation
    });
  }

  return questions;
}

// Convert all files
function run() {
  console.log("Starting CSV to JSON conversion...");
  
  if (!fs.existsSync(QUESTIONS_DIR)) {
    console.error(`Error: Questions directory not found at ${QUESTIONS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(QUESTIONS_DIR);
  const csvFiles = files.filter(f => f.toLowerCase().endsWith('.csv'));

  console.log(`Found ${csvFiles.length} CSV files.`);

  let totalQuestions = 0;
  const indexMetadata = {};

  csvFiles.forEach(file => {
    const filePath = path.join(QUESTIONS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    console.log(`Parsing ${file}...`);
    const rows = parseCSV(content);
    const questions = convertCSVToQuestions(rows);
    
    const subjectName = path.basename(file, path.extname(file));
    const outputFileName = `${subjectName}.json`;
    const outputPath = path.join(DATA_DIR, outputFileName);
    
    fs.writeFileSync(outputPath, JSON.stringify(questions, null, 2), 'utf-8');
    console.log(`Successfully wrote ${questions.length} questions to data/${outputFileName}`);
    
    totalQuestions += questions.length;
    indexMetadata[subjectName] = {
      file: outputFileName,
      count: questions.length
    };
  });

  // Write a metadata index file to easily list subjects dynamically
  fs.writeFileSync(
    path.join(DATA_DIR, 'metadata.json'),
    JSON.stringify(indexMetadata, null, 2),
    'utf-8'
  );

  console.log(`\nConversion complete!`);
  console.log(`Total subjects processed: ${csvFiles.length}`);
  console.log(`Total questions processed: ${totalQuestions}`);
}

run();
