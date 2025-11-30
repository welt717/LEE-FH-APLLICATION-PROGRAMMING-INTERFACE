const { safeQuery } = require('../configurations/sqlConfig/db');
const { getKenyaTimeISO } = require('../../utilities/timeStamps/timeStamps');

// ----------------- Add Extra Charge -----------------
async function addExtraCharge(req, res) {
  const { deceased_id, charge_type, amount, requested_by, notes } = req.body;

  const service_date = getKenyaTimeISO();

  if (!deceased_id || !amount || !service_date) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  // Validate amount
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) {
    return res.status(400).json({ message: 'Amount must be a valid number' });
  }

  // Validate service date
  const serviceDateObj = new Date(service_date);
  if (isNaN(serviceDateObj.getTime())) {
    return res.status(400).json({ message: 'Invalid service date' });
  }

  const created_at = getKenyaTimeISO();
  const updated_at = created_at;

  try {
    const query = `
      INSERT INTO extra_charges 
        (deceased_id, charge_type, amount, requested_by, service_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await safeQuery(query, [
      deceased_id,
      charge_type,
      parsedAmount,
      requested_by || null,
      service_date,
      notes || null,
      created_at,
      updated_at,
    ]);

    return res.status(201).json({
      message: 'Extra charge added successfully',
      id: result.insertId,
    });
  } catch (error) {
    console.error('Error adding extra charge:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// ----------------- Update Extra Charge -----------------
async function updateExtraCharge(req, res) {
  const { id } = req.params;
  const { charge_type, amount, requested_by, service_date, status, notes } =
    req.body;

  if (!charge_type && !amount && !service_date && !status && !notes) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  const fieldsToUpdate = [];
  const valuesToUpdate = [];

  if (charge_type) {
    fieldsToUpdate.push('charge_type = ?');
    valuesToUpdate.push(charge_type);
  }
  if (amount) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount)) {
      return res.status(400).json({ message: 'Amount must be a valid number' });
    }
    fieldsToUpdate.push('amount = ?');
    valuesToUpdate.push(parsedAmount);
  }
  if (requested_by) {
    fieldsToUpdate.push('requested_by = ?');
    valuesToUpdate.push(requested_by);
  }
  if (service_date) {
    const serviceDateObj = new Date(service_date);
    if (isNaN(serviceDateObj.getTime())) {
      return res.status(400).json({ message: 'Invalid service date' });
    }
    fieldsToUpdate.push('service_date = ?');
    valuesToUpdate.push(service_date);
  }
  if (status) {
    fieldsToUpdate.push('status = ?');
    valuesToUpdate.push(status);
  }
  if (notes) {
    fieldsToUpdate.push('notes = ?');
    valuesToUpdate.push(notes);
  }

  // Always update updated_at
  fieldsToUpdate.push('updated_at = ?');
  valuesToUpdate.push(getKenyaTimeISO());

  valuesToUpdate.push(id); // Append the ID for WHERE clause

  try {
    const query = `
      UPDATE extra_charges
      SET ${fieldsToUpdate.join(', ')}
      WHERE id = ?
    `;
    const result = await safeQuery(query, valuesToUpdate);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Extra charge not found' });
    }

    return res
      .status(200)
      .json({ message: 'Extra charge updated successfully' });
  } catch (error) {
    console.error('Error updating extra charge:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// ----------------- Get All Extra Charges for a Deceased -----------------
async function getExtraChargesForDeceased(req, res) {
  const { deceased_id } = req.params;

  if (!deceased_id) {
    return res.status(400).json({ message: 'Deceased ID is required' });
  }

  try {
    const query =
      'SELECT * FROM extra_charges WHERE deceased_id = ? ORDER BY created_at DESC';
    const extraCharges = await safeQuery(query, [deceased_id]);

    return res.status(200).json({ count: extraCharges.length, extraCharges });
  } catch (error) {
    console.error('Error fetching extra charges:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

// ----------------- Delete Extra Charge -----------------
async function deleteExtraCharge(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ message: 'Charge ID is required' });
  }

  try {
    const query = 'DELETE FROM extra_charges WHERE id = ?';
    const result = await safeQuery(query, [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Extra charge not found' });
    }

    return res
      .status(200)
      .json({ message: 'Extra charge deleted successfully' });
  } catch (error) {
    console.error('Error deleting extra charge:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

module.exports = {
  addExtraCharge,
  updateExtraCharge,
  getExtraChargesForDeceased,
  deleteExtraCharge,
};
