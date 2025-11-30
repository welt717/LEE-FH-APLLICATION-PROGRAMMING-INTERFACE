// controllers/invoiceController.js
const asyncHandler = require('express-async-handler');
const NodeCache = require('node-cache');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { AppError } = require('../../middlewares/errorHandler/errorHandler');
const crypto = require('crypto');

const invoiceCache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

const generateStampHash = () => crypto.randomBytes(16).toString('hex');

const generateInvoicePDFBuffer = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Invoice ${invoice.invoice_number}`,
          Author: 'Lee Funeral Home',
        },
      });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      // ===== HEADER SECTION WITH WHITE BACKGROUND =====
      const headerTop = 40;

      // Logo and Company Name on LEFT side
      const logoPath = path.join(__dirname, '../../public/logo/lee.png');
      if (fs.existsSync(logoPath)) {
        doc.image(logoPath, 50, headerTop, { width: 50 });
      }

      // Company Name below logo
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .fillColor('#0f172a')
        .text('LEE FUNERAL HOME', 50, headerTop + 55);

      // Contact Info on RIGHT side
      doc
        .fontSize(8)
        .font('Helvetica')
        .fillColor('#0f172a')
        .text(
          'Nairobi — Argwings Kodhek Road, Next To Nairobi Hospital',
          300,
          headerTop + 10,
        )
        .text(
          'info@lf.services | paulvbrussel@lf.services',
          300,
          headerTop + 25,
        )
        .text(
          '+254 722 401 861 | +254 704 201 532 | +254 722 514 584',
          300,
          headerTop + 40,
        );

      // ===== INVOICE DETAILS SECTION =====
      const detailsTop = headerTop + 100;

      // Two column layout
      const leftColumn = 50;
      const rightColumn = 300;

      // Invoice Details
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor('#1a5276')
        .text('INVOICE DETAILS', leftColumn, detailsTop);

      doc
        .font('Helvetica')
        .fillColor('#2c3e50')
        .text(
          `Invoice #: ${invoice.invoice_number}`,
          leftColumn,
          detailsTop + 20,
        )
        .text(
          `Date: ${new Date().toLocaleDateString()}`,
          leftColumn,
          detailsTop + 35,
        );

      // Client Information
      doc
        .font('Helvetica-Bold')
        .fillColor('#1a5276')
        .text('CLIENT INFORMATION', rightColumn, detailsTop);

      doc
        .font('Helvetica')
        .fillColor('#2c3e50')
        .text(
          `Deceased: ${invoice.deceased_name}`,
          rightColumn,
          detailsTop + 20,
        )
        .text(
          `Next of Kin: ${invoice.nok || 'N/A'}`,
          rightColumn,
          detailsTop + 35,
        )
        .text(
          `ID Number: ${invoice.id_number || 'N/A'}`,
          rightColumn,
          detailsTop + 50,
        )
        .text(
          `Date of Death: ${invoice.dod || 'N/A'}`,
          rightColumn,
          detailsTop + 65,
        );

      // ===== SERVICES TABLE =====
      const tableTop = detailsTop + 90;

      // Table Header - Full width from end to end
      doc.rect(50, tableTop, 495, 25).fill('#1a5276');

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#ffffff')
        .text('SERVICE DESCRIPTION', 55, tableTop + 8)
        .text('QTY', 380, tableTop + 8)
        .text('UNIT PRICE', 430, tableTop + 8)
        .text('AMOUNT', 500, tableTop + 8);

      // Table Rows
      let currentY = tableTop + 25;
      invoice.items.forEach((item, index) => {
        const rowColor = index % 2 === 0 ? '#f8f9f9' : '#ffffff';

        doc.rect(50, currentY, 495, 25).fill(rowColor);

        doc
          .fontSize(9)
          .font('Helvetica')
          .fillColor('#2c3e50')
          .text(item.service, 55, currentY + 8, { width: 300 })
          .text(item.qty.toString(), 380, currentY + 8)
          .text(
            `KES ${parseFloat(item.amount).toLocaleString()}`,
            430,
            currentY + 8,
          )
          .text(
            `KES ${(item.qty * item.amount).toLocaleString()}`,
            500,
            currentY + 8,
          );

        currentY += 25;
      });

      // ===== TOTALS SECTION =====
      const totalsTop = currentY + 20;

      // Summary Box
      doc
        .rect(350, totalsTop - 10, 195, invoice.tax_amount > 0 ? 80 : 60)
        .fill('#f8f9f9')
        .stroke('#bdc3c7');

      doc
        .fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#2c3e50')
        .text('SUBTOTAL:', 360, totalsTop)
        .text(
          `KES ${parseFloat(invoice.subtotal || invoice.total_amount).toLocaleString()}`,
          460,
          totalsTop,
        );

      if (invoice.tax_amount > 0) {
        doc
          .text(`TAX (${invoice.tax_rate}%):`, 360, totalsTop + 20)
          .text(
            `KES ${invoice.tax_amount.toLocaleString()}`,
            460,
            totalsTop + 20,
          )
          .text('TOTAL:', 360, totalsTop + 40)
          .text(
            `KES ${invoice.total_amount.toLocaleString()}`,
            460,
            totalsTop + 40,
          );
      } else {
        doc
          .text('TOTAL:', 360, totalsTop + 20)
          .text(
            `KES ${invoice.total_amount.toLocaleString()}`,
            460,
            totalsTop + 20,
          );
      }

      // Payment Status Badge
      if (invoice.payment_status) {
        const statusColor =
          invoice.payment_status.toLowerCase() === 'paid'
            ? '#27ae60'
            : '#e74c3c';
        const statusBg =
          invoice.payment_status.toLowerCase() === 'paid'
            ? '#d5f4e6'
            : '#fadbd8';

        doc
          .rect(360, totalsTop + (invoice.tax_amount > 0 ? 60 : 40), 80, 20)
          .fill(statusBg);

        doc
          .fontSize(8)
          .font('Helvetica-Bold')
          .fillColor(statusColor)
          .text(
            invoice.payment_status.toUpperCase(),
            370,
            totalsTop + (invoice.tax_amount > 0 ? 65 : 45),
          );
      }

      // ===== FOOTER SECTION =====
      const footerTop = totalsTop + 100;

      doc
        .strokeColor('#ecf0f1')
        .lineWidth(1)
        .moveTo(50, footerTop)
        .lineTo(545, footerTop)
        .stroke();

      // Verification Stamp
      const stamp = crypto
        .createHash('sha256')
        .update(invoice.invoice_number + '-' + Date.now())
        .digest('hex')
        .substring(0, 16)
        .toUpperCase();

      doc
        .fontSize(7)
        .font('Helvetica')
        .fillColor('#7f8c8d')
        .text(`Verification: ${stamp}`, 50, footerTop + 10)
        .text(`Generated: ${new Date().toLocaleString()}`, 50, footerTop + 20);

      // Signature Area
      const signaturePath = path.join(
        __dirname,
        '../../uploads/signature/signature.png',
      );
      if (fs.existsSync(signaturePath)) {
        doc.image(signaturePath, 450, footerTop - 10, {
          width: 60,
          height: 30,
        });
      }

      doc
        .fontSize(8)
        .fillColor('#2c3e50')
        .text('Authorized Signature', 450, footerTop + 25)
        .text('Lee Funeral Home', 450, footerTop + 35);

      // Footer Note
      doc
        .fontSize(7)
        .fillColor('#95a5a6')
        .text(
          'Thank you for choosing Lee Funeral Home. For any inquiries, please contact us at +254 740 045 355',
          50,
          footerTop + 60,
          { align: 'center', width: 495 },
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

// Get all deceased with financial summary
const getAllDeceasedWithFinancials = asyncHandler(async (req, res, next) => {
  const sql = `
    SELECT 
      d.id,
      d.deceased_id,
      d.full_name,
      d.date_of_death,
      d.cause_of_death,
      d.place_of_death,
      d.gender,
      d.county,
      d.location,
      d.mortuary_charge,
      d.total_mortuary_charge,
      d.status,
      COALESCE(SUM(DISTINCT p.amount), 0) AS total_payments,
      COALESCE(SUM(DISTINCT ec.amount), 0) AS total_extra_charges,
      COALESCE(d.total_mortuary_charge, 0) 
        + COALESCE(SUM(DISTINCT ec.amount), 0) AS total_charges,
      (COALESCE(d.total_mortuary_charge, 0) 
        + COALESCE(SUM(DISTINCT ec.amount), 0)
        - COALESCE(SUM(DISTINCT p.amount), 0)) AS balance
    FROM deceased d
    LEFT JOIN payments p ON d.id = p.deceased_id
    LEFT JOIN extra_charges ec ON d.id = ec.deceased_id
    GROUP BY d.id
    ORDER BY d.date_registered DESC;
  `;

  const deceased = await safeQuery(sql);
  res.json({ status: 'success', data: deceased });
});

// Get deceased financial details
const getDeceasedFinancialDetails = asyncHandler(async (req, res, next) => {
  const { deceased_id } = req.params;

  // Fetch deceased using numeric ID
  const deceasedSql = 'SELECT * FROM deceased WHERE id = ?';
  const [deceased] = await safeQuery(deceasedSql, [deceased_id]);

  if (!deceased) {
    return next(new AppError('Deceased not found', 404));
  }

  // Use numeric ID for payments and invoices (works fine)
  const paymentsSql =
    'SELECT * FROM payments WHERE deceased_id = ? ORDER BY payment_date DESC';
  const payments = await safeQuery(paymentsSql, [deceased_id]);

  const invoicesSql =
    'SELECT * FROM invoices WHERE deceased_id = ? ORDER BY created_at DESC';
  const invoices = await safeQuery(invoicesSql, [deceased_id]);

  // Fix: use string deceased_id for extra_charges
  const stringDeceasedId = deceased.deceased_id; // <-- string id from deceased table
  const chargesSql =
    'SELECT * FROM extra_charges WHERE deceased_id = ? ORDER BY created_at DESC';
  const extraCharges = await safeQuery(chargesSql, [stringDeceasedId]);

  const totalPayments = payments.reduce(
    (sum, payment) => sum + parseFloat(payment.amount),
    0,
  );
  const totalExtraCharges = extraCharges.reduce(
    (sum, charge) => sum + parseFloat(charge.amount),
    0,
  );
  const totalCharges =
    (deceased.total_mortuary_charge || 0) + totalExtraCharges;
  const balance = totalCharges - totalPayments;

  const financialSummary = {
    deceased,
    payments,
    extraCharges,
    invoices: invoices.map((inv) => ({
      ...inv,
      items: typeof inv.items === 'string' ? JSON.parse(inv.items) : inv.items,
    })),
    totals: {
      mortuary_charges: deceased.total_mortuary_charge || 0,
      extra_charges: totalExtraCharges,
      total_charges: totalCharges,
      total_payments: totalPayments,
      balance: balance,
    },
  };

  res.json({ status: 'success', data: financialSummary });
});

// Create payment
const createPayment = asyncHandler(async (req, res, next) => {
  const { deceased_id, amount, payment_method, reference_code, description } =
    req.body;

  if (!deceased_id || !amount || !payment_method) {
    return next(new AppError('Missing required payment fields', 400));
  }

  const sql = `
    INSERT INTO payments 
    (deceased_id, amount, payment_method, reference_code, description, payment_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const result = await safeQuery(sql, [
    deceased_id,
    amount,
    payment_method,
    reference_code || `PAY-${Date.now()}`,
    description || 'Mortuary Services Payment',
    getKenyaTimeISO(),
  ]);

  res.status(201).json({
    status: 'success',
    message: 'Payment recorded successfully',
    payment_id: result.insertId,
  });
});

// Create extra charge - FIXED foreign key constraint
const createExtraCharge = asyncHandler(async (req, res, next) => {
  const { deceased_id, charge_type, amount, description, notes, service_date } =
    req.body;

  if (!deceased_id || !charge_type || !amount) {
    return next(new AppError('Missing required charge fields', 400));
  }

  // First verify the deceased exists
  const deceasedSql = 'SELECT deceased_id FROM deceased WHERE id = ?';
  const [deceased] = await safeQuery(deceasedSql, [deceased_id]);

  if (!deceased) {
    return next(new AppError('Deceased not found', 404));
  }

  const sql = `
    INSERT INTO extra_charges 
    (deceased_id, charge_type, amount, description, notes, service_date, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await safeQuery(sql, [
    deceased.deceased_id, // Use deceased_id string instead of numeric id
    charge_type,
    amount,
    description,
    notes || '',
    service_date || getKenyaTimeISO(),
    getKenyaTimeISO(),
  ]);

  res.status(201).json({
    status: 'success',
    message: 'Extra charge added successfully',
    charge_id: result.insertId,
  });
});

// Create system invoice - FIXED database schema
const createSystemInvoice = asyncHandler(async (req, res, next) => {
  const { deceased_id } = req.body;

  if (!deceased_id) {
    return next(new AppError('Deceased ID is required', 400));
  }

  const deceasedSql = 'SELECT * FROM deceased WHERE id = ?';
  const [deceased] = await safeQuery(deceasedSql, [deceased_id]);

  if (!deceased) {
    return next(new AppError('Deceased not found', 404));
  }

  const chargesSql =
    'SELECT * FROM extra_charges WHERE deceased_id = ? AND status != "Paid"';
  const extraCharges = await safeQuery(chargesSql, [deceased.deceased_id]); // Use deceased_id string

  const systemItems = [];
  let systemTotal = 0;

  if (deceased.mortuary_charge && deceased.mortuary_charge > 0) {
    systemItems.push({
      service: 'Basic Mortuary Services',
      qty: 1,
      amount: parseFloat(deceased.mortuary_charge),
    });
    systemTotal += parseFloat(deceased.mortuary_charge);
  }

  if (deceased.embalming_cost && deceased.embalming_cost > 0) {
    systemItems.push({
      service: 'Embalming Services',
      qty: 1,
      amount: parseFloat(deceased.embalming_cost),
    });
    systemTotal += parseFloat(deceased.embalming_cost);
  }

  extraCharges.forEach((charge) => {
    systemItems.push({
      service: charge.charge_type,
      qty: 1,
      amount: parseFloat(charge.amount),
      description: charge.description,
    });
    systemTotal += parseFloat(charge.amount);
  });

  if (systemItems.length === 0) {
    systemItems.push(
      { service: 'Mortuary Services', qty: 1, amount: 15000 },
      { service: 'Basic Care and Maintenance', qty: 1, amount: 5000 },
    );
    systemTotal = 20000;
  }

  const stamp_hash = generateStampHash();
  const invoice_number = `SYS-INV-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  const invoiceData = {
    deceased_name: deceased.full_name,
    nok: 'N/A',
    id_number: deceased.deceased_id,
    dod: deceased.date_of_death,
    address: `${deceased.location}, ${deceased.county}`,
    phone: 'N/A',
    items: systemItems,
    total_amount: systemTotal,
    subtotal: systemTotal,
    tax_amount: 0,
    tax_rate: 0,
    mortuary_name: 'Professional Mortuary Services',
    mortuary_phone: '+254 740 045 355',
    stamp_hash,
    signature_url: '/uploads/signature/signature.png',
    created_at: getKenyaTimeISO(),
    invoice_number,
    deceased_id: deceased.id,
  };

  const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);

  const baseInvoicesDir = path.join(__dirname, '../../uploads/invoices');
  if (!fs.existsSync(baseInvoicesDir)) {
    fs.mkdirSync(baseInvoicesDir, { recursive: true });
  }

  const deceasedFolderName = `${deceased.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_${deceased.id}`;
  const deceasedInvoicesDir = path.join(baseInvoicesDir, deceasedFolderName);

  if (!fs.existsSync(deceasedInvoicesDir)) {
    fs.mkdirSync(deceasedInvoicesDir, { recursive: true });
  }

  const pdfPath = path.join(deceasedInvoicesDir, `${invoice_number}.pdf`);
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  // FIXED: Use correct database schema for invoices table
  const insertSql = `
    INSERT INTO invoices 
    (deceased_id, invoice_number, items, total_amount, pdf_url, stamp_hash, signature_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await safeQuery(insertSql, [
    deceased.id,
    invoice_number,
    JSON.stringify(invoiceData.items),
    invoiceData.total_amount,
    pdfPath,
    invoiceData.stamp_hash,
    invoiceData.signature_url,
    invoiceData.created_at,
  ]);

  if (extraCharges.length > 0) {
    const updateChargesSql =
      'UPDATE extra_charges SET status = "Invoiced" WHERE deceased_id = ? AND status = "Pending"';
    await safeQuery(updateChargesSql, [deceased.deceased_id]);
  }

  invoiceCache.set(invoice_number, invoiceData);

  res.status(201).json({
    status: 'success',
    message: 'System invoice created successfully',
    invoice_number,
    pdf_url: pdfPath,
    invoice_id: result.insertId,
    deceased_folder: deceasedFolderName,
    system_generated: true,
  });
});

// Create custom invoice - FIXED database schema
const createInvoice = asyncHandler(async (req, res, next) => {
  const {
    deceased_id,
    invoice_number,
    items,
    total_amount,
    subtotal,
    tax_amount,
    tax_rate,
    mortuary_name,
    mortuary_phone,
    signature_url,
    created_at,
    deceased_name,
    nok,
    id_number,
    dod,
    address,
    phone,
  } = req.body;

  if (!deceased_name || !invoice_number || !items || !total_amount) {
    return next(new AppError('Missing required invoice fields', 400));
  }

  const stamp_hash = generateStampHash();
  const invoiceData = {
    deceased_name,
    nok: nok || 'N/A',
    id_number: id_number || 'N/A',
    dod: dod || 'N/A',
    address: address || 'N/A',
    phone: phone || 'N/A',
    items,
    total_amount,
    subtotal: subtotal || total_amount,
    tax_amount: tax_amount || 0,
    tax_rate: tax_rate || 0,
    mortuary_name: mortuary_name || 'Professional Mortuary Services',
    mortuary_phone: mortuary_phone || '+254 740 045 355',
    stamp_hash,
    signature_url,
    created_at: created_at || getKenyaTimeISO(),
    invoice_number,
  };

  const pdfBuffer = await generateInvoicePDFBuffer(invoiceData);

  const baseInvoicesDir = path.join(__dirname, '../../uploads/invoices');
  if (!fs.existsSync(baseInvoicesDir)) {
    fs.mkdirSync(baseInvoicesDir, { recursive: true });
  }

  const deceasedFolderName = `${deceased_name.replace(/[^a-zA-Z0-9]/g, '_')}_${deceased_id || Date.now()}`;
  const deceasedInvoicesDir = path.join(baseInvoicesDir, deceasedFolderName);

  if (!fs.existsSync(deceasedInvoicesDir)) {
    fs.mkdirSync(deceasedInvoicesDir, { recursive: true });
  }

  const pdfPath = path.join(deceasedInvoicesDir, `${invoice_number}.pdf`);
  await fs.promises.writeFile(pdfPath, pdfBuffer);

  // FIXED: Use correct database schema for invoices table
  const sql = `
    INSERT INTO invoices 
    (deceased_id, invoice_number, items, total_amount, pdf_url, stamp_hash, signature_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await safeQuery(sql, [
    deceased_id || null,
    invoice_number,
    JSON.stringify(items),
    total_amount,
    pdfPath,
    stamp_hash,
    signature_url || null,
    created_at || getKenyaTimeISO(),
  ]);

  invoiceCache.set(invoice_number, invoiceData);

  res.status(201).json({
    status: 'success',
    message: 'Invoice created successfully',
    invoice_number,
    pdf_url: pdfPath,
    invoice_id: result.insertId,
    deceased_folder: deceasedFolderName,
  });
});

// Get all invoices - FIXED to match actual schema
const getAllInvoices = asyncHandler(async (req, res, next) => {
  const sql = `
    SELECT i.*, d.full_name as deceased_name, d.deceased_id 
    FROM invoices i
    LEFT JOIN deceased d ON i.deceased_id = d.id
    ORDER BY i.created_at DESC
  `;
  const invoices = await safeQuery(sql);

  // Parse JSON items and add deceased information
  const parsedInvoices = invoices.map((invoice) => ({
    ...invoice,
    items:
      typeof invoice.items === 'string'
        ? JSON.parse(invoice.items)
        : invoice.items,
    deceased_name: invoice.deceased_name || 'Unknown',
    id_number: invoice.deceased_id || 'N/A',
  }));

  res.json({ status: 'success', data: parsedInvoices });
});

// Get invoices by deceased ID
const getInvoicesByDeceased = asyncHandler(async (req, res, next) => {
  const { deceased_id } = req.params;

  const sql = `
    SELECT i.*, d.full_name as deceased_name, d.deceased_id 
    FROM invoices i
    LEFT JOIN deceased d ON i.deceased_id = d.id
    WHERE i.deceased_id = ? 
    ORDER BY i.created_at DESC
  `;
  const invoices = await safeQuery(sql, [deceased_id]);

  const parsedInvoices = invoices.map((invoice) => ({
    ...invoice,
    items:
      typeof invoice.items === 'string'
        ? JSON.parse(invoice.items)
        : invoice.items,
    deceased_name: invoice.deceased_name || 'Unknown',
    id_number: invoice.deceased_id || 'N/A',
  }));

  res.json({ status: 'success', data: parsedInvoices });
});

// Get invoice by ID
const getInvoiceById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const sql = `
    SELECT i.*, d.full_name as deceased_name, d.deceased_id, d.date_of_death as dod,
           d.location, d.county, d.national_id
    FROM invoices i
    LEFT JOIN deceased d ON i.deceased_id = d.id
    WHERE i.id = ?
  `;
  const invoices = await safeQuery(sql, [id]);

  if (invoices.length === 0) {
    return next(new AppError('Invoice not found', 404));
  }

  const invoice = invoices[0];
  invoice.items =
    typeof invoice.items === 'string'
      ? JSON.parse(invoice.items)
      : invoice.items;

  // Add additional fields for PDF generation
  invoice.deceased_name = invoice.deceased_name || 'Unknown';
  invoice.id_number = invoice.deceased_id || 'N/A';
  invoice.dod = invoice.dod || 'N/A';
  invoice.address = `${invoice.location || 'N/A'}, ${invoice.county || 'N/A'}`;

  res.json({ status: 'success', data: invoice });
});

// Update invoice - FIXED database schema
const updateInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { items, total_amount, signature_url } = req.body;

  const [currentInvoice] = await safeQuery(
    'SELECT * FROM invoices WHERE id = ?',
    [id],
  );
  if (!currentInvoice) {
    return next(new AppError('Invoice not found', 404));
  }

  // Get deceased info for PDF generation
  const deceasedSql = 'SELECT * FROM deceased WHERE id = ?';
  const [deceased] = await safeQuery(deceasedSql, [currentInvoice.deceased_id]);

  const stamp_hash = generateStampHash();

  const updatedInvoice = {
    ...currentInvoice,
    items: items || JSON.parse(currentInvoice.items),
    total_amount: total_amount || currentInvoice.total_amount,
    signature_url: signature_url || currentInvoice.signature_url,
    stamp_hash,
    updated_at: getKenyaTimeISO(),
  };

  // Prepare data for PDF generation
  const pdfData = {
    ...updatedInvoice,
    deceased_name: deceased?.full_name || 'Unknown',
    id_number: deceased?.deceased_id || 'N/A',
    dod: deceased?.date_of_death || 'N/A',
    address: `${deceased?.location || 'N/A'}, ${deceased?.county || 'N/A'}`,
    nok: 'N/A',
    phone: 'N/A',
    mortuary_name: 'Professional Mortuary Services',
    mortuary_phone: '+254 740 045 355',
  };

  const pdfBuffer = await generateInvoicePDFBuffer(pdfData);
  await fs.promises.writeFile(currentInvoice.pdf_url, pdfBuffer);

  const updateSql = `
    UPDATE invoices 
    SET items = ?, total_amount = ?, signature_url = ?, stamp_hash = ?, updated_at = ?
    WHERE id = ?
  `;

  await safeQuery(updateSql, [
    JSON.stringify(updatedInvoice.items),
    updatedInvoice.total_amount,
    updatedInvoice.signature_url,
    updatedInvoice.stamp_hash,
    updatedInvoice.updated_at,
    id,
  ]);

  invoiceCache.set(currentInvoice.invoice_number, updatedInvoice);

  res.json({
    status: 'success',
    message: 'Invoice updated successfully',
    data: updatedInvoice,
  });
});

// Delete invoice
const deleteInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const [invoice] = await safeQuery('SELECT * FROM invoices WHERE id = ?', [
    id,
  ]);
  if (!invoice) {
    return next(new AppError('Invoice not found', 404));
  }

  try {
    if (fs.existsSync(invoice.pdf_url)) {
      await fs.promises.unlink(invoice.pdf_url);
    }
  } catch (error) {
    console.log('PDF file not found, continuing with database deletion');
  }

  await safeQuery('DELETE FROM invoices WHERE id = ?', [id]);
  invoiceCache.del(invoice.invoice_number);

  res.json({
    status: 'success',
    message: 'Invoice deleted successfully',
  });
});

// Download PDF
const downloadInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  const [invoice] = await safeQuery(
    'SELECT pdf_url FROM invoices WHERE id = ?',
    [id],
  );
  if (!invoice || !invoice.pdf_url) {
    return next(new AppError('Invoice or PDF not found', 404));
  }

  if (!fs.existsSync(invoice.pdf_url)) {
    return next(new AppError('PDF file not found', 404));
  }

  res.download(invoice.pdf_url, `invoice-${id}.pdf`);
});

// In your InvoiceDashboard.jsx, add these new handlers:

const handleViewInvoice = async (invoiceId) => {
  setLoading(true);
  try {
    const response = await axios.get(`${API_BASE_URL}/invoices/${invoiceId}`);
    setSelectedInvoice(response.data.data);
    setView('view-invoice');
    showToast('info', 'Invoice details loaded');
  } catch (error) {
    console.error('Error loading invoice:', error);
    showToast('error', 'Error loading invoice details');
  } finally {
    setLoading(false);
  }
};

const handleEditInvoice = async (invoiceId) => {
  setLoading(true);
  try {
    const response = await axios.get(`${API_BASE_URL}/invoices/${invoiceId}`);
    setSelectedInvoice(response.data.data);
    setView('edit-invoice');
    showToast('info', 'Ready to edit invoice');
  } catch (error) {
    console.error('Error loading invoice for editing:', error);
    showToast('error', 'Error loading invoice for editing');
  } finally {
    setLoading(false);
  }
};

const handleDeleteInvoice = async (invoiceId) => {
  try {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Yes, delete it!',
    });

    if (result.isConfirmed) {
      await axios.delete(`${API_BASE_URL}/invoices/${invoiceId}`);
      showToast('success', 'Invoice deleted successfully!');

      // Refresh the financial details
      if (selectedDeceased) {
        const response = await axios.get(
          `${API_BASE_URL}/invoices/deceased-financials/${selectedDeceased.id}`,
        );
        setFinancialDetails(response.data.data);
      }
    }
  } catch (error) {
    console.error('Error deleting invoice:', error);
    showToast('error', 'Error deleting invoice');
  }
};

const handleEditExtraCharge = (charge) => {
  // You can implement edit extra charge functionality here
  console.log('Edit extra charge:', charge);
  showToast('info', 'Edit extra charge functionality to be implemented');
};

const handleDeleteExtraCharge = async (chargeId) => {
  try {
    await axios.delete(`${API_BASE_URL}/extra-charges/${chargeId}`);
    // Refresh the financial details
    if (selectedDeceased) {
      const response = await axios.get(
        `${API_BASE_URL}/invoices/deceased-financials/${selectedDeceased.id}`,
      );
      setFinancialDetails(response.data.data);
    }
  } catch (error) {
    console.error('Error deleting extra charge:', error);
    throw error;
  }
};

// Export all functions at the bottom
module.exports = {
  getAllDeceasedWithFinancials,
  getDeceasedFinancialDetails,
  createPayment,
  createExtraCharge,
  createSystemInvoice,
  createInvoice,
  getAllInvoices,
  getInvoicesByDeceased,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  downloadInvoice,
  handleViewInvoice,
};
