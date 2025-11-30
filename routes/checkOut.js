const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const { safeQuery } = require('../configurations/sqlConfig/db');

const router = express.Router();

// 🎨 Professional Design Constants
const DESIGN = {
  // Brand Colors for authority and professionalism
  PRIMARY_COLOR: '#1E293B', // Dark Slate/Navy for titles and major text
  SECONDARY_COLOR: '#64748B', // Medium Gray for details and less emphasis

  // Structure Colors
  BORDER_COLOR: '#E2E8F0', // Light border for boxes and lines
  LIGHT_GRAY: '#F8FAFC', // Very light background (if needed)
  DARK_GRAY: '#334155', // Secondary dark text color

  // Typography - Based on standard professional document sizes
  TITLE_SIZE: 16,
  HEADER_SIZE: 12,
  SUBHEADER_SIZE: 10,
  BODY_SIZE: 10,
  SMALL_SIZE: 8,
  CAPTION_SIZE: 7,

  // Layout
  MARGIN: 40,
  CONTENT_WIDTH: 515, // A4 width minus 2x margins
  COLUMN_GAP: 30,
  LOGO_WIDTH: 80,
  LOGO_HEIGHT: 60,
};

// --- Main PDF Generation Function ---
async function generateReleasePDF(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: DESIGN.MARGIN,
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // 1. Draw the clean, professional header
      const headerEndY = drawFixedHeader(doc);

      let currentY = headerEndY + 10;

      // Two Column Layout Calculation
      const colWidth = (DESIGN.CONTENT_WIDTH - DESIGN.COLUMN_GAP) / 2;

      // 2. LEFT COLUMN: Release Information
      const leftColumnEndY = drawLeftColumn(
        doc,
        data,
        DESIGN.MARGIN,
        currentY,
        colWidth,
      );

      // 3. RIGHT COLUMN: Authorized Recipient
      const rightColumnEndY = drawRightColumn(
        doc,
        data,
        DESIGN.MARGIN + colWidth + DESIGN.COLUMN_GAP,
        currentY,
        colWidth,
      );

      // Use the taller column height to determine next position
      const maxColumnEndY = Math.max(leftColumnEndY, rightColumnEndY);

      // 4. AUTHORIZATION TEXT - Clear legal section
      const authY = maxColumnEndY + 20;
      const authEndY = drawAuthorizationText(doc, data.recipientName, authY);

      // 5. SIGNATURE AREA - Organized side-by-side
      const signatureY = authEndY + 30; // Added more vertical space
      drawSignatureArea(doc, data, signatureY);

      // 6. Draw the clean footer
      drawCleanFooter(doc, data.documentId);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// 📌 Fixed Header (Company Logo, Info, and Document Title)
function drawFixedHeader(doc) {
  const headerY = 40;

  // NOTE: REPLACE THIS PATH with the actual, safe path to your logo
  const logoPath =
    'C:/lee-feuneral/Rest-Point-Mortuary-Mangment-Software-main/BackendApi/public/logo/lee.png';

  let logoUsed = false;
  try {
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, DESIGN.MARGIN, headerY, {
        width: DESIGN.LOGO_WIDTH,
        height: DESIGN.LOGO_HEIGHT,
      });
      logoUsed = true;
    }
  } catch (error) {
    // console.log('Logo not found, proceeding without logo');
  }

  // Company Information - Adjusted position based on logo presence
  const textStartX = logoUsed
    ? DESIGN.MARGIN + DESIGN.LOGO_WIDTH + 20
    : DESIGN.MARGIN;
  const textWidth =
    DESIGN.CONTENT_WIDTH - (logoUsed ? DESIGN.LOGO_WIDTH + 20 : 0);

  // Company Name
  doc
    .fontSize(16)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text('LEE FUNERAL SERVICES', textStartX, headerY, {
      width: textWidth,
    });

  // Tagline/Motto
  doc
    .fontSize(DESIGN.SUBHEADER_SIZE)
    .font('Helvetica-Oblique')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text(
      'Compassionate Care • Professional Service',
      textStartX,
      headerY + 18,
      {
        width: textWidth,
      },
    );

  // Contact Information
  doc
    .fontSize(DESIGN.SMALL_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text(
      '123 Memorial Drive • Nairobi • (555) 123-4567 • www.leefuneralservices.com',
      textStartX,
      headerY + 32,
      {
        width: textWidth,
      },
    );

  // Official Document Title - Prominent and Centered
  const titleY = headerY + 70;
  doc
    .fontSize(DESIGN.TITLE_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text('BODY RELEASE AUTHORIZATION', DESIGN.MARGIN, titleY, {
      align: 'center',
      width: DESIGN.CONTENT_WIDTH,
    });

  // Strong Header Separator Line
  doc
    .moveTo(DESIGN.MARGIN, titleY + 25)
    .lineTo(DESIGN.MARGIN + DESIGN.CONTENT_WIDTH, titleY + 25)
    .strokeColor(DESIGN.PRIMARY_COLOR)
    .lineWidth(2)
    .stroke();

  return titleY + 45; // Return the Y position after header
}

// 📌 Left Column: Release Information
function drawLeftColumn(doc, data, x, y, width) {
  let currentY = y;

  // Section Header with border
  currentY = drawSectionHeader(doc, 'RELEASE INFORMATION', x, currentY, width);
  currentY += 10;

  // Deceased Information
  currentY = drawSubSectionHeader(doc, 'Deceased Details', x, currentY);
  currentY = drawCleanInfoPair(
    doc,
    'Full Name:',
    data.deceasedName,
    x,
    currentY,
    width,
  );
  currentY += 20;

  // Release Information
  currentY = drawSubSectionHeader(doc, 'Release Arrangements', x, currentY);
  currentY = drawCleanInfoPair(
    doc,
    'Release Date:',
    data.releaseDate,
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Release Time:',
    data.releaseTime,
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Facility:',
    'LEE Funeral Services',
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Document ID:',
    data.documentId,
    x,
    currentY,
    width,
  );

  return currentY; // Final Y position
}

// 📌 Right Column: Authorized Recipient
function drawRightColumn(doc, data, x, y, width) {
  let currentY = y;

  // Section Header with border
  currentY = drawSectionHeader(doc, 'AUTHORIZED RECIPIENT', x, currentY, width);
  currentY += 10;

  // Recipient Details (No sub-header needed here, goes right into details)
  currentY = drawCleanInfoPair(
    doc,
    'Full Name:',
    data.recipientName,
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Relationship:',
    data.recipientRelation || 'Not specified',
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Contact Phone:',
    data.recipientPhone || 'Not provided',
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'ID Number:',
    data.recipientId || 'Not provided',
    x,
    currentY,
    width,
  );
  currentY = drawCleanInfoPair(
    doc,
    'Authorization:',
    'Next of Kin / Authorized Representative',
    x,
    currentY,
    width,
  );

  return currentY; // Final Y position
}

// 📌 Section Header Helper (With clean background fill)
function drawSectionHeader(doc, title, x, y, width) {
  const boxHeight = 16;
  doc.fillColor(DESIGN.LIGHT_GRAY).rect(x, y, width, boxHeight).fill();

  doc
    .fontSize(DESIGN.HEADER_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text(title, x + 5, y + 3);

  return y + boxHeight + 5;
}

// 📌 Sub-Section Header Helper
function drawSubSectionHeader(doc, title, x, y) {
  doc
    .fontSize(DESIGN.SUBHEADER_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.DARK_GRAY)
    .text(title, x, y);

  // Underline
  doc
    .moveTo(x, y + 12)
    .lineTo(x + doc.widthOfString(title), y + 12)
    .strokeColor(DESIGN.SECONDARY_COLOR)
    .lineWidth(0.5)
    .stroke();

  return y + 18;
}

// 📌 Clean Key-Value Pair (Data Fields)
function drawCleanInfoPair(doc, label, value, x, y, width) {
  const labelWidth = 100; // Increased label width for better alignment
  const valueX = x + labelWidth + 5;
  const valueWidth = width - labelWidth - 5;
  const lineHeight = DESIGN.BODY_SIZE * 1.4;

  // Label - Bold, Primary Color
  doc
    .fontSize(DESIGN.BODY_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text(label, x, y);

  // Value - Regular, Secondary Color, Wrapped if needed
  doc
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text(value || 'Not provided', valueX, y, {
      width: valueWidth,
    });

  // Calculate new Y position based on potential wrapping of value
  const textHeight = doc.heightOfString(value || 'Not provided', {
    width: valueWidth,
  });

  return y + Math.max(lineHeight, textHeight) + 4; // Add a small buffer
}

// 📌 Authorization Text (Legal Clause)
function drawAuthorizationText(doc, recipientName, startY) {
  // Section Header
  let currentY = drawSectionHeader(
    doc,
    'OFFICIAL AUTHORIZATION / RELEASE CLAUSE',
    DESIGN.MARGIN,
    startY,
    DESIGN.CONTENT_WIDTH,
  );
  currentY += 10;

  const authText = [
    `I, **${recipientName}**, hereby confirm that I am the **legal next-of-kin** or duly authorized representative with the legal capacity to execute this release. I authorize LEE Funeral Services to release the remains of the deceased, **${data.deceasedName}**, as specified in this document.`,
    ``,
    `I understand and accept that upon execution of this document and release of the remains, **LEE Funeral Services is irrevocably released from any further liability** concerning the custody, handling, or transportation of the remains. I confirm all necessary final arrangements and payments have been settled in full.`,
  ];

  // Set font for authorization text
  doc
    .fontSize(DESIGN.BODY_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.PRIMARY_COLOR);

  authText.forEach((line) => {
    if (line.trim() === '') {
      currentY += 8; // Space for empty lines
    } else {
      // Use helper to allow bolding within the text (PDFKit supports this with text runs)
      // Note: Full rich text in PDFKit is complex, but we can manage simple bolding like this.
      const parts = line.split(/(\*\*.*?\*\*)/g);
      let x = DESIGN.MARGIN;

      doc.y = currentY; // Set Y before starting the text line

      parts.forEach((part) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          doc
            .font('Helvetica-Bold')
            .text(part.replace(/\*\*/g, ''), x, currentY, {
              continued: true,
              baseline: 'top',
            });
          doc.font('Helvetica'); // Reset font
        } else {
          doc.text(part, x, currentY, { continued: true, baseline: 'top' });
        }
        x = doc.x; // Update x for next part
      });

      doc.text('', doc.x, doc.y); // End the continued line

      // Calculate height and move to next line
      const textHeight = doc.heightOfString(line.replace(/\*\*/g, ''), {
        width: DESIGN.CONTENT_WIDTH,
      });
      currentY += textHeight + 4;
    }
  });

  return currentY; // Final Y position
}

// 📌 Signature Area (Two-Column Side-by-Side)
function drawSignatureArea(doc, data, startY) {
  const colWidth = (DESIGN.CONTENT_WIDTH - DESIGN.COLUMN_GAP) / 2;

  // Section Title
  let currentY = drawSectionHeader(
    doc,
    'AUTHORIZED SIGNATURES',
    DESIGN.MARGIN,
    startY,
    DESIGN.CONTENT_WIDTH,
  );
  currentY += 10;

  // Left Column - Recipient
  drawSignatureBox(
    doc,
    DESIGN.MARGIN,
    currentY,
    colWidth,
    'AUTHORIZED RECIPIENT (Next-of-Kin)',
    data.recipientName,
    data.recipientSignature,
    data.releaseDate,
  );

  // Right Column - Funeral Home
  drawFuneralHomeSignature(
    doc,
    DESIGN.MARGIN + colWidth + DESIGN.COLUMN_GAP,
    currentY,
    colWidth,
    data.releaseDate,
  );
}

// 📌 Individual Signature Box
function drawSignatureBox(doc, x, y, width, title, name, signatureData, date) {
  const boxHeight = 100;

  // Box with border
  doc
    .rect(x, y, width, boxHeight)
    .strokeColor(DESIGN.PRIMARY_COLOR) // Use primary color for strong box
    .lineWidth(1)
    .stroke();

  // Title
  doc
    .fontSize(DESIGN.SUBHEADER_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text(title, x + 10, y + 8, { width: width - 20, align: 'center' });

  // Signature Area Line
  doc
    .strokeColor(DESIGN.SECONDARY_COLOR)
    .lineWidth(0.5)
    .moveTo(x + 15, y + 60)
    .lineTo(x + width - 15, y + 60)
    .stroke();

  // Label below signature line
  doc
    .fontSize(DESIGN.SMALL_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text('Signature', x + 10, y + 63, { width: width - 20, align: 'center' });

  // Name and Date
  doc
    .fontSize(DESIGN.BODY_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.DARK_GRAY)
    .text(name, x + 10, y + 75, { width: width - 20, align: 'center' });

  doc
    .fontSize(DESIGN.SMALL_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text(`Date: ${date}`, x + 10, y + 88, {
      width: width - 20,
      align: 'center',
    });

  // NOTE: This part is for dynamic signature rendering if available (e.g., base64 string)
  if (signatureData) {
    try {
      const signatureBuffer = Buffer.from(
        signatureData.split(',')[1],
        'base64',
      );
      doc.image(signatureBuffer, x + 15, y + 25, {
        width: width - 30,
        height: 30, // Adjusted height to fit
        align: 'center',
        valign: 'center',
      });
    } catch (error) {
      // Fallback if image fails
    }
  }
}

// 📌 Funeral Home Signature Box
function drawFuneralHomeSignature(doc, x, y, width, date) {
  const boxHeight = 100;

  // Box with border
  doc
    .rect(x, y, width, boxHeight)
    .strokeColor(DESIGN.PRIMARY_COLOR)
    .lineWidth(1)
    .stroke();

  // Title
  doc
    .fontSize(DESIGN.SUBHEADER_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.PRIMARY_COLOR)
    .text('LEE FUNERAL SERVICES (Witness)', x + 10, y + 8, {
      width: width - 20,
      align: 'center',
    });

  // Signature Area Line
  doc
    .strokeColor(DESIGN.SECONDARY_COLOR)
    .lineWidth(0.5)
    .moveTo(x + 15, y + 60)
    .lineTo(x + width - 15, y + 60)
    .stroke();

  // Label below signature line
  doc
    .fontSize(DESIGN.SMALL_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text('Signature', x + 10, y + 63, { width: width - 20, align: 'center' });

  // Representative info
  doc
    .fontSize(DESIGN.BODY_SIZE)
    .font('Helvetica-Bold')
    .fillColor(DESIGN.DARK_GRAY)
    .text('Authorized Funeral Director', x + 10, y + 75, {
      width: width - 20,
      align: 'center',
    });

  doc
    .fontSize(DESIGN.SMALL_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR)
    .text(`Date: ${date}`, x + 10, y + 88, {
      width: width - 20,
      align: 'center',
    });

  // Try to load pre-saved funeral home signature
  const signaturePath =
    'C:/lee-feuneral/Rest-Point-Mortuary-Mangment-Software-main/BackendApi/uploads/signature/signature.png';

  try {
    if (fs.existsSync(signaturePath)) {
      doc.image(signaturePath, x + 15, y + 25, {
        width: width - 30,
        height: 30,
        align: 'center',
        valign: 'center',
      });
    }
  } catch (error) {
    // console.log('Funeral home signature not found.');
  }
}

// 📌 Clean Footer (Pagination and Official Status)
function drawCleanFooter(doc, documentId) {
  const footerY = 750;

  // Footer separator
  doc
    .moveTo(DESIGN.MARGIN, footerY)
    .lineTo(DESIGN.MARGIN + DESIGN.CONTENT_WIDTH, footerY)
    .strokeColor(DESIGN.BORDER_COLOR)
    .lineWidth(0.5)
    .stroke();

  // Footer content - Small and discreet
  doc
    .fontSize(DESIGN.CAPTION_SIZE)
    .font('Helvetica')
    .fillColor(DESIGN.SECONDARY_COLOR);

  // Left: Document reference
  doc.text(`Document ID: ${documentId}`, DESIGN.MARGIN, footerY + 8);

  // Center: Official notice
  doc.text(
    'LEE FUNERAL SERVICES - OFFICIAL AUTHORIZATION DOCUMENT',
    DESIGN.MARGIN,
    footerY + 8,
    {
      width: DESIGN.CONTENT_WIDTH,
      align: 'center',
    },
  );

  // Right: Page info
  doc.text('Page 1 of 1', DESIGN.MARGIN, footerY + 8, {
    width: DESIGN.CONTENT_WIDTH,
    align: 'right',
  });

  // Bottom line: Contact
  doc.text(
    '123 Memorial Drive, Nairobi • Tel: (555) 123-4567',
    DESIGN.MARGIN,
    footerY + 18,
    {
      width: DESIGN.CONTENT_WIDTH,
      align: 'center',
    },
  );
}

// 📌 UTILITY FUNCTIONS
function generateDocumentId(deceasedName) {
  const initials = deceasedName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  const datePart = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 8);
  const randomPart = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `REL-${initials}-${datePart}-${randomPart}`;
}

// --- POST ENDPOINT ---
router.post('/generate-pdf', async (req, res) => {
  try {
    // Example data based on your request
    const {
      deceasedName = 'Peter Mumo',
      recipientName = 'Mumo',
      recipientRelation = 'mum',
      recipientPhone = '0740045355',
      recipientId = '39217890',
      recipientSignature, // Base64 signature string
      releaseDate = '11/23/2025',
      releaseTime = '7:56:05 PM',
    } = req.body;

    if (!deceasedName?.trim() || !recipientName?.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Deceased name and recipient name are required',
      });
    }

    const documentId = generateDocumentId(deceasedName);

    // Formatting date/time from input or current
    const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };

    const formattedDate = releaseDate
      ? new Date(releaseDate).toLocaleDateString('en-US', dateOptions)
      : new Date().toLocaleDateString('en-US', dateOptions);
    const formattedTime = releaseTime
      ? new Date(`2000/01/01 ${releaseTime}`).toLocaleTimeString(
          'en-US',
          timeOptions,
        )
      : new Date().toLocaleTimeString('en-US', timeOptions);

    const data = {
      documentId,
      deceasedName: deceasedName.trim(),
      recipientName: recipientName.trim(),
      recipientRelation: recipientRelation?.trim(),
      recipientPhone: recipientPhone?.trim(),
      recipientId: recipientId?.trim(),
      recipientSignature,
      releaseDate: formattedDate,
      releaseTime: formattedTime,
    };

    const pdfBuffer = await generateReleasePDF(data);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Release_Authorization_${documentId}.pdf"`,
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate document',
    });
  }
});

