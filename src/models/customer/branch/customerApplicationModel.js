const pool = require("../../../config/db");

const clientApplication = {
  // Method to check if an email has been used before
  isEmailUsedBefore: (email, callback) => {
    // Step 1: Check if the email exists in customer_applications
    const emailCheckSql = `
    SELECT COUNT(*) as count
    FROM \`customer_applications\`
    WHERE \`email\` = ?
  `;

    pool.query(emailCheckSql, [email], (err, emailCheckResults) => {
      if (err) {
        console.error("Error checking email in customer_applications:", err);
        return callback(err, null);
      }

      // Check if the email exists
      const emailExists = emailCheckResults[0].count > 0;
      return callback(null, emailExists);
    });
  },

  // Method to create a new client application
  create: (data, callback) => {
    const {
      branch_id,
      name,
      employee_id,
      mobile_number,
      email,
      services,
      package,
    } = data;

    const sql = `
        INSERT INTO \`client_applications\` (
          \`branch_id\`,
          \`name\`,
          \`employee_id\`,
          \`mobile_number\`,
          \`email\`,
          \`services\`,
          \`package\`
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

    const values = [
      branch_id,
      name,
      employee_id,
      mobile_number,
      email,
      services || "",
      package || "",
    ];

    pool.query(sql, values, (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback(err, null);
      }
      callback(null, results);
    });
  },

  list: (branch_id, callback) => {
    const sql = "SELECT * FROM `client_applications` WHERE `branch_id` = ?";
    pool.query(sql, [branch_id], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback(err, null);
      }
      callback(null, results);
    });
  },

  checkUniqueEmpId: (clientUniqueEmpId, callback) => {
    const sql = `
      SELECT COUNT(*) AS count
      FROM \`client_applications\`
      WHERE \`employee_id\` = ?
    `;
    pool.query(sql, [clientUniqueEmpId], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback({ message: "Database query error", error: err }, null);
      }

      const count = results[0].count;
      callback(null, count > 0);
    });
  },

  checkUniqueEmpIdByClientApplicationID: (
    application_id,
    clientUniqueEmpId,
    callback
  ) => {
    const sql = `
      SELECT COUNT(*) AS count
      FROM \`client_applications\`
      WHERE \`employee_id\` = ? AND id = ?
    `;
    pool.query(sql, [clientUniqueEmpId, application_id], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback({ message: "Database query error", error: err }, null);
      }

      const count = results[0].count;
      callback(null, count > 0);
    });
  },

  getClientApplicationById: (id, callback) => {
    const sql = "SELECT * FROM `client_applications` WHERE id = ?";
    pool.query(sql, [id], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback(err, null);
      }
      callback(null, results[0]);
    });
  },

  update: (data, client_application_id, callback) => {
    const {
      name,
      attach_documents,
      employee_id,
      spoc,
      location,
      batch_number,
      sub_client,
      photo,
    } = data;

    const sql = `
      UPDATE \`client_applications\`
      SET
        \`name\` = ?,
        \`attach_documents\` = ?,
        \`employee_id\` = ?,
        \`spoc\` = ?,
        \`location\` = ?,
        \`batch_number\` = ?,
        \`sub_client\` = ?,
        \`photo\` = ?
      WHERE
        \`id\` = ?
    `;

    const values = [
      name,
      attach_documents,
      employee_id,
      spoc,
      location,
      batch_number,
      sub_client,
      photo,
      client_application_id,
    ];

    pool.query(sql, values, (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback(err, null);
      }
      callback(null, results);
    });
  },

  delete: (id, callback) => {
    const sql = "DELETE FROM `client_applications` WHERE `id` = ?";
    pool.query(sql, [id], (err, results) => {
      if (err) {
        console.error("Database query error:", err);
        return callback(err, null);
      }
      callback(null, results);
    });
  },
};

module.exports = clientApplication;