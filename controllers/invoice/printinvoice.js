// controllers/printController.js
const asyncHandler = require('express-async-handler');
const { safeQuery } = require('../../configurations/sqlConfig/db');
const { AppError } = require('../../middlewares/errorHandler/errorHandler');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');
escpos.Network = require('escpos-network');
const Bluetooth = require('node-bluetooth-serial');

// Print invoice to any available printer
const printInvoice = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Get invoice data
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

  try {
    // Try to print using different methods
    const printResult = await attemptPrint(invoice);

    res.json({
      status: 'success',
      message: 'Invoice sent to printer successfully',
      data: {
        invoice_number: invoice.invoice_number,
        print_method: printResult.method,
        printer_type: printResult.type,
      },
    });
  } catch (printError) {
    console.error('Printing failed:', printError);
    return next(new AppError(`Printing failed: ${printError.message}`, 500));
  }
});

// Attempt different printing methods
const attemptPrint = async (invoice) => {
  const printMethods = [
    attemptUSBPrint,
    attemptNetworkPrint,
    attemptBluetoothPrint,
    attemptDefaultPrint,
  ];

  for (const method of printMethods) {
    try {
      const result = await method(invoice);
      if (result.success) {
        return result;
      }
    } catch (error) {
      console.log(`Print method ${method.name} failed:`, error.message);
      continue;
    }
  }

  throw new Error(
    'No available printers found. Please check printer connections.',
  );
};