// GET all release forms with filtering by deceased ID
router.get('/release-forms', async (req, res) => {
  try {
    const { search, limit = 20, deceasedId } = req.query;

    let query = `
      SELECT id, document_id, timestamp, deceased_name, recipient_name, 
             recipient_relation, recipient_phone, recipient_id,
             recipient_signature, liability_accepted, created_at, updated_at
      FROM releases 
      WHERE 1=1
    `;
    const params = [];

    // Filter by deceased ID if provided
    if (deceasedId) {
      query += ' AND deceased_id = ?';
      params.push(deceasedId);
    }

    // Search functionality
    if (search) {
      query +=
        ' AND (deceased_name LIKE ? OR recipient_name LIKE ? OR document_id LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Order by latest first and limit results
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const result = await safeQuery(query, params);

    res.json({
      success: true,
      data: {
        forms: result,
        total: result.length,
      },
    });
  } catch (error) {
    console.error('Get Release Forms Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve release forms',
    });
  }
});

// GET all release forms with filtering by deceased name (since deceased_id column doesn't exist)
router.get('/release-forms', async (req, res) => {
  try {
    const { search, limit = 20, deceasedId, deceasedName } = req.query;

    let query = `
      SELECT id, document_id, timestamp, deceased_name, recipient_name, 
             recipient_relation, recipient_phone, recipient_id,
             recipient_signature, liability_accepted, created_at, updated_at
      FROM releases 
      WHERE 1=1
    `;
    const params = [];

    // Filter by deceased name if provided (since we don't have deceased_id column)
    if (deceasedName) {
      query += ' AND deceased_name = ?';
      params.push(deceasedName);
    }

    // Alternative: if you have deceasedId but want to filter by exact name match
    if (deceasedId && deceasedName) {
      query += ' AND deceased_name = ?';
      params.push(deceasedName);
    }

    // Search functionality
    if (search) {
      query +=
        ' AND (deceased_name LIKE ? OR recipient_name LIKE ? OR document_id LIKE ?)';
      const searchParam = `%${search}%`;
      params.push(searchParam, searchParam, searchParam);
    }

    // Order by latest first and limit results
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(parseInt(limit));

    const result = await safeQuery(query, params);

    res.json({
      success: true,
      data: {
        forms: result,
        total: result.length,
      },
    });
  } catch (error) {
    console.error('Get Release Forms Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve release forms',
    });
  }
});