// USB Printer
const attemptUSBPrint = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const device = new escpos.USB();
      const printer = new escpos.Printer(device);

      device.open((error) => {
        if (error) {
          reject(new Error('USB printer not found'));
          return;
        }

        printer
          .font('a')
          .align('ct')
          .style('bu')
          .size(1, 1)
          .text('MORTUARY SERVICES INVOICE')
          .text('----------------------------')
          .align('lt')
          .size(0, 0)
          .text(`Invoice: ${invoice.invoice_number}`)
          .text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`)
          .text(`Deceased: ${invoice.deceased_name}`)
          .text(`ID: ${invoice.deceased_id}`)
          .text('----------------------------')
          .align('ct')
          .text('ITEMS')
          .align('lt')
          .text('----------------------------');

        // Print items
        invoice.items.forEach((item, index) => {
          printer
            .text(`${item.service}`)
            .text(`  Qty: ${item.qty} x KES ${item.amount}`)
            .text(`  Total: KES ${(item.qty * item.amount).toFixed(2)}`);
        });

        printer
          .text('----------------------------')
          .align('rt')
          .style('b')
          .text(`TOTAL: KES ${invoice.total_amount}`)
          .align('lt')
          .style('normal')
          .text(' ')
          .text('Thank you for your business!')
          .text(' ')
          .cut()
          .close();

        resolve({
          success: true,
          method: 'USB Printer',
          type: 'USB',
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

// Network Printer (Wireless/Ethernet)
const attemptNetworkPrint = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      // Common network printer IPs - you can extend this list
      const printerIPs = ['192.168.1.100', '192.168.1.101', '192.168.1.102'];
      let connected = false;

      const tryConnect = (ipIndex = 0) => {
        if (ipIndex >= printerIPs.length) {
          reject(new Error('No network printers found'));
          return;
        }

        const device = new escpos.Network(printerIPs[ipIndex]);
        const printer = new escpos.Printer(device);

        device.open((error) => {
          if (error) {
            tryConnect(ipIndex + 1);
            return;
          }

          connected = true;
          printNetworkInvoice(printer, invoice);

          resolve({
            success: true,
            method: 'Network Printer',
            type: 'Network',
            ip: printerIPs[ipIndex],
          });
        });
      };

      tryConnect();
    } catch (error) {
      reject(error);
    }
  });
};

const printNetworkInvoice = (printer, invoice) => {
  printer
    .font('a')
    .align('ct')
    .style('bu')
    .size(1, 1)
    .text('MORTUARY SERVICES INVOICE')
    .text('----------------------------')
    .align('lt')
    .size(0, 0)
    .text(`Invoice: ${invoice.invoice_number}`)
    .text(`Date: ${new Date(invoice.created_at).toLocaleDateString()}`)
    .text(`Deceased: ${invoice.deceased_name}`)
    .text(`ID: ${invoice.deceased_id}`)
    .text('----------------------------')
    .align('ct')
    .text('ITEMS')
    .align('lt')
    .text('----------------------------');

  invoice.items.forEach((item) => {
    printer
      .text(`${item.service}`)
      .text(`  Qty: ${item.qty} x KES ${item.amount}`)
      .text(`  Total: KES ${(item.qty * item.amount).toFixed(2)}`);
  });

  printer
    .text('----------------------------')
    .align('rt')
    .style('b')
    .text(`TOTAL: KES ${invoice.total_amount}`)
    .cut()
    .close();
};

// Bluetooth Printer
const attemptBluetoothPrint = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      const bluetooth = new Bluetooth();

      // Try to discover and connect to Bluetooth printers
      bluetooth.listPairedDevices((error, devices) => {
        if (error) {
          reject(new Error('Bluetooth not available'));
          return;
        }

        const printerDevice = devices.find(
          (device) =>
            device.name.toLowerCase().includes('printer') ||
            device.name.toLowerCase().includes('bt') ||
            device.name.toLowerCase().includes('pos'),
        );

        if (!printerDevice) {
          reject(new Error('No Bluetooth printers found'));
          return;
        }

        bluetooth.connect(printerDevice.address, (error) => {
          if (error) {
            reject(new Error('Failed to connect to Bluetooth printer'));
            return;
          }

          // Simple text printing for Bluetooth
          const printText = generateBluetoothPrintText(invoice);
          bluetooth.write(Buffer.from(printText, 'utf8'), (error) => {
            if (error) {
              reject(new Error('Failed to print via Bluetooth'));
              return;
            }

            bluetooth.close();
            resolve({
              success: true,
              method: 'Bluetooth Printer',
              type: 'Bluetooth',
              device: printerDevice.name,
            });
          });
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

const generateBluetoothPrintText = (invoice) => {
  let text = '\x1B\x40'; // Initialize printer
  text += '\x1B\x61\x01'; // Center align
  text += 'MORTUARY SERVICES INVOICE\n\n';
  text += '\x1B\x61\x00'; // Left align
  text += `Invoice: ${invoice.invoice_number}\n`;
  text += `Date: ${new Date(invoice.created_at).toLocaleDateString()}\n`;
  text += `Deceased: ${invoice.deceased_name}\n`;
  text += `ID: ${invoice.deceased_id}\n`;
  text += '------------------------------\n';
  text += '\x1B\x61\x01'; // Center align
  text += 'ITEMS\n';
  text += '\x1B\x61\x00'; // Left align
  text += '------------------------------\n';

  invoice.items.forEach((item) => {
    text += `${item.service}\n`;
    text += `  Qty: ${item.qty} x KES ${item.amount}\n`;
    text += `  Total: KES ${(item.qty * item.amount).toFixed(2)}\n`;
  });

  text += '------------------------------\n';
  text += '\x1B\x61\x02'; // Right align
  text += `TOTAL: KES ${invoice.total_amount}\n\n`;
  text += '\x1B\x61\x01'; // Center align
  text += 'Thank you!\n\n\n\n';
  text += '\x1B\x69'; // Cut paper

  return text;
};

// Default System Printer (Fallback)
const attemptDefaultPrint = async (invoice) => {
  return new Promise((resolve, reject) => {
    try {
      // This will use the system's default printer
      const printText = generatePrintText(invoice);

      // For Node.js, we can use child_process to send to system printer
      const { exec } = require('child_process');

      // Different commands for different OS
      const commands = {
        win32: `echo "${printText}" | print`,
        linux: `echo "${printText}" | lpr`,
        darwin: `echo "${printText}" | lpr`,
      };

      const command = commands[process.platform] || commands.linux;

      exec(command, (error, stdout, stderr) => {
        if (error) {
          reject(new Error('System printer not available'));
          return;
        }

        resolve({
          success: true,
          method: 'System Default Printer',
          type: 'System',
        });
      });
    } catch (error) {
      reject(error);
    }
  });
};

const generatePrintText = (invoice) => {
  let text = 'MORTUARY SERVICES INVOICE\n';
  text += '==============================\n\n';
  text += `Invoice: ${invoice.invoice_number}\n`;
  text += `Date: ${new Date(invoice.created_at).toLocaleDateString()}\n`;
  text += `Deceased: ${invoice.deceased_name}\n`;
  text += `ID: ${invoice.deceased_id}\n\n`;
  text += 'ITEMS:\n';
  text += '------------------------------\n';

  invoice.items.forEach((item) => {
    text += `${item.service}\n`;
    text += `  Quantity: ${item.qty}\n`;
    text += `  Unit Price: KES ${item.amount}\n`;
    text += `  Line Total: KES ${(item.qty * item.amount).toFixed(2)}\n\n`;
  });

  text += '------------------------------\n';
  text += `TOTAL AMOUNT: KES ${invoice.total_amount}\n\n`;
  text += 'Thank you for your business!\n';

  return text;
};

module.exports = {
  printInvoice,
};