// GET release forms by deceased name (alternative endpoint)
router.get('/release-forms/deceased/:deceasedName', async (req, res) => {
  try {
    const { deceasedName } = req.params;
    const { limit = 20 } = req.query;

    const result = await safeQuery(
      `SELECT id, document_id, timestamp, deceased_name, recipient_name, 
              recipient_relation, recipient_phone, recipient_id,
              recipient_signature, liability_accepted, created_at, updated_at
       FROM releases 
       WHERE deceased_name = ?
       ORDER BY created_at DESC 
       LIMIT ?`,
      [deceasedName, parseInt(limit)],
    );

    res.json({
      success: true,
      data: {
        forms: result,
        total: result.length,
      },
    });
  } catch (error) {
    console.error('Get Release Forms by Deceased Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve release forms for this deceased',
    });
  }
});

// DELETE release form
router.delete('/release-forms/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await safeQuery('DELETE FROM releases WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: 'Release form not found',
      });
    }

    res.json({
      success: true,
      message: 'Release form deleted successfully',
    });
  } catch (error) {
    console.error('Delete Release Form Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete release form',
    });
  }
});

// Download PDF
router.get('/release-forms/:id/download', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await safeQuery(
      `SELECT pdf_data, deceased_name, document_id FROM releases WHERE id = ?`,
      [id],
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const document = result[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="release_${document.deceased_name.replace(/\s+/g, '_')}_${document.document_id}.pdf"`,
    );
    res.setHeader('X-Document-ID', document.document_id);

    res.send(document.pdf_data);
  } catch (error) {
    console.error('PDF Download Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download document',
    });
  }
});

// View PDF in browser
router.get('/release-forms/:id/view', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await safeQuery(
      `SELECT pdf_data FROM releases WHERE id = ?`,
      [id],
    );

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Document not found',
      });
    }

    const document = result[0];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="view.pdf"');

    res.send(document.pdf_data);
  } catch (error) {
    console.error('PDF View Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to view document',
    });
  }
});

module.exports = router;
